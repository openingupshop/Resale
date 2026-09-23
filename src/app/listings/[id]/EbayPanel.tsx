"use client";

import { useState } from "react";
import { inputClass } from "@/components/fields";
import type { Listing } from "@/lib/listing-schema";

export type EbayStatus = {
  configured: boolean;
  pricesConfigured: boolean;
  connected: boolean;
  username: string | null;
  listingUrl: string | null;
};

type Aspect = { name: string; required: boolean; multiple: boolean; freeText: boolean; values: string[] };
type Condition = { id: number; enum: string; label: string };
type Option = { id: string; name: string };
type Prepared = {
  categories: { id: string; path: string }[];
  categoryId: string;
  aspects: Aspect[];
  prefilled: Record<string, string[]>;
  condition: { chosen: Condition; allowed: Condition[] };
  setup: { fulfillment: Option[]; payment: Option[]; returns: Option[]; hasLocation: boolean };
  price: number;
};

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json as T;
}

const button =
  "w-full rounded-xl px-4 py-3 text-base font-semibold disabled:opacity-40";

export function EbayPanel({
  listingId,
  listing,
  status,
  onComps,
}: {
  listingId: string;
  listing: Listing;
  status: EbayStatus;
  onComps: (c: Listing["ebay_comps"]) => void;
}) {
  return (
    <div className="space-y-4">
      <EbayComps listingId={listingId} listing={listing} enabled={status.pricesConfigured} onComps={onComps} />
      <EbayPost listingId={listingId} status={status} />
    </div>
  );
}

