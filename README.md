# Resale Lister

Mobile-first web app that turns item photos into ready-to-post resale listings
for eBay, Poshmark, and Facebook Marketplace.

Stack: Next.js (App Router) on Vercel, Supabase (auth + Postgres), Claude API
for reading the photos.

## Setup

1. **Supabase**
   - Create a project.
   - Run `supabase/migrations/0001_init.sql` in the SQL editor (or `supabase db push`).
   - Auth → URL Configuration: set Site URL to your Vercel URL and add
     `https://<your-domain>/auth/callback` (and `http://localhost:3000/auth/callback`)
     to Redirect URLs.
   - Optional: to let users type a code instead of tapping the link (handy when the
     email opens in a different browser), add `{{ .Token }}` to the Magic Link
     email template.
2. **Environment variables** (Vercel project settings, and `.env.local` for dev —
   see `.env.example`):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `ANTHROPIC_API_KEY` — server only; used by `src/app/api/generate/route.ts`.
3. `npm install && npm run dev`

## Configuration

All tunables live in `src/lib/config.ts`: daily generation limit, photo count,
compression size/quality, Claude model, and token prices used for cost logging.
