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
