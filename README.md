# Resale Lister

Mobile-first web app that turns item photos into ready-to-post resale listings
for eBay, Poshmark, and Facebook Marketplace.

Stack: Next.js (App Router) on Vercel, Supabase (auth + Postgres), Claude API
for reading the photos.

## Setup

1. **Supabase**
   - Create a project.
   - Run the files in `supabase/migrations/` in order in the SQL editor (or `supabase db push`).
     `0002_photos.sql` creates the private `listing-photos` storage bucket.
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
3. **eBay (optional, enables "Post to eBay" and live eBay prices)**
   - Create an app at developer.ebay.com and copy the production App ID (client ID) and Cert ID
     (client secret) into `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET`. With just these two set,
     the eBay price check works.
   - Under User Tokens, create a RuName (redirect URL name) with the accept URL
     `https://<your-domain>/api/ebay/callback`; put the RuName in `EBAY_RU_NAME`.
   - Under Alerts & Notifications, set the marketplace account deletion endpoint to
     `https://<your-domain>/api/ebay/account-deletion` and a 32–80 character verification token;
     copy both into `EBAY_DELETION_ENDPOINT_URL` / `EBAY_VERIFICATION_TOKEN`.
   - Add `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project settings → API). eBay tokens are
     stored in `ebay_accounts`, which only the server can read.
   - Sellers need business policies (shipping, payment, returns) on their eBay account;
     the app links them to eBay's setup page if any are missing.
4. `npm install && npm run dev`

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
- **Results** (`/listings/[id]`): one tab per marketplace (eBay, Poshmark, Mercari,
  Depop, Vinted, Facebook Marketplace, Grailed, Etsy, OfferUp) showing that site's
  title, description, suggested category, and condition in its own terms, each with
  a copy button, plus "Copy everything". Each tab links to the site's sold (or
  active) search for the item and to its new-listing page. Shared details,
  measurements, package weight, flaws, and tags are edited once and autosave.
- **Item types**: Claude first classifies the item (clothing, electronics, books & media,
  trading cards, toys & collectibles, home goods, furniture, other). That picks which sites
  are shown (e.g. cards: eBay, Mercari, Facebook; "More sites" shows the rest), the
  type-specific details to capture (model and capacity, ISBN and edition, player/set/grade),
  condition wording ("New, sealed / in box" instead of "New with tags"), and whether
  measurements apply. Electronics carry a working status; without a "tested" note from the
  seller they're listed as untested, and "not working" lists them for parts. Barcodes (UPC,
  EAN, ISBN) are read only when every digit is legible and are sent to eBay. For trading
  cards, eBay posting uses eBay's Graded/Ungraded conditions with grader, grade, and cert
  number, using the values eBay publishes for the category.
- **Pricing**: set what you want to take home; each site gets a list price that
  nets about that after its fees. Fee formulas, title limits, and condition names
  live in `src/lib/platforms.ts` (checked September 2026; update when sites change).
- **eBay** (official APIs): connect an eBay account once, then "Post to eBay" suggests the
  category, pre-fills item specifics we already know (never a brand that wasn't read),
  maps the condition to what that category allows, uploads the photos, and publishes.
  "eBay prices right now" shows current asking prices for similar items. Sold-price data
  requires eBay's Marketplace Insights API, which needs separate approval from eBay.
  The other sites have no public listing API, so they stay copy-and-paste.
- **Photos** are kept in Supabase Storage. "Save photos" uses the phone's share
  sheet to put them in the camera roll, optionally with a square-cropped cover.
- **History** (`/history`): past listings, filterable by active or sold, with price or
  profit, date, and AI cost.
- **Sale & profit**: on each listing, record what you paid, sourcing miles, and when it sells
  (site, price, fees estimated from that site's formula, shipping label). **Profit**
  (`/profit`) totals it by month, year, or all time and by site, and exports a CSV for
  bookkeeping. Mileage uses the IRS business rate for the listing's date
  (`MILEAGE_RATES` in `src/lib/config.ts`).

## Install on a phone

The app can be added to the home screen and opens full screen like an app (web app manifest
in `src/app/manifest.ts`, icons in `public/icons/`). On Android, Chrome offers an Install
button on the capture screen; on iPhone, the capture screen shows the Share → Add to Home
Screen steps. Requires HTTPS, which Vercel provides.

## Limits and cost tracking

- Every Claude call writes a row to `generations` (tokens, cost in USD, status,
  duration) and a JSON log line (`"event":"generation"`) visible in Vercel logs.
  Each listing page shows its token counts and cost. For totals across all users,
  see the query at the bottom of the migration.
- The daily limit counts `generations` rows since midnight UTC, including refused
  or failed calls, since those still cost tokens. Users can't delete these rows.
