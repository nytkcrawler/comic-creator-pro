import "dotenv/config";
import express from "express";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const allowedPanels = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 12]);
const allowedProviders = new Set(["openai", "venice", "replicate"]);

app.use(express.json({ limit: "25mb" }));

function clip(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

function buildComicPrompt(config, maxLength = 30000) {
  const panels = allowedPanels.has(Number(config.panels)) ? Number(config.panels) : 4;
  const dialogue = config.dialogue === "No Text"
    ? "No speech bubbles, captions or written text."
    : "Use legible speech bubbles and narration only where selected; assign every line to the correct character and spell it correctly.";
  const prompt = [
    "Create ONE complete, cohesive comic PAGE AS A SINGLE IMAGE, not a set of images. Show EXACTLY " + panels + " distinct bordered panels, no more and no less. Make reading order obvious.",
    "Art style: " + clip(config.style, 90) + ". Genre: " + clip(config.genre, 55) + ".",
    "Layout: " + clip(config.layout, 65) + ". Aspect ratio: " + clip(config.ratio, 25) + ".",
    "Mood: " + clip(config.mood, 35) + ". Colors: " + clip(config.color, 55) + ". Detail: " + clip(config.detail, 35) + ". Ending: " + clip(config.ending, 45) + ".",
    "Scene: " + clip(config.scene, 260),
    "Character identity lock: " + clip(config.characters, 220),
    "Outfit continuity: " + clip(config.outfit, 120),
    "Use cinematic pacing with varied wide, medium, close-up and reaction shots. Every panel advances the same story. Keep faces, body proportions, hairstyles, clothes, props, location and lighting consistent. Use clean gutters and professional composition.",
    dialogue,
    "The entire page and all panels must be rendered inside this ONE image. Do not generate separate panels, extra pages, alternatives, thumbnails or contact sheets.",
    config.adultMode
      ? "All fictional characters must be clearly adults. Follow the image provider's own content policy."
      : "Follow the image provider's content policy. All characters must be clearly adults."
  ].join("\n\n");
  // The Venice OpenAI-compatible endpoint has a 1,500-character prompt limit.
  return prompt.slice(0, maxLength);
}

function veniceSizeForRatio(ratio) {
  switch (ratio) {
    case "Landscape 16:9": return "1792x1024";
    case "Vertical 9:16": return "1024x1792";
    case "Square 1:1": return "1024x1024";
    case "Portrait 3:4": return "1024x1536";
    case "Portrait 2:3":
    case "Comic Page A4":
    default: return "1024x1536";
  }
}

function parseExtraInput() {
  try {
    const value = JSON.parse(process.env.REPLICATE_EXTRA_INPUT_JSON || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    throw new Error("REPLICATE_EXTRA_INPUT_JSON must contain a valid JSON object.");
  }
}

function imageFromReplicateOutput(output) {
  const first = Array.isArray(output) ? output[0] : output;
  if (!first) return null;
  if (typeof first === "string") return first;
  if (typeof first?.url === "string") return first.url;
  return null;
}


function createUserSupabaseClient(accessToken) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is missing.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: "Bearer " + accessToken } }
  });
}

async function requireAuthenticatedUser(req, res, next) {
  try {
    const authorization = req.headers.authorization || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!token) return res.status(401).json({ error: "Sign in before using comic generation." });
    const client = createUserSupabaseClient(token);
    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: "Your session has expired. Please sign in again." });
    req.user = data.user;
    req.userSupabase = client;
    next();
  } catch (error) {
    console.error("[auth-check]", error);
    res.status(503).json({ error: error.message || "Could not verify your session." });
  }
}

function validateGenerationRequest(req, res, next) {
  const { provider, config = {} } = req.body || {};
  if (!allowedProviders.has(provider)) return res.status(400).json({ error: "Choose OpenAI, Venice or Replicate." });
  if (typeof config.scene !== "string" || !config.scene.trim()) {
    return res.status(400).json({ error: "Describe the comic scene before generating." });
  }
  if (!allowedPanels.has(Number(config.panels))) {
    return res.status(400).json({ error: "Choose a supported panel count." });
  }
  if (provider === "openai" && !process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: "OpenAI API key is not configured yet. Add OPENAI_API_KEY in Vercel before generating." });
  }
  if (provider === "venice" && !process.env.VENICE_API_KEY) {
    return res.status(503).json({ error: "Venice API key is not configured yet." });
  }
  if (provider === "replicate" && !(process.env.REPLICATE_API_TOKEN && process.env.REPLICATE_MODEL_OWNER && process.env.REPLICATE_MODEL_NAME)) {
    return res.status(503).json({ error: "Replicate API token and model settings are not configured yet." });
  }
  next();
}