function EbayComps({
  listingId,
  listing,
  enabled,
  onComps,
}: {
  listingId: string;
  listing: Listing;
  enabled: boolean;
  onComps: (c: Listing["ebay_comps"]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = listing.ebay_comps;
  if (!enabled) return null;

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const { comps } = await post<{ comps: Listing["ebay_comps"] }>("/api/ebay/comps", { listingId });
      if (!comps) setError("Not enough similar eBay listings to compare.");
      else onComps(comps);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-background p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">eBay prices right now</p>
        <button type="button" onClick={load} disabled={busy} className="text-sm font-medium text-accent disabled:opacity-50">
          {busy ? "Checking…" : c ? "Refresh" : "Check"}
        </button>
      </div>
      {c ? (
        <>
          <p className="mt-1">
            {c.count} similar listings · middle half <strong>${Math.round(c.p25)}–${Math.round(c.p75)}</strong> ·
            typical <strong>${Math.round(c.median)}</strong>
          </p>
          <p className="mt-1 text-xs text-muted">
            Asking prices, not sold prices, for &quot;{c.query}&quot; ·{" "}
            {new Date(c.fetchedAt).toLocaleDateString()}. Items often sell below asking.
          </p>
        </>
      ) : (
        <p className="mt-1 text-xs text-muted">Compare with what similar items are listed for on eBay.</p>
      )}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

function EbayPost({ listingId, status }: { listingId: string; status: EbayStatus }) {
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveUrl, setLiveUrl] = useState<string | null>(status.listingUrl);
  const [form, setForm] = useState({
    aspects: {} as Record<string, string>,
    condition: "",
    price: "",
    fulfillment: "",
    payment: "",
    returns: "",
    zip: "",
  });

  if (!status.configured) {
    return (
      <p className="text-xs text-muted">
        Posting straight to eBay turns on once the eBay developer keys are added on the server.
      </p>
    );
  }
  if (!status.connected) {
    return (
      <a
        href={`/api/ebay/connect?returnTo=${encodeURIComponent(`/listings/${listingId}`)}`}
        className={`${button} block border border-border bg-surface text-center`}
      >
        Connect eBay to post directly
      </a>
    );
  }

  async function prepare(categoryId?: string) {
    setLoading(true);
    setError(null);
    try {
      const p = await post<Prepared>("/api/ebay/prepare", { listingId, categoryId });
      setPrepared(p);
      setForm((f) => ({
        ...f,
        aspects: Object.fromEntries(p.aspects.map((a) => [a.name, (p.prefilled[a.name] ?? []).join(", ")])),
        condition: p.condition.chosen.enum,
        price: f.price || String(p.price),
        fulfillment: f.fulfillment || p.setup.fulfillment[0]?.id || "",
        payment: f.payment || p.setup.payment[0]?.id || "",
        returns: f.returns || p.setup.returns[0]?.id || "",
      }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function publish() {
    if (!prepared) return;
    setPublishing(true);
    setError(null);
    try {
      const aspects = Object.fromEntries(
        Object.entries(form.aspects)
          .map(([k, v]) => [k, v.split(",").map((x) => x.trim()).filter(Boolean)] as const)
          .filter(([, v]) => v.length),
      );
      const res = await post<{ url: string }>("/api/ebay/publish", {
        listingId,
        categoryId: prepared.categoryId,
        conditionEnum: form.condition,
        aspects,
        price: Number(form.price),
        policies: { fulfillment: form.fulfillment, payment: form.payment, returns: form.returns },
        postalCode: prepared.setup.hasLocation ? undefined : form.zip,
      });
      setLiveUrl(res.url);
      setPrepared(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPublishing(false);
    }
  }

  const setAspect = (name: string, v: string) =>
    setForm((f) => ({ ...f, aspects: { ...f.aspects, [name]: v } }));

  if (!prepared) {
    return (
      <div className="space-y-2">
        {liveUrl && (
          <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="block rounded-xl bg-accent/10 p-3 text-sm font-medium text-accent">
            Live on eBay · View listing ↗
          </a>
        )}
        <button
          type="button"
          onClick={() => prepare()}
          disabled={loading}
          className={`${button} bg-foreground text-background`}
        >
          {loading ? "Loading eBay details…" : liveUrl ? "Update eBay listing" : "Post to eBay"}
        </button>
        <p className="text-center text-xs text-muted">
          Connected as {status.username ?? "your eBay account"}
        </p>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    );
  }

  const { setup } = prepared;
  const missingPolicies = !setup.fulfillment.length || !setup.payment.length || !setup.returns.length;
  const missingRequired = prepared.aspects.filter((a) => a.required && !form.aspects[a.name]?.trim());
  const canPublish =
    !missingPolicies &&
    !missingRequired.length &&
    Number(form.price) > 0 &&
    (setup.hasLocation || /^\d{5}$/.test(form.zip)) &&
    !publishing;

  return (
    <div className="space-y-4 rounded-xl border border-border p-3">
      <p className="font-semibold">Post to eBay</p>

      <Select
        label="Category"
        value={prepared.categoryId}
        options={prepared.categories.map((c) => ({ id: c.id, name: c.path }))}
        onChange={(id) => prepare(id)}
        disabled={loading}
      />

      <Select
        label="Condition"
        value={form.condition}
        options={(prepared.condition.allowed.length ? prepared.condition.allowed : [prepared.condition.chosen]).map((c) => ({
          id: c.enum,
          name: c.label,
        }))}
        onChange={(v) => setForm((f) => ({ ...f, condition: v }))}
      />

      <div className="space-y-3">
        <p className="text-sm font-medium">Item specifics</p>
        {prepared.aspects.map((a) => {
          const value = form.aspects[a.name] ?? "";
          const label = `${a.name}${a.required ? " *" : ""}`;
          const listId = `aspect-${a.name.replace(/\W+/g, "-")}`;
          if (!a.freeText && a.values.length) {
            return (
              <Select
                key={a.name}
                label={label}
                value={value}
                options={[{ id: "", name: "Choose…" }, ...a.values.map((v) => ({ id: v, name: v }))]}
                onChange={(v) => setAspect(a.name, v)}
              />
            );
          }
          return (
            <label key={a.name} className="block">
              <span className="mb-1 block text-sm">{label}</span>
              <input
                value={value}
                list={a.values.length ? listId : undefined}
                placeholder={a.multiple ? "Separate values with commas" : a.name === "Brand" ? "Only if you can confirm it" : ""}
                onChange={(e) => setAspect(a.name, e.target.value)}
                className={inputClass}
              />
              {a.values.length > 0 && (
                <datalist id={listId}>
                  {a.values.map((v) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
              )}
            </label>
          );
        })}
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Price</span>
        <div className="flex items-center rounded-xl border border-border bg-surface px-3">
          <span className="text-muted">$</span>
          <input
            inputMode="decimal"
            value={form.price}
            onChange={(e) => setForm((f) => ({ ...f, price: e.target.value.replace(/[^\d.]/g, "") }))}
            className="w-full bg-transparent px-1 py-2.5 text-base outline-none"
          />
        </div>
      </label>

      {missingPolicies ? (
        <div className="rounded-xl bg-warn-bg p-3 text-sm text-warn-fg">
          Your eBay account needs shipping, payment, and return policies before listings can be posted.{" "}
          <a href="https://www.ebay.com/bp/manage" target="_blank" rel="noopener noreferrer" className="font-semibold underline">
            Set them up on eBay
          </a>
          , then tap Post to eBay again.
        </div>
      ) : (
        <>
          <Select label="Shipping policy" value={form.fulfillment} options={setup.fulfillment} onChange={(v) => setForm((f) => ({ ...f, fulfillment: v }))} />
          <Select label="Payment policy" value={form.payment} options={setup.payment} onChange={(v) => setForm((f) => ({ ...f, payment: v }))} />
          <Select label="Return policy" value={form.returns} options={setup.returns} onChange={(v) => setForm((f) => ({ ...f, returns: v }))} />
        </>
      )}

      {!setup.hasLocation && (
        <label className="block">
          <span className="mb-1 block text-sm font-medium">ZIP code you ship from</span>
          <input
            inputMode="numeric"
            value={form.zip}
            onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value.replace(/\D/g, "").slice(0, 5) }))}
            className={inputClass}
          />
        </label>
      )}

      {missingRequired.length > 0 && (
        <p className="text-xs text-warn-fg">Still needed: {missingRequired.map((a) => a.name).join(", ")}</p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}

      <button type="button" onClick={publish} disabled={!canPublish} className={`${button} bg-accent text-accent-foreground`}>
        {publishing ? "Posting to eBay…" : "Publish on eBay"}
      </button>
      <button type="button" onClick={() => setPrepared(null)} className="w-full py-1 text-sm text-muted">
        Cancel
      </button>
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: { id: string; name: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={inputClass}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
