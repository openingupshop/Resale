import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { formatUsd } from "@/lib/cost";
import { formatPrice, money } from "@/lib/listing-format";
import { ListingSchema } from "@/lib/listing-schema";
import { PLATFORM_INFO } from "@/lib/platforms";
import { saleProfit, SALE_COLUMNS, toSaleRow } from "@/lib/profit";
import { createClient } from "@/lib/supabase/server";
import { getDailyUsage } from "@/lib/usage";

const FILTERS = { all: "All", active: "Active", sold: "Sold" } as const;
type Filter = keyof typeof FILTERS;

export default async function HistoryPage({ searchParams }: PageProps<"/history">) {
  const { status } = await searchParams;
  const filter: Filter = status === "active" || status === "sold" ? status : "all";
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) redirect("/login");

  let listingsQuery = supabase
    .from("listings")
    .select(`${SALE_COLUMNS}, thumbnail, data, generations(cost_usd)`)
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter !== "all") listingsQuery = listingsQuery.eq("status", filter);

  const [{ data: rows }, { data: gens }, usage] = await Promise.all([
    listingsQuery,
    supabase.from("generations").select("cost_usd, status"),
    getDailyUsage(supabase, userId),
  ]);

  const totalCost = (gens ?? []).reduce((s, g) => s + Number(g.cost_usd), 0);
  const listings = (rows ?? []).flatMap((r) => {
    const parsed = ListingSchema.safeParse(r.data);
    if (!parsed.success) return [];
    const cost = (r.generations as { cost_usd: number | string }[] | null)?.[0]?.cost_usd;
    return [{ ...r, data: parsed.data, sale: toSaleRow(r), cost: cost == null ? null : Number(cost) }];
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

        <div className="mt-3 flex gap-1 rounded-xl bg-surface p-1">
          {(Object.keys(FILTERS) as Filter[]).map((f) => (
            <Link
              key={f}
              href={f === "all" ? "/history" : `/history?status=${f}`}
              className={`flex-1 rounded-lg py-1.5 text-center text-sm font-semibold ${
                f === filter ? "bg-foreground text-background" : "text-muted"
              }`}
            >
              {FILTERS[f]}
            </Link>
          ))}
        </div>

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
                      {l.sale.status === "sold" ? (
                        <>
                          <span className="font-semibold text-accent">Sold</span>
                          {l.sale.sold_platform && ` on ${PLATFORM_INFO[l.sale.sold_platform].shortLabel}`} ·
                          profit {money(saleProfit(l.sale).profit)}
                        </>
                      ) : (
                        <>{formatPrice(l.data)} est.</>
                      )}{" "}
                      · {new Date(l.created_at).toLocaleDateString()}
                      {l.cost != null && ` · AI ${formatUsd(l.cost)}`}
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
