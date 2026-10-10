# Agent notes

- This repo is the **admin app** only. The public site is the separate `spinalinfo` repo, which also owns the Supabase schema (`supabase/migrations/`). Schema changes go there as new migrations.
- Supabase client: `src/lib/supabase.js`. Shared helpers (`unwrap`, `slugify`, `uploadImage`, `PUBLIC_SITE_URL`): `src/lib/helpers.js`.
- Auth: `src/lib/AuthContext.jsx` loads the session and the `profiles.role`. `ProtectedRoute` gates every page except login and password reset. Row level security is the real guard, so don't rely on UI checks alone.
- Images go to the public `media` storage bucket through `uploadImage`.
- The app runs on Next.js (Pages Router). `pages/[[...slug]].jsx` renders the React Router app from `src/App.jsx` on the client only. Add new screens as React Router routes in `src/App.jsx`. Environment variables use the `NEXT_PUBLIC_` prefix.
- Styling follows the public site's editorial theme in `src/index.css`. shadcn components live in `src/components/ui/`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
