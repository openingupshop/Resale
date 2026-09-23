import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { formatUsd } from "@/lib/cost";
import { formatPrice } from "@/lib/listing-format";
import { ListingSchema } from "@/lib/listing-schema";
import { createClient } from "@/lib/supabase/server";
import { getDailyUsage } from "@/lib/usage";

export default async function HistoryPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) redirect("/login");

  const [{ data: rows }, { data: gens }, usage] = await Promise.all([
    supabase
      .from("listings")
      .select("id, created_at, thumbnail, data, generations(cost_usd)")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("generations").select("cost_usd, status"),
    getDailyUsage(supabase, userId),
  ]);

  const totalCost = (gens ?? []).reduce((s, g) => s + Number(g.cost_usd), 0);
  const listings = (rows ?? []).flatMap((r) => {
    const parsed = ListingSchema.safeParse(r.data);
    if (!parsed.success) return [];
    const cost = (r.generations as { cost_usd: number | string }[] | null)?.[0]?.cost_usd;
    return [{ ...r, data: parsed.data, cost: cost == null ? null : Number(cost) }];
  });

  return (
    <>
      <AppHeader active="history" />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-16 pt-4">
        <h1 className="text-xl font-semibold tracking-tight">History</h1>
        <p className="mt-1 text-xs text-muted">
          {usage.used}/{usage.limit} generated today · {gens?.length ?? 0} generations all time ·{" "}
          {formatUsd(totalCost)} API cost
        </p>

        {listings.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
            No listings yet.{" "}
            <Link href="/" className="font-medium text-accent">
              Create one
            </Link>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {listings.map((l) => (
              <li key={l.id}>
                <Link href={`/listings/${l.id}`} className="flex items-center gap-3 py-3">
                  {l.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.thumbnail} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="h-14 w-14 shrink-0 rounded-lg bg-border" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.data.titles.ebay}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {formatPrice(l.data)} est. · {new Date(l.created_at).toLocaleDateString()}
                      {l.cost != null && ` · ${formatUsd(l.cost)}`}
                    </p>
                  </div>
                  <span className="text-muted" aria-hidden>
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
