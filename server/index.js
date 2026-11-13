import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const allowedPanels = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 12]);
const allowedProviders = new Set(["venice", "replicate"]);

app.use(express.json({ limit: "25mb" }));

function clip(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

function buildComicPrompt(config) {
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
  return prompt.slice(0, 1490);
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
    venice: Boolean(process.env.VENICE_API_KEY),
    replicate: Boolean(process.env.REPLICATE_API_TOKEN && process.env.REPLICATE_MODEL_OWNER && process.env.REPLICATE_MODEL_NAME),
    generationMode: "single-full-page",
    pageImageCount: 1
  });
});

app.post("/api/generate", async (req, res) => {
  try {
    const { provider, config = {}, veniceModel } = req.body || {};
    if (!allowedProviders.has(provider)) return res.status(400).json({ error: "Choose Venice or Replicate." });
    if (typeof config.scene !== "string" || !config.scene.trim()) return res.status(400).json({ error: "Describe the comic scene before generating." });
    const panels = Number(config.panels);
    if (!allowedPanels.has(panels)) return res.status(400).json({ error: "Choose a supported panel count." });
    const prompt = buildComicPrompt({ ...config, panels });
    const result = provider === "venice"
      ? await generateWithVenice(prompt, config, veniceModel)
      : await generateWithReplicate(prompt, config);
    res.json(result);
  } catch (error) {
    console.error("[comic-generate]", error);
    res.status(502).json({ error: error.message || "Image generation failed." });
  }
});

app.get("/api/replicate/:id", async (req, res) => {
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

app.listen(PORT, () => console.log("Comic Creator Pro server listening on port " + PORT));