function requireOpenAIConfigured(req, res, next) {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: "OpenAI API key is not configured yet. Add OPENAI_API_KEY in Vercel before refining." });
  }
  next();
}

async function enforceGenerationLimit(req, res, next) {
  try {
    const { data, error } = await req.userSupabase.rpc("reserve_generation");
    if (error) {
      console.error("[generation-quota]", error);
      return res.status(503).json({ error: "Could not verify your generation allowance. Please try again." });
    }
    if (!data?.allowed) {
      return res.status(429).json({
        error: "You've reached the current beta limit of 10 generated pages per hour. Please try again after the limit resets.",
        quota: data
      });
    }
    req.generationQuota = data;
    next();
  } catch (error) {
    console.error("[generation-quota]", error);
    res.status(503).json({ error: "Could not verify your generation allowance." });
  }
}

function openAiInputImages(referenceImages) {
  if (!Array.isArray(referenceImages)) return [];
  return referenceImages
    .filter(value => typeof value === "string" && /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(value))
    .slice(0, 4)
    .map(imageUrl => ({ type: "input_image", image_url: imageUrl, detail: "auto" }));
}

async function generateWithOpenAI(prompt, config, previousResponseId = null, refinement = null) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is missing on the server. Add it in Vercel Environment Variables to enable OpenAI generation.");

  const inputContent = [];
  if (refinement) {
    inputContent.push({ type: "input_text", text: "Refine the previously generated comic page using this instruction. Preserve the established character identities, panel count and story continuity.\n\nRefinement: " + clip(refinement, 2000) });
  } else {
    inputContent.push({ type: "input_text", text: prompt });
    inputContent.push(...openAiInputImages(config.referenceImages));
  }

  const requestBody = {
    model: process.env.OPENAI_RESPONSE_MODEL || "gpt-5.5",
    input: [{ role: "user", content: inputContent }],
    tools: [{
      type: "image_generation",
      action: refinement ? "auto" : "generate"
    }],
    store: true
  };
  if (previousResponseId) requestBody.previous_response_id = previousResponseId;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify(requestBody)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error?.message || data.message || "OpenAI image generation failed (" + response.status + ").";
    throw new Error(message);
  }

  const imageCall = (data.output || []).find(item => item.type === "image_generation_call" && item.result);
  if (!imageCall?.result) {
    throw new Error(data.output_text || "OpenAI completed without returning a comic image.");
  }

  return {
    image: "data:image/png;base64," + imageCall.result,
    status: "succeeded",
    responseId: data.id,
    generationMode: "single-full-page",
    pageImageCount: 1
  };
}

async function generateWithVenice(prompt, config, model) {
  const key = process.env.VENICE_API_KEY;
  if (!key) throw new Error("VENICE_API_KEY is missing on the server.");
  const moderation = config.adultMode && process.env.VENICE_MODERATION === "low" ? "low" : "auto";
  const response = await fetch("https://api.venice.ai/api/v1/images/generations", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model || process.env.VENICE_IMAGE_MODEL || "z-image-turbo",
      prompt,
      n: 1,
      size: veniceSizeForRatio(config.ratio),
      response_format: "b64_json",
      output_format: "png",
      moderation
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || data.message || "Venice image generation failed (" + response.status + ").");
  const item = data.data?.[0];
  const image = item?.url || (item?.b64_json ? "data:image/png;base64," + item.b64_json : null);
  if (!image) throw new Error("Venice returned no image. Check the selected model and output settings.");
  return { image, blurred: Boolean(item?.blurred), generationMode: "single-full-page", pageImageCount: 1 };
}

async function generateWithReplicate(prompt, config) {
  const token = process.env.REPLICATE_API_TOKEN;
  const owner = process.env.REPLICATE_MODEL_OWNER;
  const name = process.env.REPLICATE_MODEL_NAME;
  const version = process.env.REPLICATE_MODEL_VERSION;
  if (!token || !owner || !name) throw new Error("Set REPLICATE_API_TOKEN, REPLICATE_MODEL_OWNER and REPLICATE_MODEL_NAME on the server.");
  const input = { ...parseExtraInput(), prompt, num_outputs: 1 };
  const referenceKey = process.env.REPLICATE_REFERENCE_INPUT_KEY;
  const references = Array.isArray(config.referenceImages)
    ? config.referenceImages.filter(x => typeof x === "string" && (x.startsWith("https://") || x.startsWith("data:image/")))
    : [];
  if (referenceKey && references.length) input[referenceKey] = references.length === 1 ? references[0] : references;

  const url = version
    ? "https://api.replicate.com/v1/predictions"
    : "https://api.replicate.com/v1/models/" + encodeURIComponent(owner) + "/" + encodeURIComponent(name) + "/predictions";
  const body = version ? { version, input } : { input };
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", Prefer: "wait=1" },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || data.error || "Replicate could not start a prediction (" + response.status + ").");
  if (data.status === "succeeded") {
    const image = imageFromReplicateOutput(data.output);
    if (!image) throw new Error("Replicate completed without returning an image.");
    return { image, status: "succeeded", generationMode: "single-full-page", pageImageCount: 1 };
  }
  return { predictionId: data.id, status: data.status || "starting", generationMode: "single-full-page", pageImageCount: 1 };
}

