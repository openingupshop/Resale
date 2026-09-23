import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  CLAUDE_EFFORT,
  CLAUDE_MAX_TOKENS,
  CLAUDE_MODEL,
  MAX_PHOTOS,
  MIN_PHOTOS,
} from "@/lib/config";
import { costUsd, toTokenUsage, type TokenUsage } from "@/lib/cost";
import {
  GeneratedListingSchema,
  ListingSchema,
  PLATFORMS,
  type GeneratedListing,
  type Listing,
} from "@/lib/listing-schema";
import { PLATFORM_INFO } from "@/lib/platforms";
import { SYSTEM_PROMPT, userPrompt } from "@/lib/prompt";
import { createClient } from "@/lib/supabase/server";
import { getDailyUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 60;

// Photos are resized in the browser to ~1024px JPEGs (~100-250 KB). These caps
// reject anything that skipped compression and keep us under Vercel's 4.5 MB body limit.
const MAX_PHOTO_BASE64 = 700_000;
const MAX_THUMBNAIL = 60_000;

const RequestSchema = z.object({
  photos: z
    .array(z.string().regex(/^[A-Za-z0-9+/]+=*$/).max(MAX_PHOTO_BASE64))
    .min(MIN_PHOTOS)
    .max(MAX_PHOTOS),
  thumbnail: z
    .string()
    .startsWith("data:image/jpeg;base64,")
    .max(MAX_THUMBNAIL)
    .optional(),
  notes: z.string().max(500).optional(),
});

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY
const outputFormat = zodOutputFormat(GeneratedListingSchema);

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Send ${MIN_PHOTOS}-${MAX_PHOTOS} compressed JPEG photos.` },
      { status: 400 },
    );
  }
  const { photos, thumbnail, notes } = parsed.data;

  const usage = await getDailyUsage(supabase, userId);
  if (usage.remaining <= 0) {
    return NextResponse.json(
      { error: `Daily limit of ${usage.limit} listings reached. It resets at midnight UTC.` },
      { status: 429 },
    );
  }

  const started = Date.now();
  let message: Anthropic.Message;
  try {
    message = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: CLAUDE_MAX_TOKENS,
      system: SYSTEM_PROMPT,
      output_config: { effort: CLAUDE_EFFORT, format: outputFormat },
      messages: [
        {
          role: "user",
          content: [
            ...photos.map(
              (data): Anthropic.ImageBlockParam => ({
                type: "image",
                source: { type: "base64", media_type: "image/jpeg", data },
              }),
            ),
            { type: "text", text: userPrompt(photos.length, notes) },
          ],
        },
      ],
    });
  } catch (error) {
    return anthropicErrorResponse(error);
  }
  const durationMs = Date.now() - started;
  const tokens = toTokenUsage(message.usage);

  const logGeneration = (
    status: "success" | "refused" | "error",
    listingId: string | null = null,
  ) => recordGeneration(supabase, { userId, listingId, status, photoCount: photos.length, tokens, durationMs });

  if (message.stop_reason === "refusal") {
    await logGeneration("refused");
    return NextResponse.json(
      { error: "These photos couldn't be turned into a listing. Try different photos of the item." },
      { status: 422 },
    );
  }

  let listing: Listing;
  try {
    const text = message.content.find((b) => b.type === "text")?.text ?? "";
    listing = normalize(outputFormat.parse(text));
  } catch (error) {
    await logGeneration("error");
    console.error("generate: unparseable output", { stop_reason: message.stop_reason, error });
    return NextResponse.json(
      { error: "The listing came back incomplete. Please try again." },
      { status: 502 },
    );
  }

  const { data: row, error: insertError } = await supabase
    .from("listings")
    .insert({ user_id: userId, photo_count: photos.length, thumbnail, data: listing })
    .select("id")
    .single();
  if (insertError || !row) {
    await logGeneration("error");
    console.error("generate: listing insert failed", insertError);
    return NextResponse.json({ error: "Couldn't save the listing." }, { status: 500 });
  }

  // Keep the photos for re-download and marketplace posting. A failed upload
  // shouldn't lose the listing the user just paid tokens for.
  const photoPaths = await uploadPhotos(supabase, userId, row.id, photos);
  if (photoPaths.length) {
    await supabase.from("listings").update({ photo_paths: photoPaths }).eq("id", row.id);
  }

  await logGeneration("success", row.id);
  return NextResponse.json({ id: row.id });
}

/** Enforce limits the schema can't express, and add seller-field defaults. */
function normalize(generated: GeneratedListing): Listing {
  const listing = ListingSchema.parse(generated);
  const low = Math.max(0, Math.min(listing.price.low, listing.price.high));
  const high = Math.max(listing.price.low, listing.price.high);
  const titles = { ...listing.titles };
  for (const p of PLATFORMS) {
    const max = PLATFORM_INFO[p].titleMax;
    titles[p] = max ? clampTitle(titles[p], max) : titles[p].trim();
  }
  const tagList = (xs: string[]) => [
    ...new Set(xs.map((k) => k.replace(/^#/, "").trim().toLowerCase()).filter(Boolean)),
  ];
  return {
    ...listing,
    titles,
    price: { ...listing.price, low, high },
    keywords: tagList(listing.keywords),
    hashtags: tagList(listing.hashtags).map((h) => h.replace(/\s+/g, "")).slice(0, 5),
    etsy_tags: tagList(listing.etsy_tags).filter((t) => t.length <= 20).slice(0, 13),
    weight_oz: listing.est_weight_oz,
  };
}

async function uploadPhotos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  listingId: string,
  photos: string[],
): Promise<string[]> {
  const results = await Promise.all(
    photos.map(async (b64, i) => {
      const path = `${userId}/${listingId}/${i + 1}.jpg`;
      const { error } = await supabase.storage
        .from("listing-photos")
        .upload(path, Buffer.from(b64, "base64"), { contentType: "image/jpeg" });
      if (error) console.error("generate: photo upload failed", path, error);
      return error ? null : path;
    }),
  );
  return results.filter((p): p is string => p !== null);
}

function clampTitle(title: string, max: number): string {
  const t = title.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : t.slice(0, max)).trim();
}

async function recordGeneration(
  supabase: Awaited<ReturnType<typeof createClient>>,
  g: {
    userId: string;
    listingId: string | null;
    status: "success" | "refused" | "error";
    photoCount: number;
    tokens: TokenUsage;
    durationMs: number;
  },
) {
  const cost = costUsd(g.tokens);
  // One JSON line per generation so cost is visible in Vercel logs too.
  console.log(
    JSON.stringify({
      event: "generation",
      user_id: g.userId,
      listing_id: g.listingId,
      status: g.status,
      model: CLAUDE_MODEL,
      photo_count: g.photoCount,
      ...g.tokens,
      cost_usd: cost,
      duration_ms: g.durationMs,
    }),
  );
  const { error } = await supabase.from("generations").insert({
    user_id: g.userId,
    listing_id: g.listingId,
    status: g.status,
    model: CLAUDE_MODEL,
    photo_count: g.photoCount,
    ...g.tokens,
    cost_usd: cost,
    duration_ms: g.durationMs,
  });
  if (error) console.error("generate: usage insert failed", error);
}

function anthropicErrorResponse(error: unknown) {
  console.error("generate: Claude API error", error);
  if (error instanceof Anthropic.RateLimitError) {
    return NextResponse.json({ error: "Busy right now. Try again in a minute." }, { status: 503 });
  }
  if (error instanceof Anthropic.BadRequestError) {
    return NextResponse.json({ error: "One of the photos couldn't be read. Try retaking it." }, { status: 400 });
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return NextResponse.json({ error: "Server is misconfigured." }, { status: 500 });
  }
  if (error instanceof Anthropic.APIError) {
    return NextResponse.json({ error: "Listing service is unavailable. Try again." }, { status: 502 });
  }
  return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
}
