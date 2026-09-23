import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { activeComps, EbayError, ebayAppConfigured } from "@/lib/ebay";
import { searchQuery } from "@/lib/listing-format";
import { ListingSchema } from "@/lib/listing-schema";

const Body = z.object({ listingId: z.guid() });

/** Snapshot of current eBay asking prices for similar items; the editor saves it on the listing. */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!ebayAppConfigured()) {
    return NextResponse.json({ error: "eBay prices aren't set up on this server." }, { status: 503 });
  }
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const { data: row } = await auth.supabase
    .from("listings")
    .select("data")
    .eq("id", body.data.listingId)
    .maybeSingle();
  const listing = row && ListingSchema.safeParse(row.data);
  if (!row || !listing?.success) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }
  const l = listing.data;

  try {
    const comps = await activeComps(searchQuery(l), !l.condition.grade.startsWith("New"));
    return NextResponse.json({ comps });
  } catch (e) {
    console.error("ebay: comps failed", e);
    const message = e instanceof EbayError ? e.userMessage : "Couldn't reach eBay.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
