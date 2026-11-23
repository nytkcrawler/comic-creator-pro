const PROVIDERS = new Set(["openai", "venice", "replicate"]);

export function providerIsConfigured(provider, env = process.env) {
  if (provider === "openai") return Boolean(env.OPENAI_API_KEY);
  if (provider === "venice") return Boolean(env.VENICE_API_KEY);
  if (provider === "replicate") return Boolean(env.REPLICATE_API_TOKEN && env.REPLICATE_MODEL_OWNER && env.REPLICATE_MODEL_NAME);
  return false;
}

function supports(list, value) {
  return Array.isArray(list) && (list.includes("*") || list.includes(value));
}

export function compatibilityReasons(model, request, env = process.env) {
  const reasons = [];
  const provider = model?.provider_key;
  const caps = model?.capabilities || {};
  if (!PROVIDERS.has(provider)) reasons.push("unsupported provider adapter");
  if (!model?.enabled) reasons.push("model disabled");
  if (!providerIsConfigured(provider, env)) reasons.push("provider credentials or model configuration missing");
  if (model?.supports_single_page_output !== true) reasons.push("single-page output unsupported");
  if (!supports(model?.supported_styles, request.style)) reasons.push("style unsupported");
  if (!supports(model?.supported_content_categories, request.contentCategory)) reasons.push("content category unsupported");
  if (!supports(caps.aspectRatios, request.aspectRatio)) reasons.push("aspect ratio unsupported");
  if (request.referenceCount > 0 && (!model?.supports_reference_images || request.referenceCount > Number(model.max_reference_images || 0))) {
    reasons.push("reference-image requirements unsupported");
  }
  if (request.referenceCount > 0 && provider === "venice") reasons.push("Venice adapter does not currently pass reference images");
  if (request.referenceCount > 0 && provider === "replicate" && !env.REPLICATE_REFERENCE_INPUT_KEY) reasons.push("Replicate reference input key is not configured");
  if (request.isEdit && caps.supportsEdit !== true) reasons.push("editing unsupported");
  if (provider === "openai" && model.model_key !== (env.OPENAI_RESPONSE_MODEL || "gpt-5.5")) reasons.push("model key does not match server configuration");
  if (provider === "venice" && model.model_key !== (env.VENICE_IMAGE_MODEL || "z-image-turbo")) reasons.push("model key does not match server configuration");
  if (provider === "replicate" && model.model_key !== [env.REPLICATE_MODEL_OWNER, env.REPLICATE_MODEL_NAME].filter(Boolean).join("/")) reasons.push("model key does not match server configuration");
  return reasons;
}

export function selectProviderModel(models, request, env = process.env) {
  const candidates = (models || []).filter(model => {
    if (request.mode === "manual" && model.provider_key !== request.provider) return false;
    if (request.mode !== "manual" && model.auto_routing_enabled !== true) return false;
    return compatibilityReasons(model, request, env).length === 0;
  });
  if (!candidates.length) return null;

  const rule = (request.routingRules || [])
    .filter(item => item.enabled && item.style_key === request.style && item.content_category === request.contentCategory)
    .sort((a, b) => Number(a.priority || 100) - Number(b.priority || 100))[0];
  const preferredId = rule?.provider_model_id;
  const weights = rule?.weights && typeof rule.weights === "object"
    ? rule.weights
    : { quality: 0.4, identity: 0.25, layout: 0.2, cost: 0.15 };
  const dimensions = ["quality", "identity", "layout", "cost"];
  const normalizedWeights = Object.fromEntries(dimensions.map(key => [
    key, Math.min(1, Math.max(0, Number(weights[key]) || 0))
  ]));
  const weightTotal = dimensions.reduce((sum, key) => sum + normalizedWeights[key], 0) || 1;
  const score = model => dimensions.reduce((sum, key) => {
    const raw = Number(model.capabilities?.scores?.[key]);
    const metric = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0.5;
    return sum + metric * normalizedWeights[key] / weightTotal;
  }, 0);
  return candidates.sort((a, b) => {
    if (preferredId && a.id === preferredId && b.id !== preferredId) return -1;
    if (preferredId && b.id === preferredId && a.id !== preferredId) return 1;
    return score(b) - score(a)
      || Number(a.routing_priority || 100) - Number(b.routing_priority || 100)
      || String(a.provider_key).localeCompare(String(b.provider_key))
      || String(a.model_key).localeCompare(String(b.model_key));
  })[0];
}
