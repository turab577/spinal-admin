# SpinalInfo — admin

The admin app for SpinalInfo. Admins use it to write and publish articles, read contact-form inquiries, and review guest post proposals.

Built with [Next.js](https://nextjs.org) (Pages Router) and React on [Supabase](https://supabase.com). It uses the same Supabase project as the public site in the separate **spinalinfo** repo, which owns the database schema in `supabase/migrations/`.

## Setup

1. Apply the schema from the **spinalinfo** repo to your Supabase project, if you haven't already.
2. In the Supabase dashboard, open **Authentication**:
   - **Sign In / Providers**: turn off **Allow new users to sign up**. Admins are invited, not self-registered.
   - **URL Configuration**: add `<admin-url>/reset-password` to **Redirect URLs**. Add `http://localhost:5174/reset-password` too for local development.
3. Create the first admin:
   - Go to **Authentication → Users → Add user** (or **Invite user**).
   - Then run this in the SQL editor:
     ```sql
     update public.profiles set role = 'admin' where email = 'you@example.com';
     ```
4. Copy `.env.example` to `.env` and fill it in.
5. Run `npm install`, then `npm run dev` (it serves on http://localhost:5174).

## Access control

Any signed-in user without `role = 'admin'` sees an "Access restricted" screen. The actual protection comes from Supabase row level security, not from the UI: reads and writes to articles, inquiries and guest post proposals, plus uploads to the `media` bucket, all require an admin profile. Never put the service-role key in this app.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server on port 5174 |
| `npm run build` | Production build to `.next/` |
| `npm run start` | Serve the production build on port 5174 |
| `npm run lint` | Run ESLint |

## Deployment

Deploy it as a standard Next.js app, for example on Vercel or with `npm run build && npm run start`. Set the `NEXT_PUBLIC_*` variables from `.env.example`. Next.js serves every path through `pages/[[...slug]].jsx`, which renders the React Router app in `src/App.jsx` in the browser. Deploy it on its own domain or subdomain, for example `admin.spinalinfo.com`.
