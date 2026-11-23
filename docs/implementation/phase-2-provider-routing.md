# Phase 2: Provider catalogue and automatic routing

## Product constraints

- Private, single-owner application. No customer accounts, checkout, subscriptions, customer credits, or pricing controls.
- The owner can choose **Automatic** or a specific provider/model override.
- Every comic-page request must make one image-generation request and return one complete page image containing the exact requested panel count. Never generate panels independently or stitch images.
- Character references may come from the saved character library or the current generation's uploads. Each reference is assigned to a character and view; the router must not silently drop required references.
- Provider credentials are server-only. The browser receives capability/status metadata, never secrets.

## Current implementation baseline

The Express server currently contains provider-specific generation functions for OpenAI, Venice, and Replicate, but the request path still requires a provider choice and does not yet consult `provider_models` or `model_routing_rules`. The database registry is currently empty. Do not claim automatic routing is live until the request path reads the registry and tests pass.

The existing server also enforces a beta generation quota through `reserve_generation`. This is a request-abuse safeguard, not customer billing. Retain or make the owner quota configurable separately from provider usage telemetry.

## Registry contract

Each `provider_models` row describes one callable model, not just a provider:

- `provider_key`: stable adapter key (for example `openai`, `venice`, `replicate`, `fal`, `gemini`).
- `model_key`: exact provider model identifier.
- `capabilities`: JSON metadata for supported aspect ratios, output dimensions, prompt limits, reference input format, async/polling behavior, edit support, and output formats.
- `supported_styles`: only styles actually tested or documented for the model.
- `supported_content_categories`: policy eligibility labels maintained per model/provider. Do not label a hosted API “uncensored” based on marketing language.
- `supports_reference_images` and `max_reference_images`: hard routing constraints.
- `supports_single_page_output`: must be true for comic-page generation.
- `enabled` and `auto_routing_enabled`: independent admin controls.
- `routing_priority`: deterministic tie-breaker.

Never seed a model as enabled merely because its provider has an API. Verify its current model identifier, endpoint, reference-image support, output contract, regional availability, and content policy first.

## Automatic routing algorithm

1. Validate the authenticated owner and comic request.
2. Normalize the brief: style, content category, aspect ratio, requested panel count, reference count, and whether this is a new page or edit.
3. Load enabled registry rows from the server using the owner-scoped Supabase client or a server-only privileged client.
4. Apply hard filters before scoring:
   - provider credentials configured and provider health not disabled;
   - `enabled = true` and `auto_routing_enabled = true`;
   - supports one complete page image;
   - requested style and content category eligible;
   - requested ratio supported;
   - reference images supported and reference count within model limit;
   - edit capability present for refinements.
5. Score eligible models using normalized quality, identity/reference fidelity, layout/text handling, reliability/latency, and optional actual provider cost. Cost is informational and is not charged to a user.
6. Apply `model_routing_rules` as style/category preferences and deterministic priority. Weights must be normalized and bounded server-side.
7. Choose one model. Do not fan out to multiple models for a single page request.
8. If no model qualifies, return a clear “no compatible model configured” response. Do not silently weaken identity, content, or single-image constraints.
9. Persist a `generation_jobs` record before dispatch; use an idempotency key. Persist provider request ID, status, output path and failure details.
10. Record actual provider usage/cost/latency in `generation_provider_usage` when available. This is owner-only telemetry.

Manual override uses the same hard compatibility checks. It may bypass automatic scoring and routing priority, but never provider capability or policy checks.

## Provider adapter interface

Implement one adapter per provider with a shared contract:

- `validateConfig()`: confirm server credentials and required model configuration.
- `getCapabilities(modelKey)`: return capability metadata used by the router.
- `generatePage({ modelKey, prompt, references, aspectRatio, idempotencyKey })`: perform exactly one provider image request.
- `refinePage({ modelKey, prompt, references, previousResponseId })`: only when the provider supports conversational/edit workflows.
- `getJobStatus(providerRequestId)`: normalize asynchronous provider status.
- `normalizeResult(response)`: return one image URL/base64 payload, provider request ID, usage and latency metadata.
- `classifyError(error)`: normalize retryable, quota, policy, invalid-input and credential errors.

Provider-specific request formats remain inside adapters. The router and UI must not know endpoint-specific payload shapes.

## Security and operational rules

- Only the authenticated owner/admin may change registry rows and routing rules.
- Never trust browser-supplied provider IDs, capability flags, or content eligibility. Re-read authoritative rows on the server.
- Do not accept arbitrary model endpoint URLs or user-supplied Replicate model owners as server fetch destinations.
- Do not log API keys, raw reference image data, or full private prompts unnecessarily.
- Keep reference files in private storage and issue short-lived signed URLs only after ownership checks.
- Add timeouts, bounded retries for retryable failures, and idempotency protection. Never retry a completed image request merely because the browser disconnected.
- Do not expose raw provider error payloads to the browser if they may contain secrets or internal details.

## OpenAI adapter note

The current official OpenAI image-generation guide documents the Responses API image-generation tool and current GPT Image model options. The existing code should be reviewed against the current guide before updating model defaults or request payloads. Use the top-level supported Responses model and explicitly select a supported image-generation model in the tool configuration. The exact output contract remains one image result per request.

## Acceptance tests

- Automatic mode selects exactly one compatible model.
- Manual override selects the requested model only when all hard constraints pass.
- Unsupported style, content category, aspect ratio, reference count, or edit request is rejected before provider dispatch.
- Missing credentials remove a model from eligibility.
- No eligible model returns a clear error and creates no provider request.
- A single page request results in exactly one provider image call and exactly one page image.
- Provider timeouts and duplicate callbacks cannot create duplicate completed pages.
- Owner-only registry and job policies are tested with a non-owner JWT.
- No billing tables, customer credit deductions, checkout, or payment provider are introduced.

## Implementation order

1. Add pure routing/normalization modules and unit tests.
2. Add a server-side registry repository and admin-only registry management endpoints.
3. Wrap existing OpenAI, Venice and Replicate functions behind adapters without changing their single-image contract.
4. Add automatic/manual selection to `POST /api/generate`.
5. Persist job lifecycle and owner-only usage telemetry.
6. Add capability-based model picker and automatic mode to the UI.
7. Add integration tests with mocked provider HTTP responses.
8. Seed only verified model rows after each provider's current API and policy are reviewed.
