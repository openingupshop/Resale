import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { EbayError, publishListing } from "@/lib/ebay";
import { conditionDescription, ebayDescriptionHtml } from "@/lib/ebay-listing";
import { titleFor } from "@/lib/listing-format";
import { ListingSchema } from "@/lib/listing-schema";

export const maxDuration = 60;

const Body = z.object({
  listingId: z.guid(),
  categoryId: z.string().min(1),
  conditionEnum: z.string().min(1),
  aspects: z.record(z.string(), z.array(z.string().min(1)).min(1)),
  price: z.number().positive(),
  policies: z.object({ fulfillment: z.string().min(1), payment: z.string().min(1), returns: z.string().min(1) }),
  postalCode: z.string().regex(/^\d{5}$/).optional(),
});

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Fill in every required field before posting." }, { status: 400 });
  }
  const input = body.data;

  const { data: row } = await auth.supabase
    .from("listings")
    .select("data, photo_paths, ebay_offer_id")
    .eq("id", input.listingId)
    .maybeSingle();
  const listing = row && ListingSchema.safeParse(row.data);
  if (!row || !listing?.success) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }
  const l = listing.data;

  const paths: string[] = row.photo_paths ?? [];
  if (!paths.length) {
    return NextResponse.json({ error: "This listing has no saved photos to send to eBay." }, { status: 422 });
  }
  const { data: signed } = await auth.supabase.storage.from("listing-photos").createSignedUrls(paths, 60 * 30);
  const photoUrls = (signed ?? []).flatMap((s) => (s.signedUrl ? [s.signedUrl] : []));

  try {
    const result = await publishListing(auth.userId, {
      sku: input.listingId,
      title: titleFor(l, "ebay"),
      descriptionHtml: ebayDescriptionHtml(l),
      photoUrls,
      categoryId: input.categoryId,
      conditionEnum: input.conditionEnum,
      conditionDescription: conditionDescription(l),
      aspects: input.aspects,
      price: input.price,
      weightOz: l.weight_oz,
      policies: input.policies,
      postalCode: input.postalCode,
      existingOfferId: row.ebay_offer_id,
    });
    await auth.supabase
      .from("listings")
      .update({
        ebay_offer_id: result.offerId,
        ebay_listing_id: result.listingId,
        ebay_listed_at: new Date().toISOString(),
      })
      .eq("id", input.listingId);
    return NextResponse.json(result);
  } catch (e) {
    console.error("ebay: publish failed", e);
    const message = e instanceof EbayError ? e.userMessage : "Couldn't post to eBay. Try again.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
