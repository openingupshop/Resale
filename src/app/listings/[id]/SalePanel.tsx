"use client";

import { useState } from "react";
import { inputClass, Section } from "@/components/fields";
import { money } from "@/lib/listing-format";
import { PLATFORMS, type Platform } from "@/lib/listing-schema";
import { PLATFORM_INFO } from "@/lib/platforms";
import { mileageRate, saleProfit, type SaleRow } from "@/lib/profit";
import { createClient } from "@/lib/supabase/client";

const str = (n: number | null) => (n == null ? "" : String(n));
const num = (s: string) => (s.trim() === "" || isNaN(Number(s)) ? null : Number(s));
const decimal = (s: string) => s.replace(/[^\d.]/g, "");
const today = () => new Date().toISOString().slice(0, 10);

export function SalePanel({
  initial,
  apparel,
  suggestedPrice,
}: {
  initial: SaleRow;
  apparel: boolean;
  suggestedPrice: (p: Platform) => number;
}) {
  const [f, setF] = useState({
    cost: str(initial.cost_paid),
    miles: str(initial.sourcing_miles),
    sold: initial.status === "sold",
    soldAt: initial.sold_at ?? today(),
    platform: (initial.sold_platform ?? "ebay") as Platform,
    price: str(initial.sold_price),
    fees: str(initial.sale_fees),
    shipping: str(initial.shipping_cost),
  });
  const [feesEdited, setFeesEdited] = useState(initial.sale_fees != null);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const autoFees = (platform: Platform, price: string) =>
    num(price) ? PLATFORM_INFO[platform].fees.fee(num(price)!, { apparel }).toFixed(2) : "";

  function patch(p: Partial<typeof f>) {
    setState("idle");
    setF((prev) => {
      const next = { ...prev, ...p };
      if (!feesEdited && ("price" in p || "platform" in p)) next.fees = autoFees(next.platform, next.price);
      return next;
    });
  }

  const row: SaleRow = {
    ...initial,
    status: f.sold ? "sold" : "active",
    cost_paid: num(f.cost),
    sourcing_miles: num(f.miles),
    sold_at: f.sold ? f.soldAt : null,
    sold_platform: f.sold ? f.platform : null,
    sold_price: f.sold ? num(f.price) : null,
    sale_fees: f.sold ? num(f.fees) : null,
    shipping_cost: f.sold ? num(f.shipping) : null,
  };
  const p = saleProfit(row);

  async function save() {
    setState("saving");
    const { id, created_at: _created, ...columns } = row;
    void _created;
    const { error } = await createClient().from("listings").update(columns).eq("id", id);
    setState(error ? "error" : "saved");
  }

  const money$ = (label: string, value: string, onChange: (v: string) => void, hint?: string) => (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <div className="flex items-center rounded-xl border border-border bg-surface px-3 focus-within:border-accent">
        <span className="text-muted">$</span>
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(decimal(e.target.value))}
          className="w-full bg-transparent px-1 py-2.5 text-base outline-none"
        />
      </div>
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );

  return (
    <Section title="Sale & profit">
      <div className="grid grid-cols-2 gap-3">
        {money$("What you paid", f.cost, (v) => patch({ cost: v }))}
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Sourcing miles</span>
          <input
            inputMode="decimal"
            value={f.miles}
            onChange={(e) => patch({ miles: decimal(e.target.value) })}
            className={inputClass}
          />
          <span className="mt-1 block text-xs text-muted">
            ${mileageRate(initial.created_at).toFixed(3).replace(/0$/, "")}/mi IRS rate
          </span>
        </label>
      </div>

      <div className="flex gap-1 rounded-xl bg-background p-1">
        {(["Active", "Sold"] as const).map((label) => {
          const on = (label === "Sold") === f.sold;
          return (
            <button
              key={label}
              type="button"
              onClick={() => {
                const sold = label === "Sold";
                patch({ sold, ...(sold && !f.price ? { price: String(suggestedPrice(f.platform)) } : {}) });
              }}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold ${on ? "bg-surface shadow-sm" : "text-muted"}`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {f.sold && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Sold on</span>
              <select
                value={f.platform}
                onChange={(e) => patch({ platform: e.target.value as Platform })}
                className={inputClass}
              >
                {PLATFORMS.map((pl) => (
                  <option key={pl} value={pl}>
                    {PLATFORM_INFO[pl].shortLabel}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Date sold</span>
              <input type="date" value={f.soldAt} onChange={(e) => patch({ soldAt: e.target.value })} className={inputClass} />
            </label>
          </div>
          {money$("Sold for", f.price, (v) => patch({ price: v }))}
          <div className="grid grid-cols-2 gap-3">
            {money$(
              "Fees",
              f.fees,
              (v) => {
                setFeesEdited(true);
                patch({ fees: v });
              },
              feesEdited ? "Edited" : "Estimated from the site's fees",
            )}
            {money$("Shipping label", f.shipping, (v) => patch({ shipping: v }), "If you paid it")}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface p-3 text-sm">
        {f.sold ? (
          <>
            <Line label="Sold for" value={p.revenue} />
            <Line label="Fees" value={-p.fees} />
            <Line label="Shipping" value={-p.shipping} />
            <Line label="Item cost" value={-p.cost} />
            {p.mileage > 0 && <Line label="Mileage" value={-p.mileage} />}
            <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold">
              <span>Profit</span>
              <span className={p.profit < 0 ? "text-danger" : ""}>{money(p.profit)}</span>
            </div>
          </>
        ) : (
          <p className="text-muted">Mark it sold to see your profit.</p>
        )}
      </div>

      <button
        type="button"
        onClick={save}
        disabled={state === "saving"}
        className="w-full rounded-xl bg-foreground py-3 text-base font-semibold text-background disabled:opacity-50"
      >
        {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Save sale details"}
      </button>
      {state === "error" && <p className="text-sm text-danger">Couldn&apos;t save. Check your connection.</p>}
    </Section>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span>{value < 0 ? `−${money(-value)}` : money(value)}</span>
    </div>
  );
}
