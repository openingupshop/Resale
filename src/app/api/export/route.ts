import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { titleFor } from "@/lib/listing-format";
import { ListingSchema } from "@/lib/listing-schema";
import { PLATFORM_INFO } from "@/lib/platforms";
import { mileageRate, SALE_COLUMNS, saleProfit, toSaleRow } from "@/lib/profit";

const csvCell = (v: string | number | null) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Sold items as CSV for bookkeeping. */
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const period = request.nextUrl.searchParams.get("period");
  const now = new Date();
  let query = auth.supabase
    .from("listings")
    .select(`${SALE_COLUMNS}, data`)
    .eq("status", "sold")
    .order("sold_at");
  if (period === "month") {
    query = query.gte("sold_at", new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10));
  } else if (period !== "all") {
    query = query.gte("sold_at", `${now.getUTCFullYear()}-01-01`);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Couldn't load sales" }, { status: 500 });

  const header = ["Date sold", "Item", "Site", "Sold for", "Fees", "Shipping", "Item cost", "Miles", "Mileage rate", "Mileage", "Profit"];
  const lines = (data ?? []).map((r) => {
    const sale = toSaleRow(r);
    const l = ListingSchema.safeParse(r.data);
    const p = saleProfit(sale);
    return [
      sale.sold_at,
      l.success ? titleFor(l.data, "ebay") : "",
      sale.sold_platform ? PLATFORM_INFO[sale.sold_platform].label : "",
      p.revenue.toFixed(2),
      p.fees.toFixed(2),
      p.shipping.toFixed(2),
      p.cost.toFixed(2),
      sale.sourcing_miles ?? "",
      mileageRate(sale.created_at),
      p.mileage.toFixed(2),
      p.profit.toFixed(2),
    ].map(csvCell).join(",");
  });
  const csv = [header.join(","), ...lines].join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sales-${period ?? "year"}-${now.toISOString().slice(0, 10)}.csv"`,
    },
  });
}
