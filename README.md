# Comic Creator Pro

A React/Vite and Express comic studio with Supabase passwordless authentication, private cloud storage, account-based generation limits, and OpenAI, Venice and Replicate image providers.

## Run locally
1. Use Node.js 26.x.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Add the required Supabase and provider settings.
5. Run `npm run dev` and open http://localhost:5173.

## Supabase
- Users sign in with an email magic link through Supabase Auth.
- Comics are stored in `public.comics`; each complete generated page is one row in `public.comic_pages`.
- Page image files are stored privately in `comic-panels`; character references are stored privately in `character-refs`.
- Each user’s data is protected by row-level security. Server requests validate the current user's JWT and perform database operations with that identity.
- The browser uses only the Supabase publishable key. No service-role or secret key is used by this app.
- The database limits each signed-in user to 10 page-generation requests per hour.

In Supabase Dashboard → Authentication → URL Configuration, set the Site URL to your Vercel app and add:
- `http://localhost:5173/**`
- `https://comic-creator-pro-nytkcrawler-3581.vercel.app/**`

## Image generation
Every Generate action requests **one complete page image**. The requested panel count is composed inside that one image:
- OpenAI: one Responses API request with image generation forced on and parallel tool calls disabled; the app accepts exactly one image result.
- Venice: `n: 1`.
- Replicate: one prediction with `num_outputs: 1`.

The app does not call the image API once per panel and does not split a generated page into separate panel image records. It stores one image and one `comic_pages` row per page. Exact panel geometry and text rendering still depend on the selected image model.

## Provider configuration
At least one server-side key is required:
- OpenAI: `OPENAI_API_KEY`, optional `OPENAI_RESPONSE_MODEL=gpt-5.5`.
- Venice: `VENICE_API_KEY`, optional `VENICE_IMAGE_MODEL` and `VENICE_MODERATION`.
- Replicate: `REPLICATE_API_TOKEN`, `REPLICATE_MODEL_OWNER`, `REPLICATE_MODEL_NAME`, plus optional model-specific inputs.

OpenAI API usage is billed separately from ChatGPT subscriptions. Venice and Replicate usage is charged by those providers. Never paste provider keys into GitHub or browser environment variables; set them as encrypted Vercel server environment variables.

## Security
- All depicted characters must be clearly adults.
- Adult settings do not bypass provider safeguards.
- Private image links are time-limited signed URLs.
- Beta generation quota is 10 pages per user per hour.


## Expanded creative direction and identity references
- The style library separates art tradition, rendering technique, visual treatment and style preset so they can be combined.
- Adult mode is an age-gated setting for mature themes and non-explicit artistic figure studies. It does not bypass provider safeguards; all characters must be clearly adults.
- Character references can be assigned to Character 1, Character 2 or a shared scene, with a view label (face, profile, full body, outfit, pose or environment).
- Identity-lock instructions and the reference manifest are included in the generation brief. Actual image-reference fidelity depends on the selected provider and model; OpenAI receives uploaded reference images directly. Replicate requires a compatible model and configured reference input key. Venice generation currently uses the written brief unless its provider integration is extended to accept image inputs.
- Reference images remain in the private `character-refs` bucket when saved to a character set.


## Non-negotiable page composition and one-shot generation
- The page is generated as **one image from one image-generation request**. The server must never issue one generation request per panel, generate alternate images for a page, or stitch separate panel images.
- OpenAI image generation uses one forced image-generation tool call, disables parallel tool calls, and validates that exactly one image-generation result is returned.
- Venice requests `n: 1`; Replicate requests `num_outputs: 1`. The app accepts and stores one final page image.
- The default layout is **Adaptive Cinematic (Reference)**. It uses a portrait editorial composition inspired by the user's reference: a large opening panel, varied asymmetric panels, occasional diagonal gutters, close-up reaction beats and a visually strong closing panel.
- The layout plan adapts to the selected count (1, 2, 3, 4, 5, 6, 7, 8, 9 or 12). Panel count means the number of complete bordered regions on the one page, not the number of generated images.
- One image-generation request does not guarantee identical costs across providers/models or perfect panel geometry. Provider output resolution, model capabilities and prompt adherence still apply.
