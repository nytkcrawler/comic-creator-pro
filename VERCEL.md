# Vercel deployment

- Repository: `nytkcrawler/comic-creator-pro`
- Framework preset: Node.js
- Runtime: Node.js 26.x
- Install: `npm install`
- Build: `npm run build`
- Output directory: unset
- Function region: Mumbai (`bom1`)

The root `server.ts` exports the Express application in `server/index.js`. Express serves Vite's `dist` folder and the same-origin `/api/*` routes.

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for the browser; also set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` for the server. Provider API keys are encrypted, server-only variables. Never use a `VITE_` prefix for secrets.

For Supabase Auth redirects add `https://comic-creator-pro-nytkcrawler-3581.vercel.app/**` and `http://localhost:5173/**` in Supabase Authentication → URL Configuration.

Each Generate click makes one provider request for one complete page image. The page's panel count is composed inside that image; it is not a per-panel generation pipeline.
