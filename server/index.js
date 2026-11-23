import "dotenv/config";
import express from "express";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { selectProviderModel } from "./provider-router.js";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const allowedPanels = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 12]);
const allowedProviders = new Set(["openai", "venice", "replicate"]);

app.use(express.json({ limit: "25mb" }));

function clip(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

function adaptivePanelComposition(panels) {
  const plans = {
    1: "ONE full-page splash panel, edge-to-edge artwork, no internal gutters.",
    2: "ONE dominant full-width upper panel (about 60% page height) and ONE shorter cinematic lower panel.",
    3: "ONE large full-width establishing/hero panel across the top (about 45%); TWO contrasting panels side-by-side below.",
    4: "ONE wide dominant top panel (about 34%); TWO unequal middle panels; ONE wide dramatic closing panel across the bottom.",
    5: "ONE wide hero panel at top; TWO unequal panels in the middle row; TWO lower panels with different widths for reaction and payoff.",
    6: "ONE wide opening panel; TWO middle panels side-by-side; TWO lower panels with an asymmetrical split; ONE wide closing strip. Vary heights to pace the action.",
    7: "ONE wide opening panel; TWO middle panels; TWO dynamic angled action/reaction panels; TWO lower panels, with the final panel visually emphasized.",
    8: "REFERENCE PAGE RHYTHM: ONE large full-width opening panel across the top (roughly 28-32%); TWO middle panels with unequal widths; TWO larger lower-middle panels with a diagonal or slanted gutter; TWO bottom panels with a close-up/reaction panel and a romantic/emotional payoff. Keep all seven gutters clear and reading order unmistakable.",
    9: "ONE wide opening panel; TWO unequal panels beneath; THREE varied panels in the central action row; TWO lower reaction panels; ONE wide final payoff panel.",
    12: "ONE wide opening panel; THREE varied panels in the next row; THREE varied action/reaction panels in the middle; THREE narrower cinematic beats in the next row; TWO wider closing panels. Use varied widths/heights and occasional diagonal gutters, never a uniform grid."
  };
  return plans[panels] || "Use a varied, asymmetrical editorial composition with one dominant hero panel, varied supporting panels and a clear final beat.";
}

function buildComicPrompt(config, maxLength = 30000) {
  const panels = allowedPanels.has(Number(config.panels)) ? Number(config.panels) : 4;
  const dialogue = config.dialogue === "No Text"
    ? "No speech bubbles, captions or written text."
    : "Use legible speech bubbles and narration only where selected; assign every line to the correct character and spell it correctly.";
  const prompt = [
    "NON-NEGOTIABLE OUTPUT CONTRACT: Create exactly ONE finished comic page as ONE raster image from ONE image-generation call. The image itself must contain all " + panels + " panels. Never make one image per panel, never call the image generator in a loop, never create alternative outputs, and never stitch, collage, composite or assemble separately generated panel images. Return exactly one final image file.",
    "PANEL COUNT: Show EXACTLY " + panels + " distinct comic panels, no more and no less. Count the complete bordered regions. Do not add inset panels or split a panel unless that split is included in the requested count. Keep gutters/borders clean and reading order immediately obvious.",
    "ADAPTIVE PAGE COMPOSITION: " + adaptivePanelComposition(panels),
    "REFERENCE COMPOSITION LANGUAGE: Use a portrait comic-page canvas inspired by the supplied example: a large cinematic opening panel, varied asymmetrical panel widths and heights, selective diagonal/slanted gutters for dramatic beats, close-up reaction inserts, and a strong bottom/last-panel emotional payoff. The layout must reflow intelligently for the selected panel count rather than stretching one fixed template. Avoid a regular spreadsheet grid unless the user explicitly selects Classic Grid.",
    "PANEL GEOMETRY: Allocate more area to important story beats; use wide establishing panels, medium action panels, tight facial/emotional close-ups and reaction panels. Keep every panel fully inside the page with visible gutters. Never crop a panel off the canvas. Preserve an obvious top-to-bottom, left-to-right reading path.",
    "Art style preset: " + clip(config.style, 110) + ".",
    "Art tradition: " + clip(config.artTradition, 80) + ". Rendering technique: " + clip(config.renderingTechnique, 90) + ". Visual treatment: " + clip(config.visualTreatment, 90) + ".",
    "Genre: " + clip(config.genre, 65) + (config.adultMode ? ". Adult subgenre: " + clip(config.adultSubgenre, 60) + "." : "."),
    "Layout preference: " + clip(config.layout, 65) + ". Apply the adaptive panel composition plan for the exact panel count while respecting this preference. Aspect ratio: " + clip(config.ratio, 25) + ".",
    "Mood: " + clip(config.mood, 35) + ". Colors: " + clip(config.color, 55) + ". Detail: " + clip(config.detail, 35) + ". Ending: " + clip(config.ending, 45) + ".",
    config.adultMode ? "Mature creative direction: sensuality " + clip(config.sensuality, 20) + "; intimacy " + clip(config.intimacy, 65) + "; artistic figure treatment " + clip(config.nudityTreatment, 100) + ". Keep all depictions non-explicit and within provider policy." : "",
    "Scene: " + clip(config.scene, 260),
    (config.identityLock !== false ? "STRICT CHARACTER IDENTITY LOCK (" + clip(config.identityPriority || "Strict identity lock", 40) + "): " : "Character continuity: ") + clip(config.characters, 260),
    "Outfit continuity: " + clip(config.outfit, 140),
    "Reference assignment: " + (Array.isArray(config.referenceManifest) ? config.referenceManifest.slice(0,4).map((ref,index) => "Image " + (index + 1) + " = " + clip(ref.character, 30) + ", " + clip(ref.view, 40) + ", file " + clip(ref.name, 60)).join("; ") : "Use attached references in upload order.") + ". Preserve each character's own face; never swap identities.",
    "Use cinematic pacing with varied wide, medium, close-up and reaction shots. Every panel advances the same story. Keep faces, body proportions, hairstyles, clothes, props, location and lighting consistent. Use clean gutters and professional composition. The layout is a single unified page design, not a collection of independent images.",
    dialogue,
    "FINAL OUTPUT CHECK: Render the entire page and all panels together inside this ONE image. Exactly one generation call, exactly one image output, exactly " + panels + " panels. No separate panel files, no extra pages, no alternatives, no thumbnails, no contact sheets and no post-generation stitching.",
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
  const { selection = { mode: "manual", provider: req.body?.provider }, config = {} } = req.body || {};
  if (!["auto", "manual"].includes(selection.mode)) return res.status(400).json({ error: "Choose automatic routing or a manual provider." });
  if (selection.mode === "manual" && !allowedProviders.has(selection.provider)) return res.status(400).json({ error: "Choose OpenAI, Venice or Replicate." });
  if (typeof config.scene !== "string" || !config.scene.trim()) {
    return res.status(400).json({ error: "Describe the comic scene before generating." });
  }
  if (!allowedPanels.has(Number(config.panels))) {
    return res.status(400).json({ error: "Choose a supported panel count." });
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

async function generateWithOpenAI(prompt, config, modelKey, previousResponseId = null, refinement = null) {
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
    model: modelKey,
    input: [{ role: "user", content: inputContent }],
    tools: [{
      type: "image_generation",
      action: refinement ? "auto" : "generate"
    }],
    tool_choice: { type: "image_generation" },
    parallel_tool_calls: false,
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

  const imageCalls = (data.output || []).filter(item => item.type === "image_generation_call" && item.result);
  if (imageCalls.length !== 1) {
    throw new Error(data.output_text || "OpenAI must return exactly one complete comic-page image. Please retry.");
  }
  const imageCall = imageCalls[0];

  return {
    image: "data:image/png;base64," + imageCall.result,
    status: "succeeded",
    responseId: data.id,
    generationMode: "single-full-page",
    pageImageCount: 1
  };
}

async function generateWithVenice(prompt, config, modelKey) {
  const key = process.env.VENICE_API_KEY;
  if (!key) throw new Error("VENICE_API_KEY is missing on the server.");
  const moderation = config.adultMode && process.env.VENICE_MODERATION === "low" ? "low" : "auto";
  const response = await fetch("https://api.venice.ai/api/v1/images/generations", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelKey,
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

async function generateWithReplicate(prompt, config, modelKey) {
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

  const [selectedOwner, selectedName] = String(modelKey || "").split("/");
  if (selectedOwner !== owner || selectedName !== name) throw new Error("Selected Replicate model does not match the server's configured model.");
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
  let jobId = null;
  const startedAt = Date.now();
  try {
    const { selection = { mode: "manual", provider: req.body?.provider }, config = {}, previousResponseId, refinement } = req.body || {};
    if (typeof config.scene !== "string" || !config.scene.trim()) return res.status(400).json({ error: "Describe the comic scene before generating." });
    const panels = Number(config.panels);
    if (!allowedPanels.has(panels)) return res.status(400).json({ error: "Choose a supported panel count." });

    const style = clip(config.style, 110);
    const contentCategory = config.adultMode ? "mature" : "general";
    const referenceCount = Array.isArray(config.referenceImages) ? config.referenceImages.length : 0;
    const { data: models, error: modelsError } = await req.userSupabase.from("provider_models").select("*").eq("enabled", true);
    if (modelsError) throw new Error("Could not load the enabled provider model registry.");
    const { data: routingRules, error: rulesError } = await req.userSupabase.from("model_routing_rules").select("*").eq("enabled", true)
      .eq("style_key", style).eq("content_category", contentCategory);
    if (rulesError) throw new Error("Could not load provider routing preferences.");

    const chosen = selectProviderModel(models || [], {
      mode: selection.mode, provider: selection.provider, style, contentCategory,
      aspectRatio: clip(config.ratio, 25), referenceCount, isEdit: Boolean(refinement),
      routingRules: routingRules || []
    });
    if (!chosen) return res.status(409).json({
      error: selection.mode === "auto"
        ? "No compatible model is enabled for automatic routing. Enable a verified model in Provider Models with matching style, aspect-ratio and reference-image capabilities."
        : "No compatible enabled model is configured for that provider. Check its registry entry, credentials and capabilities."
    });

    const prompt = buildComicPrompt({ ...config, panels }, chosen.provider_key === "venice" ? 1490 : 30000);
    const idempotencyKey = clip(req.headers["idempotency-key"], 120) || randomUUID();
    const { data: job, error: jobError } = await req.userSupabase.from("generation_jobs").insert({
      user_id: req.user.id, provider_model_id: chosen.id, provider_key: chosen.provider_key,
      model_key: chosen.model_key, status: "processing",
      request_payload: { style, panel_count: panels, content_category: contentCategory, aspect_ratio: clip(config.ratio, 25), reference_count: referenceCount, selection_mode: selection.mode },
      idempotency_key: idempotencyKey, started_at: new Date().toISOString()
    }).select("id").single();
    if (jobError) throw new Error("Could not create the generation job record.");
    jobId = job.id;

    const result = chosen.provider_key === "openai"
      ? await generateWithOpenAI(prompt, config, chosen.model_key, previousResponseId || null, refinement || null)
      : chosen.provider_key === "venice"
        ? await generateWithVenice(prompt, config, chosen.model_key)
        : await generateWithReplicate(prompt, config, chosen.model_key);

    const elapsed = Date.now() - startedAt;
    const finalStatus = result.image ? "completed" : "processing";
    await req.userSupabase.from("generation_jobs").update({
      status: finalStatus, provider_request_id: result.predictionId || result.responseId || null,
      completed_at: result.image ? new Date().toISOString() : null
    }).eq("id", jobId);
    await req.userSupabase.from("generation_provider_usage").insert({
      job_id: jobId, user_id: req.user.id, provider_key: chosen.provider_key,
      model_key: chosen.model_key, provider_request_id: result.predictionId || result.responseId || null,
      latency_ms: elapsed, usage_details: { status: finalStatus, single_page_output: true }
    });
    res.json({ ...result, provider: chosen.provider_key, model: chosen.model_key, jobId, quota: req.generationQuota });
  } catch (error) {
    if (jobId) await req.userSupabase.from("generation_jobs").update({
      status: "failed", error_code: "provider_generation_failed",
      error_message: clip(error.message, 500), completed_at: new Date().toISOString()
    }).eq("id", jobId);
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