app.get("/api/health", (_req, res) => {
  res.json({
    openai: Boolean(process.env.OPENAI_API_KEY),
    venice: Boolean(process.env.VENICE_API_KEY),
    replicate: Boolean(process.env.REPLICATE_API_TOKEN && process.env.REPLICATE_MODEL_OWNER && process.env.REPLICATE_MODEL_NAME),
    generationMode: "single-full-page",
    pageImageCount: 1
  });
});

app.post("/api/generate", requireAuthenticatedUser, validateGenerationRequest, enforceGenerationLimit, async (req, res) => {
  try {
    const { provider, config = {}, veniceModel, previousResponseId, refinement } = req.body || {};
    if (!allowedProviders.has(provider)) return res.status(400).json({ error: "Choose OpenAI, Venice or Replicate." });
    if (typeof config.scene !== "string" || !config.scene.trim()) return res.status(400).json({ error: "Describe the comic scene before generating." });
    const panels = Number(config.panels);
    if (!allowedPanels.has(panels)) return res.status(400).json({ error: "Choose a supported panel count." });
    const prompt = buildComicPrompt({ ...config, panels }, provider === "venice" ? 1490 : 30000);
    const result = provider === "openai"
      ? await generateWithOpenAI(prompt, config, previousResponseId || null, refinement || null)
      : provider === "venice"
        ? await generateWithVenice(prompt, config, veniceModel)
        : await generateWithReplicate(prompt, config);
    res.json({ ...result, quota: req.generationQuota });
  } catch (error) {
    console.error("[comic-generate]", error);
    res.status(502).json({ error: error.message || "Image generation failed." });
  }
});


app.post("/api/refine", requireAuthenticatedUser, requireOpenAIConfigured, enforceGenerationLimit, async (req, res) => {
  try {
    const { comicId, instruction } = req.body || {};
    if (typeof comicId !== "string" || !comicId.trim()) {
      return res.status(400).json({ error: "Choose a saved OpenAI comic to refine." });
    }
    if (typeof instruction !== "string" || !instruction.trim()) {
      return res.status(400).json({ error: "Describe the change you want to make." });
    }

    const { data: comic, error: comicError } = await req.userSupabase
      .from("comics")
      .select("generation_config")
      .eq("id", comicId)
      .single();

    if (comicError || !comic) return res.status(404).json({ error: "Saved comic not found." });

    const generationConfig = comic.generation_config || {};
    if (generationConfig.provider !== "openai" || !generationConfig.responseId) {
      return res.status(400).json({ error: "This comic does not have an OpenAI editing session. Generate it with OpenAI first." });
    }

    const result = await generateWithOpenAI(
      "",
      generationConfig,
      generationConfig.responseId,
      instruction
    );

    res.json({ ...result, quota: req.generationQuota });
  } catch (error) {
    console.error("[comic-refine]", error);
    res.status(502).json({ error: error.message || "Comic refinement failed." });
  }
});

app.get("/api/replicate/:id", requireAuthenticatedUser, async (req, res) => {
  try {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) return res.status(503).json({ error: "REPLICATE_API_TOKEN is missing on the server." });
    const response = await fetch("https://api.replicate.com/v1/predictions/" + encodeURIComponent(req.params.id), {
      headers: { Authorization: "Bearer " + token }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(response.status).json({ error: data.detail || "Could not read Replicate prediction." });
    const image = data.status === "succeeded" ? imageFromReplicateOutput(data.output) : null;
    res.json({
      id: data.id,
      status: data.status,
      image,
      error: data.error || null,
      generationMode: "single-full-page",
      pageImageCount: 1
    });
  } catch (error) {
    res.status(502).json({ error: error.message || "Replicate status check failed." });
  }
});

const distDir = path.resolve(__dirname, "../dist");
app.use(express.static(distDir));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(distDir, "index.html"), error => error && next(error));
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => console.log("Comic Creator Pro server listening on port " + PORT));
}

export default app;
