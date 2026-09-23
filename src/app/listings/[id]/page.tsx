import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { ListingSchema } from "@/lib/listing-schema";
import { createClient } from "@/lib/supabase/server";
import { ListingEditor } from "./ListingEditor";

export default async function ListingPage({ params }: PageProps<"/listings/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: listing }, { data: generation }] = await Promise.all([
    supabase
      .from("listings")
      .select("id, created_at, photo_count, photo_paths, thumbnail, data")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("generations")
      .select("model, input_tokens, output_tokens, cost_usd, duration_ms")
      .eq("listing_id", id)
      .maybeSingle(),
  ]);
  if (!listing) notFound();

  const data = ListingSchema.safeParse(listing.data);
  if (!data.success) notFound();

  const paths: string[] = listing.photo_paths ?? [];
  const { data: signed } = paths.length
    ? await supabase.storage.from("listing-photos").createSignedUrls(paths, 60 * 60)
    : { data: [] };
  const photoUrls = (signed ?? []).flatMap((s) => (s.signedUrl ? [s.signedUrl] : []));

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-16 pt-4">
        <ListingEditor
          id={listing.id}
          initial={data.data}
          photoUrls={photoUrls}
          thumbnail={listing.thumbnail}
          createdAt={listing.created_at}
          photoCount={listing.photo_count}
          generation={
            generation
              ? {
                  model: generation.model,
                  inputTokens: generation.input_tokens,
                  outputTokens: generation.output_tokens,
                  costUsd: Number(generation.cost_usd),
                  durationMs: generation.duration_ms,
                }
              : null
          }
        />
      </main>
    </>
  );
}
