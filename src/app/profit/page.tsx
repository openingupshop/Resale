import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { money, titleFor } from "@/lib/listing-format";
import { ListingSchema, PLATFORMS } from "@/lib/listing-schema";
import { PLATFORM_INFO } from "@/lib/platforms";
import { SALE_COLUMNS, saleProfit, toSaleRow, totals } from "@/lib/profit";
import { createClient } from "@/lib/supabase/server";

const PERIODS = { month: "This month", year: "This year", all: "All time" } as const;
type Period = keyof typeof PERIODS;

function periodStart(p: Period): string | null {
  const now = new Date();
  if (p === "month") return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  if (p === "year") return `${now.getUTCFullYear()}-01-01`;
  return null;
}

export default async function ProfitPage({ searchParams }: PageProps<"/profit">) {
  const { period: raw } = await searchParams;
  const period: Period = raw === "month" || raw === "all" ? raw : "year";
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/login");

  let query = supabase
    .from("listings")
    .select(`${SALE_COLUMNS}, data`)
    .eq("status", "sold")
    .order("sold_at", { ascending: false });
  const start = periodStart(period);
  if (start) query = query.gte("sold_at", start);

  const [{ data: soldRows }, { data: activeRows }] = await Promise.all([
    query,
    supabase.from("listings").select("cost_paid").eq("status", "active"),
  ]);
  const sold = (soldRows ?? []).map((r) => ({
    sale: toSaleRow(r),
    title: (() => {
      const l = ListingSchema.safeParse(r.data);
      return l.success ? titleFor(l.data, "ebay") : "Listing";
    })(),
  }));
  const t = totals(sold.map((s) => s.sale));
  const inventoryCost = (activeRows ?? []).reduce((sum, r) => sum + Number(r.cost_paid ?? 0), 0);
  const byPlatform = PLATFORMS.map((p) => ({
    p,
    ...totals(sold.filter((s) => s.sale.sold_platform === p).map((s) => s.sale)),
  })).filter((x) => x.count > 0);

  return (
    <>
      <AppHeader active="profit" />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-16 pt-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">Profit</h1>
          <a href={`/api/export?period=${period}`} className="text-sm font-medium text-accent">
            Export CSV
          </a>
        </div>

        <div className="mt-3 flex gap-1 rounded-xl bg-surface p-1">
          {(Object.keys(PERIODS) as Period[]).map((p) => (
            <Link
              key={p}
              href={`/profit?period=${p}`}
              className={`flex-1 rounded-lg py-1.5 text-center text-sm font-semibold ${
                p === period ? "bg-foreground text-background" : "text-muted"
              }`}
            >
              {PERIODS[p]}
            </Link>
          ))}
        </div>

        <section className="mt-4 rounded-2xl border border-border bg-surface p-4">
          <p className="text-sm text-muted">Profit · {t.count} sold</p>
          <p className={`text-3xl font-semibold ${t.profit < 0 ? "text-danger" : ""}`}>{money(t.profit)}</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <Stat label="Sales" value={money(t.revenue)} />
            <Stat label="Fees" value={money(t.fees)} />
            <Stat label="Shipping" value={money(t.shipping)} />
            <Stat label="Item cost" value={money(t.cost)} />
            <Stat label="Mileage" value={money(t.mileage)} />
            <Stat label="Unsold stock cost" value={money(inventoryCost)} />
          </dl>
        </section>

        {byPlatform.length > 0 && (
          <section className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">By site</h2>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-1 font-medium">Site</th>
                  <th className="py-1 text-right font-medium">Sold</th>
                  <th className="py-1 text-right font-medium">Sales</th>
                  <th className="py-1 text-right font-medium">Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {byPlatform.map((x) => (
                  <tr key={x.p}>
                    <td className="py-2">{PLATFORM_INFO[x.p].shortLabel}</td>
                    <td className="py-2 text-right">{x.count}</td>
                    <td className="py-2 text-right">{money(x.revenue)}</td>
                    <td className="py-2 text-right font-semibold">{money(x.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Sales</h2>
          {sold.length === 0 ? (
            <p className="mt-2 text-sm text-muted">
              Nothing marked sold in this period. Open a listing and use &quot;Sale &amp; profit&quot;.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {sold.map(({ sale, title }) => {
                const p = saleProfit(sale);
                return (
                  <li key={sale.id}>
                    <Link href={`/listings/${sale.id}`} className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{title}</p>
                        <p className="text-xs text-muted">
                          {sale.sold_platform ? PLATFORM_INFO[sale.sold_platform].shortLabel : ""} ·{" "}
                          {sale.sold_at} · sold {money(p.revenue)}
                        </p>
                      </div>
                      <span className={`text-sm font-semibold ${p.profit < 0 ? "text-danger" : ""}`}>{money(p.profit)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <p className="mt-6 text-xs text-muted">
          Mileage uses the IRS standard business rate for the date the listing was created. This is a
          bookkeeping aid, not tax advice.
        </p>
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
