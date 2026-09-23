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

## How it works

- **Capture** (`/`): camera or library, 1–6 photos. Each photo is resized in the
  browser to 1024px on the long edge as a JPEG (`src/lib/image.ts`), so a 12 MP
  phone photo goes up as ~100 KB and costs roughly 1,000 input tokens.
- **Generate** (`POST /api/generate`): checks the session and the daily limit,
  sends the photos to Claude with a JSON schema (`src/lib/listing-schema.ts`),
  and saves the listing. The prompt (`src/lib/prompt.ts`) tells Claude to leave
  brand and model empty and say what's missing when they can't be read, rather
  than guess. eBay titles are clamped to 80 characters on the server as well.
- **Results** (`/listings/[id]`): every field is editable and autosaves; each has
  a copy button, plus "Copy full listing" per platform. The price is labeled as
  an estimate.
- **History** (`/history`): past listings with price, date, and API cost.

## Limits and cost tracking

- Every Claude call writes a row to `generations` (tokens, cost in USD, status,
  duration) and a JSON log line (`"event":"generation"`) visible in Vercel logs.
  Each listing page shows its token counts and cost. For totals across all users,
  see the query at the bottom of the migration.
- The daily limit counts `generations` rows since midnight UTC, including refused
  or failed calls, since those still cost tokens. Users can't delete these rows.
