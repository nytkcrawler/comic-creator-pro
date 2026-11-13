# Comic Creator Pro

A mobile-first React + Express comic creation studio with Venice and Replicate provider adapters.

## Requirements
- Node.js 20+
- A Venice API key and/or Replicate API token
- A Replicate model whose input schema accepts `prompt` and `num_outputs`

## Run locally
1. Extract the project.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Add provider credentials to `.env`.
5. Run `npm run dev`.
6. Open http://localhost:5173.

For production:
- `npm run build`
- `npm start`
- Deploy the Node server and built `dist` folder together.
- Set environment variables in your hosting provider's secret manager.

## Provider setup

### Venice
Set:
- `VENICE_API_KEY`
- `VENICE_IMAGE_MODEL` (default: `z-image-turbo`)
- `VENICE_MODERATION=auto` or `low`

Venice documents `moderation=low` as returning adult-classified images without blur. It is not a guarantee of unrestricted generation or a bypass of Venice's policies. Keep `auto` if you prefer automatic blur.

### Replicate
Set:
- `REPLICATE_API_TOKEN`
- `REPLICATE_MODEL_OWNER`
- `REPLICATE_MODEL_NAME`

The adapter sends exactly one prediction for the entire page and sets `num_outputs: 1`. It does not issue one prediction per panel. Choose a Replicate model whose input schema supports both `prompt` and `num_outputs`. Replicate models have different input schemas. Add model-specific fields in `REPLICATE_EXTRA_INPUT_JSON`, for example:
`{"aspect_ratio":"2:3","output_format":"png"}`

If your chosen model requires a pinned version, set `REPLICATE_MODEL_VERSION` to the full version hash. If the model supports image references, set `REPLICATE_REFERENCE_INPUT_KEY` to the exact input field name it expects. The UI's file picker is a placeholder; production reference-image support requires uploading files to private object storage and passing signed HTTPS URLs to a model that accepts them.

## Notes / production hardening
- API keys are server-side only. Never rename them with a `VITE_` prefix.
- Add authentication, per-user quotas, rate limiting, persistent storage and image cleanup before public deployment.
- The app stores configuration, saved character text and recent generated images in the browser's localStorage. Do not use this for sensitive material on shared devices.
- **Single-page generation is a core invariant:** one click sends one generation request, and that request asks the image model to render the complete page with all requested panels in one image. Venice is called with `n: 1`; Replicate receives one prediction with `num_outputs: 1`. Replicate status checks only poll the same prediction and do not generate additional images. There is deliberately no per-panel generation pipeline. Exact panel count, panel borders and legible lettering still depend on the selected model following the prompt.
- Only use provider models and content settings permitted by their terms. The adult-mode checkbox is an age-gated creative setting, not a way to bypass provider safeguards. All depicted characters must be adults. Never create sexual content involving minors, age-ambiguous characters, coercion or non-consensual exploitation.
- Before accepting uploads from users, add file type/size validation, malware scanning, access controls and signed upload URLs.
