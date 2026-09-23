"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import { EBAY_TITLE_MAX } from "@/lib/config";
import { formatUsd } from "@/lib/cost";
import {
  fullListingText,
  PLATFORM_LABELS,
  type Platform,
} from "@/lib/listing-format";
import { CONDITION_GRADES, type Listing } from "@/lib/listing-schema";
import { createClient } from "@/lib/supabase/client";

type Generation = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number | null;
} | null;

type SaveState = "saved" | "dirty" | "saving" | "error";

const inputClass =
  "w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-base outline-none focus:border-accent";

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const commaList = (s: string) =>
  [...new Set(s.split(/[,\n]/).map((x) => x.trim().toLowerCase()).filter(Boolean))];

export function ListingEditor({
  id,
  initial,
  thumbnail,
  createdAt,
  photoCount,
  generation,
}: {
  id: string;
  initial: Listing;
  thumbnail: string | null;
  createdAt: string;
  photoCount: number;
  generation: Generation;
}) {
  const router = useRouter();
  const [listing, setListing] = useState<Listing>(initial);
  // Free-text mirrors so typing newlines/commas isn't swallowed by re-parsing.
  const [flawsText, setFlawsText] = useState(initial.condition.flaws.join("\n"));
  const [keywordsText, setKeywordsText] = useState(initial.keywords.join(", "));
  const [priceText, setPriceText] = useState({
    low: String(initial.price.low),
    high: String(initial.price.high),
  });
  const [save, setSave] = useState<SaveState>("saved");
  const [platform, setPlatform] = useState<Platform>("ebay");
  const lastSaved = useRef(JSON.stringify(initial));

  // Debounced autosave; skips when nothing changed since the last save.
  useEffect(() => {
    const json = JSON.stringify(listing);
    if (json === lastSaved.current) return;
    const t = setTimeout(async () => {
      setSave("saving");
      const { error } = await createClient()
        .from("listings")
        .update({ data: listing })
        .eq("id", id);
      if (!error) lastSaved.current = json;
      setSave(error ? "error" : "saved");
    }, 800);
    return () => clearTimeout(t);
  }, [listing, id]);

  function update(fn: (l: Listing) => Listing) {
    setSave("dirty");
    setListing(fn);
  }
  function set<K extends keyof Listing>(key: K, value: Listing[K]) {
    update((l) => ({ ...l, [key]: value }));
  }
  const setTitle = (p: Platform, v: string) =>
    update((l) => ({ ...l, titles: { ...l.titles, [p]: v } }));
  const setCondition = (patch: Partial<Listing["condition"]>) =>
    update((l) => ({ ...l, condition: { ...l.condition, ...patch } }));
  const setPrice = (patch: Partial<Listing["price"]>) =>
    update((l) => ({ ...l, price: { ...l.price, ...patch } }));
  const nullable = (v: string) => (v.trim() ? v : null);

  async function remove() {
    if (!confirm("Delete this listing?")) return;
    const { error } = await createClient().from("listings").delete().eq("id", id);
    if (!error) {
      router.replace("/history");
      router.refresh();
    }
  }

  const ebayLen = listing.titles.ebay.length;
  const unidentified = !listing.brand || listing.identification_note.trim().length > 0;
  const priceLabel =
    listing.price.low === listing.price.high
      ? `$${listing.price.low}`
      : `$${listing.price.low}–$${listing.price.high}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        {thumbnail && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnail} alt="" className="h-16 w-16 rounded-xl object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">{listing.titles.facebook || "Listing"}</h1>
          <p className="text-xs text-muted">
            {new Date(createdAt).toLocaleString()} · {photoCount} photo{photoCount === 1 ? "" : "s"} ·{" "}
            <SaveBadge state={save} />
          </p>
        </div>
      </div>

      {/* Copy the whole listing for one platform */}
      <section className="rounded-2xl border border-border bg-surface p-3">
        <div className="flex gap-1 rounded-xl bg-background p-1">
          {(Object.keys(PLATFORM_LABELS) as Platform[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlatform(p)}
              className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold ${
                platform === p ? "bg-surface shadow-sm" : "text-muted"
              }`}
            >
              {p === "facebook" ? "Facebook" : PLATFORM_LABELS[p]}
            </button>
          ))}
        </div>
        <CopyButton
          text={fullListingText(listing, platform)}
          label={`Copy full ${PLATFORM_LABELS[platform]} listing`}
          primary
          className="mt-3 w-full py-3 text-base"
        />
      </section>

      {unidentified && (
        <div className="rounded-2xl bg-warn-bg p-3 text-sm text-warn-fg">
          <p className="font-semibold">
            {listing.brand ? "Check before posting" : "Brand not visible in photos"}
          </p>
          <p className="mt-0.5">
            {listing.identification_note ||
              "No brand was readable, so none was added. Add it below if you know it."}
          </p>
        </div>
      )}

      <Section title="Titles">
        <Field
          label="eBay"
          multiline
          value={listing.titles.ebay}
          onChange={(v) => setTitle("ebay", v)}
          meta={
            <span className={ebayLen > EBAY_TITLE_MAX ? "font-semibold text-danger" : ""}>
              {ebayLen}/{EBAY_TITLE_MAX}
            </span>
          }
        />
        <Field label="Poshmark" value={listing.titles.poshmark} onChange={(v) => setTitle("poshmark", v)} />
        <Field
          label="Facebook Marketplace"
          value={listing.titles.facebook}
          onChange={(v) => setTitle("facebook", v)}
        />
      </Section>

      <Section title="Description">
        <Field
          label="Description"
          hideLabel
          multiline
          rows={7}
          value={listing.description}
          onChange={(v) => set("description", v)}
        />
      </Section>

      <Section title="Details">
        {(
          [
            ["brand", "Brand"],
            ["model", "Model / style"],
            ["category", "Category"],
            ["size", "Size"],
            ["color", "Color"],
            ["material", "Material"],
          ] as const
        ).map(([key, label]) => (
          <Field
            key={key}
            label={label}
            value={listing[key] ?? ""}
            placeholder={key === "brand" || key === "model" ? "Not visible in photos" : "Not determined"}
            onChange={(v) => set(key, nullable(v))}
          />
        ))}
      </Section>

      <Section title="Condition">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="grade">
            Grade
          </label>
          <select
            id="grade"
            value={listing.condition.grade}
            onChange={(e) => setCondition({ grade: e.target.value as Listing["condition"]["grade"] })}
            className={inputClass}
          >
            {CONDITION_GRADES.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </div>
        <Field
          label="Condition notes"
          multiline
          rows={3}
          value={listing.condition.summary}
          onChange={(v) => setCondition({ summary: v })}
        />
        <Field
          label="Visible flaws (one per line)"
          multiline
          rows={Math.max(2, listing.condition.flaws.length + 1)}
          value={flawsText}
          placeholder="None seen in photos"
          copyText={listing.condition.flaws.map((f) => `- ${f}`).join("\n")}
          onChange={(v) => {
            setFlawsText(v);
            setCondition({ flaws: lines(v) });
          }}
        />
      </Section>

      <Section title="Price">
        <div className="rounded-xl bg-background px-3 py-2 text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide">Estimate</span> · Based on the
          photos only. Check recent sold listings before pricing.
        </div>
        <div className="flex items-end gap-2">
          <PriceInput
            label="Low"
            value={priceText.low}
            onChange={(v) => {
              setPriceText((p) => ({ ...p, low: v }));
              setPrice({ low: Number(v) || 0 });
            }}
          />
          <span className="pb-3 text-muted">–</span>
          <PriceInput
            label="High"
            value={priceText.high}
            onChange={(v) => {
              setPriceText((p) => ({ ...p, high: v }));
              setPrice({ high: Number(v) || 0 });
            }}
          />
          <CopyButton text={priceLabel} className="mb-1" />
        </div>
        {listing.price.basis && <p className="text-sm text-muted">{listing.price.basis}</p>}
      </Section>

      <Section title="Search keywords">
        <Field
          label="Keywords (comma separated)"
          hideLabel
          multiline
          rows={3}
          value={keywordsText}
          copyText={listing.keywords.join(", ")}
          onChange={(v) => {
            setKeywordsText(v);
            set("keywords", commaList(v));
          }}
        />
      </Section>

      <footer className="space-y-3 border-t border-border pt-4 text-xs text-muted">
        {generation && (
          <p>
            {generation.model} · {generation.inputTokens.toLocaleString()} in /{" "}
            {generation.outputTokens.toLocaleString()} out tokens · {formatUsd(generation.costUsd)}
            {generation.durationMs ? ` · ${(generation.durationMs / 1000).toFixed(1)}s` : ""}
          </p>
        )}
        <button type="button" onClick={remove} className="text-danger">
          Delete listing
        </button>
      </footer>
    </div>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  const text = { saved: "Saved", dirty: "Editing…", saving: "Saving…", error: "Not saved — check connection" }[state];
  return <span className={state === "error" ? "text-danger" : ""}>{text}</span>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline,
  rows = 2,
  placeholder,
  meta,
  hideLabel,
  copyText,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  meta?: React.ReactNode;
  hideLabel?: boolean;
  copyText?: string;
}) {
  const id = `f-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div>
      <div className={`mb-1 flex items-center justify-between gap-2 ${hideLabel ? "sr-only" : ""}`}>
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {meta && <span className="text-xs text-muted">{meta}</span>}
      </div>
      <div className="flex items-start gap-2">
        {multiline ? (
          <textarea
            id={id}
            rows={rows}
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            className={`${inputClass} resize-y`}
          />
        ) : (
          <input
            id={id}
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
          />
        )}
        <CopyButton text={copyText ?? value} className="mt-1" />
      </div>
    </div>
  );
}

function PriceInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex-1">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <div className="flex items-center rounded-xl border border-border bg-surface px-3 focus-within:border-accent">
        <span className="text-muted">$</span>
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
          className="w-full bg-transparent px-1 py-2.5 text-base outline-none"
        />
      </div>
    </label>
  );
}
