import { MILEAGE_RATES } from "@/lib/config";
import type { Platform } from "@/lib/listing-schema";

export type SaleRow = {
  id: string;
  created_at: string;
  status: "active" | "sold";
  cost_paid: number | null;
  sourcing_miles: number | null;
  sold_at: string | null;
  sold_platform: Platform | null;
  sold_price: number | null;
  sale_fees: number | null;
  shipping_cost: number | null;
};

export function mileageRate(date: string): number {
  const d = date.slice(0, 10);
  let rate = MILEAGE_RATES[0].rate;
  for (const r of MILEAGE_RATES) if (d >= r.from) rate = r.rate;
  return rate;
}

const n = (x: number | string | null | undefined) => (x == null ? 0 : Number(x));

/** Profit on one sold item: price minus fees, shipping, item cost, and mileage. */
export function saleProfit(r: SaleRow) {
  const revenue = n(r.sold_price);
  const fees = n(r.sale_fees);
  const shipping = n(r.shipping_cost);
  const cost = n(r.cost_paid);
  const mileage = n(r.sourcing_miles) * mileageRate(r.created_at);
  return { revenue, fees, shipping, cost, mileage, profit: revenue - fees - shipping - cost - mileage };
}

export type Totals = ReturnType<typeof saleProfit> & { count: number };

export function totals(rows: SaleRow[]): Totals {
  const t: Totals = { count: 0, revenue: 0, fees: 0, shipping: 0, cost: 0, mileage: 0, profit: 0 };
  for (const r of rows) {
    const p = saleProfit(r);
    t.count += 1;
    t.revenue += p.revenue;
    t.fees += p.fees;
    t.shipping += p.shipping;
    t.cost += p.cost;
    t.mileage += p.mileage;
    t.profit += p.profit;
  }
  return t;
}

/** Normalizes Postgres numeric (returned as strings) to numbers. */
export function toSaleRow(r: Record<string, unknown>): SaleRow {
  const num = (k: string) => (r[k] == null ? null : Number(r[k]));
  return {
    id: r.id as string,
    created_at: r.created_at as string,
    status: (r.status as SaleRow["status"]) ?? "active",
    cost_paid: num("cost_paid"),
    sourcing_miles: num("sourcing_miles"),
    sold_at: (r.sold_at as string) ?? null,
    sold_platform: (r.sold_platform as Platform) ?? null,
    sold_price: num("sold_price"),
    sale_fees: num("sale_fees"),
    shipping_cost: num("shipping_cost"),
  };
}

export const SALE_COLUMNS =
  "id, created_at, status, cost_paid, sourcing_miles, sold_at, sold_platform, sold_price, sale_fees, shipping_cost";
