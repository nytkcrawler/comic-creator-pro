import test from "node:test";
import assert from "node:assert/strict";
import { compatibilityReasons, selectProviderModel } from "./provider-router.js";

const env = {
  OPENAI_API_KEY: "test-key",
  OPENAI_RESPONSE_MODEL: "gpt-5.5",
  VENICE_API_KEY: "test-key",
  VENICE_IMAGE_MODEL: "z-image-turbo"
};
const base = {
  id: "openai-row", provider_key: "openai", model_key: "gpt-5.5", enabled: true,
  auto_routing_enabled: true, routing_priority: 10,
  supported_styles: ["Japanese Manga", "Fine-Art Realism"],
  supported_content_categories: ["general", "mature"],
  supports_reference_images: true, max_reference_images: 4,
  supports_single_page_output: true,
  capabilities: { aspectRatios: ["Portrait 2:3", "Vertical 9:16"], supportsEdit: true }
};
const request = {
  mode: "auto", style: "Japanese Manga", contentCategory: "general",
  aspectRatio: "Portrait 2:3", referenceCount: 2, isEdit: false
};

test("automatic mode chooses one compatible model", () => {
  assert.equal(selectProviderModel([base], request, env).id, "openai-row");
});
test("manual override never falls back to another provider", () => {
  assert.equal(selectProviderModel([base], { ...request, mode: "manual", provider: "venice" }, env), null);
});
test("reference count is a hard constraint", () => {
  assert.ok(compatibilityReasons(base, { ...request, referenceCount: 5 }, env).includes("reference-image requirements unsupported"));
});
test("unsupported ratio is rejected", () => {
  assert.ok(compatibilityReasons(base, { ...request, aspectRatio: "Square 1:1" }, env).includes("aspect ratio unsupported"));
});
test("models without configured credentials are excluded", () => {
  assert.equal(selectProviderModel([base], request, {}), null);
});
test("manual mode may choose an enabled model even if auto routing is off", () => {
  const manual = { ...base, auto_routing_enabled: false };
  assert.equal(selectProviderModel([manual], { ...request, mode: "manual", provider: "openai" }, env).id, "openai-row");
});
