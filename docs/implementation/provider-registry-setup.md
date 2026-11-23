# Provider registry setup

The router is registry-first. A provider credential being present does **not** automatically enable a model. This is intentional: the model must be reviewed and configured against the adapter actually implemented in `server/index.js`.

## Configure a model

In Supabase SQL Editor, inspect the existing registry:

```sql
select provider_key, model_key, display_name, capabilities,
       supported_styles, supported_content_categories,
       supports_reference_images, max_reference_images,
       supports_single_page_output, enabled, auto_routing_enabled
from public.provider_models
order by provider_key, model_key;
```

Add one row only after confirming the exact model identifier and API behavior for your account:

```sql
insert into public.provider_models (
  provider_key, model_key, display_name, description,
  capabilities, supported_styles, supported_content_categories,
  supports_reference_images, max_reference_images,
  supports_single_page_output, enabled, auto_routing_enabled, routing_priority
) values (
  'openai',
  'REPLACE_WITH_OPENAI_RESPONSE_MODEL',
  'OpenAI image generation',
  'Verified one-image comic page configuration',
  '{"aspectRatios":["Portrait 2:3","Portrait 3:4","Vertical 9:16","Landscape 16:9","Square 1:1","Comic Page A4"],"supportsEdit":true}',
  array['*'],
  array['general'],
  true,
  4,
  true,
  false,
  false,
  10
);
```

Replace the model identifier with the exact value of `OPENAI_RESPONSE_MODEL` on the server. Keep `enabled=false` until a real generation test succeeds. Set `auto_routing_enabled=true` only after verifying the model's quality, identity/reference behavior, aspect ratios and content eligibility. Use `supported_styles` to narrow the wildcard to styles actually tested. For mature themes, add `mature` to `supported_content_categories` only after reviewing the provider's current policy and the configured workflow.

For Venice, the current adapter does not pass reference images. Do not set `supports_reference_images=true`; such a model will be excluded automatically whenever references are attached. The adapter currently sends one output using the server's configured `VENICE_IMAGE_MODEL`.

For Replicate, set `model_key` to `REPLICATE_MODEL_OWNER/REPLICATE_MODEL_NAME`. Reference support is eligible only when `REPLICATE_REFERENCE_INPUT_KEY` is configured and the model's input schema has been verified. Keep the model disabled until the output schema and one-image behavior have been tested.

## Manual override and automatic mode

- Manual mode can select an enabled compatible row even when `auto_routing_enabled=false`.
- Automatic mode additionally requires `auto_routing_enabled=true`.
- Both modes enforce credentials, exact server-configured model ID, single-page output, style, content category, aspect ratio and reference-count constraints.
- Routing rules can prefer a compatible model for a style/content-category pair. They cannot bypass hard compatibility checks.
- No model fan-out or fallback generation is performed. One request dispatches to at most one provider.

## Current adapter limits

- OpenAI: Responses API image-generation tool; references are passed as image inputs. Refinement requires an edit-capable registry row and an existing response ID.
- Venice: one image request; prompt is capped by the current adapter to 1,490 characters; reference images are not currently passed.
- Replicate: one prediction request; the configured model input schema is extended with `prompt`, `num_outputs: 1`, and optionally the configured reference-input key. Async predictions are polled through the existing status endpoint.

The registry is intentionally empty until exact model IDs and provider behavior are verified. Therefore, automatic and manual generation will return a clear “no compatible model” response until an owner enables a suitable row. This is safer than silently routing to an unverified model.
