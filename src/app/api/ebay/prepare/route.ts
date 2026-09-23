import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import {
  categoryAspects,
  conditionFor,
  EbayError,
  getConnection,
  sellerSetup,
  suggestCategories,
} from "@/lib/ebay";
import { prefillAspects } from "@/lib/ebay-listing";
import { pricing, searchQuery, titleFor } from "@/lib/listing-format";
import { ListingSchema } from "@/lib/listing-schema";

const Body = z.object({ listingId: z.guid(), categoryId: z.string().optional() });

/** Everything the "Post to eBay" form needs: categories, item specifics, condition, policies. */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const { data: row } = await auth.supabase
    .from("listings")
    .select("data, ebay_listing_id")
    .eq("id", body.data.listingId)
    .maybeSingle();
  const listing = row && ListingSchema.safeParse(row.data);
  if (!row || !listing?.success) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }
  const l = listing.data;

  if (!(await getConnection(auth.userId))) {
    return NextResponse.json({ error: "Connect your eBay account first." }, { status: 409 });
  }

  try {
    const categories = await suggestCategories(titleFor(l, "ebay") || searchQuery(l));
    const categoryId = body.data.categoryId ?? categories[0]?.id;
    if (!categoryId) {
      return NextResponse.json({ error: "eBay couldn't suggest a category for this item." }, { status: 422 });
    }
    const [aspects, condition, setup] = await Promise.all([
      categoryAspects(categoryId),
      conditionFor(categoryId, l.condition.grade, auth.userId),
      sellerSetup(auth.userId),
    ]);
    return NextResponse.json({
      categories,
      categoryId,
      aspects,
      prefilled: prefillAspects(l, aspects),
      condition,
      setup,
      price: pricing(l, "ebay").list,
      alreadyListed: row.ebay_listing_id,
    });
  } catch (e) {
    console.error("ebay: prepare failed", e);
    const status = e instanceof EbayError ? e.status : 500;
    const message = e instanceof EbayError ? e.userMessage : "Couldn't reach eBay.";
    return NextResponse.json({ error: message }, { status: status === 401 ? 409 : 502 });
  }
}
