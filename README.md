# Comic Creator Pro

A mobile-first React + Express comic creation studio with OpenAI, Venice and Replicate image providers. The OpenAI route uses the Responses API image-generation tool for reference-image input and multi-turn refinements.

## Requirements

- Node.js 26.x
- A Supabase project with the Comic Creator Pro schema and private storage buckets
- At least one image provider API key (OpenAI, Venice or Replicate)

## Run locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env`.
3. Set the Supabase URL and publishable key in both the `VITE_*` browser variables and the server variables.
4. Add at least one provider API key to the server-only variables.
5. Run `npm run dev` and open http://localhost:5173.

## Authentication and Supabase

- Users sign in with a passwordless email link through Supabase Auth.
- Add your local app URL and your Vercel deployment URLs to Supabase Auth → URL Configuration → Redirect URLs. Suggested entries:
  - `http://localhost:5173/**`
  - `https://comic-creator-pro-five.vercel.app/**`
  - `https://comic-creator-pro-git-setup-vercel-server-nytkcrawler-3581.vercel.app/**`
- Comic pages are stored in the private `comic-panels` bucket and their metadata is stored in `public.comics` and `public.panels`.
- Character reference images are stored in the private `character-refs` bucket. Character sets are stored in `public.character_sets` and `public.characters`.
- Ownership is enforced with Supabase Row Level Security. The browser uses only a publishable key; never put a Supabase secret or service-role key in the browser.
- A database-backed quota limits each signed-in account to 10 generated pages per hour in the current beta. The limit is enforced server-side by `public.reserve_generation()`.

## OpenAI

Set:
- `OPENAI_API_KEY`
- `OPENAI_RESPONSE_MODEL` (default: `gpt-5.5`)

The app sends one Responses API request for one complete comic page, with the hosted image-generation tool configured to create one page. OpenAI selects the underlying GPT Image model for this Responses API flow. Up to four uploaded reference images are included as image inputs. The resulting response ID is saved with the comic and used for follow-up refinement requests.

OpenAI API usage is billed separately from ChatGPT subscriptions. Image model access may require API organization verification and separate API billing.

## Venice

Set:
- `VENICE_API_KEY`
- `VENICE_IMAGE_MODEL` (default: `z-image-turbo`)
- `VENICE_MODERATION=auto` or `low`

Venice moderation settings do not bypass Venice policies.

## Replicate

Set:
- `REPLICATE_API_TOKEN`
- `REPLICATE_MODEL_OWNER`
- `REPLICATE_MODEL_NAME`
- Optional: `REPLICATE_MODEL_VERSION`, `REPLICATE_EXTRA_INPUT_JSON`, `REPLICATE_REFERENCE_INPUT_KEY`

The adapter starts exactly one prediction for the whole page and sets `num_outputs: 1`. Model input schemas vary, so check the selected model's accepted reference-image fields.

## Vercel

- Framework preset: Node.js
- Install command: `npm install`
- Build command: `npm run build`
- Output directory: leave unset. The Express app serves the Vite `dist` build.
- Runtime: Node.js 26.x
- Function region: Mumbai (`bom1`)

Add browser Supabase settings as plain environment variables. Provider keys must be encrypted server-only environment variables and must not use a `VITE_` prefix. For the OpenAI provider, add `OPENAI_API_KEY` to Production, Preview and Development after API billing and model access are ready.

## Important safeguards and limitations

- Never expose provider API keys, Supabase secret keys or service-role keys to browser code.
- Comic pages and character sets are stored in Supabase using per-user RLS and private storage paths.
- The initial beta quota is 10 page generations per user per hour.
- The app does not use ChatGPT subscription credits. OpenAI API usage is separately billed.
- A page is requested as one image in one provider call. Exact panel count, typography and panel layout still depend on the image model following the prompt.
- The mature-content setting is not a way to bypass provider safeguards. All depicted characters must be clearly adults. Never create sexual content involving minors, age-ambiguous characters, coercion or non-consensual exploitation.
- Before inviting the public, add an admin review process, monitoring and a documented user support / data deletion process.
