"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import { Field, inputClass, Section } from "@/components/fields";
import { formatUsd } from "@/lib/cost";
import { defaultTakeHome, money, pricing, titleFor } from "@/lib/listing-format";
import { CONDITION_GRADES, PLATFORMS, type Listing, type Platform } from "@/lib/listing-schema";
import { PLATFORM_INFO } from "@/lib/platforms";
import { createClient } from "@/lib/supabase/client";
import { PhotoStrip } from "./PhotoStrip";
import { PlatformPanel } from "./PlatformPanel";

type Generation = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number | null;
} | null;

type SaveState = "saved" | "dirty" | "saving" | "error";

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const tagList = (s: string) =>
  [...new Set(s.split(/[,\n]/).map((x) => x.replace(/^#/, "").trim().toLowerCase()).filter(Boolean))];
const num = (s: string) => (s.trim() === "" || isNaN(Number(s)) ? null : Number(s));
const decimal = (s: string) => s.replace(/[^\d.]/g, "");

export function ListingEditor({
  id,
  initial,
  photoUrls,
  thumbnail,
  createdAt,
  photoCount,
  generation,
}: {
  id: string;
  initial: Listing;
  photoUrls: string[];
  thumbnail: string | null;
  createdAt: string;
  photoCount: number;
  generation: Generation;
}) {
  const router = useRouter();
  const [listing, setListing] = useState<Listing>(initial);
  // Free-text mirrors so typing newlines, commas, and decimals isn't swallowed by re-parsing.
  const [text, setText] = useState({
    flaws: initial.condition.flaws.join("\n"),
    keywords: initial.keywords.join(", "),
    hashtags: initial.hashtags.join(", "),
    etsyTags: initial.etsy_tags.join(", "),
    low: String(initial.price.low),
    high: String(initial.price.high),
    goal: initial.take_home_goal == null ? "" : String(initial.take_home_goal),
    lb: initial.weight_oz ? String(Math.floor(initial.weight_oz / 16)) : "",
    oz: initial.weight_oz ? String(Math.round(initial.weight_oz % 16)) : "",
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
  function setT(patch: Partial<typeof text>) {
    setText((t) => ({ ...t, ...patch }));
  }
  const setCondition = (patch: Partial<Listing["condition"]>) =>
    update((l) => ({ ...l, condition: { ...l.condition, ...patch } }));
  const setPrice = (patch: Partial<Listing["price"]>) =>
    update((l) => ({ ...l, price: { ...l.price, ...patch } }));
  const nullable = (v: string) => (v.trim() ? v : null);

  function setWeight(lb: string, oz: string) {
    setT({ lb, oz });
    const total = (num(lb) ?? 0) * 16 + (num(oz) ?? 0);
    set("weight_oz", total > 0 ? total : null);
  }

  function setMeasurement(i: number, patch: Partial<{ name: string; value: string | null }>) {
    update((l) => ({
      ...l,
      measurements: l.measurements.map((m, j) => (j === i ? { ...m, ...patch } : m)),
    }));
  }

  async function remove() {
    if (!confirm("Delete this listing and its photos?")) return;
    const supabase = createClient();
    const { data } = await supabase.from("listings").select("photo_paths").eq("id", id).single();
    if (data?.photo_paths?.length) await supabase.storage.from("listing-photos").remove(data.photo_paths);
    const { error } = await supabase.from("listings").delete().eq("id", id);
    if (!error) {
      router.replace("/history");
      router.refresh();
    }
  }

  const unidentified = !listing.brand || listing.identification_note.trim().length > 0;
  const goalPlaceholder = String(defaultTakeHome(listing));
  const prices = PLATFORMS.map((p) => ({ p, ...pricing(listing, p) }));

  return (
    <div className="space-y-7">
      <div className="flex items-center gap-3">
        {thumbnail && !photoUrls.length && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnail} alt="" className="h-16 w-16 rounded-xl object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">{titleFor(listing, "facebook") || "Listing"}</h1>
          <p className="text-xs text-muted">
            {new Date(createdAt).toLocaleString()} · {photoCount} photo{photoCount === 1 ? "" : "s"} ·{" "}
            <SaveBadge state={save} />
          </p>
        </div>
      </div>

      <PhotoStrip urls={photoUrls} />

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

      {/* One tab per marketplace, fields in that site's form order */}
      <section className="rounded-2xl border border-border bg-surface p-3">
        <div className="-mx-3 flex gap-1 overflow-x-auto px-3 pb-3" role="tablist">
          {PLATFORMS.map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={platform === p}
              onClick={() => setPlatform(p)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${
                platform === p ? "bg-foreground text-background" : "bg-background text-muted"
              }`}
            >
              {PLATFORM_INFO[p].shortLabel}
            </button>
          ))}
        </div>
        <PlatformPanel
          listing={listing}
          platform={platform}
          photoCount={photoUrls.length || photoCount}
          onTitleChange={(v) => update((l) => ({ ...l, titles: { ...l.titles, [platform]: v } }))}
        />
      </section>

      <Section title="Item details · shared by every site">
        <Field
          label="Description"
          multiline
          rows={6}
          value={listing.description}
          onChange={(v) => set("description", v)}
        />
        {(
          [
            ["brand", "Brand"],
            ["model", "Model / style"],
            ["category", "Item type"],
            ["size", "Size"],
            ["color", "Color"],
            ["material", "Material"],
            ["era", "Era"],
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

      <Section title="Measurements">
        <p className="text-xs text-muted">
          Measure flat, in inches. Buyers on Grailed, Poshmark, and eBay expect these.
        </p>
        {listing.measurements.map((m, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              aria-label="Measurement name"
              value={m.name}
              onChange={(e) => setMeasurement(i, { name: e.target.value })}
              className={`${inputClass} flex-1`}
            />
            <input
              aria-label={`${m.name} value`}
              value={m.value ?? ""}
              placeholder="e.g. 21 in"
              onChange={(e) => setMeasurement(i, { value: nullable(e.target.value) })}
              className={`${inputClass} w-28`}
            />
            <button
              type="button"
              aria-label={`Remove ${m.name}`}
              onClick={() => update((l) => ({ ...l, measurements: l.measurements.filter((_, j) => j !== i) }))}
              className="px-2 text-lg text-muted"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => update((l) => ({ ...l, measurements: [...l.measurements, { name: "", value: null }] }))}
          className="text-sm font-medium text-accent"
        >
          + Add measurement
        </button>

        <div>
          <p className="mb-1 text-sm font-medium">Package weight</p>
          <div className="flex items-center gap-2">
            <input
              aria-label="Pounds"
              inputMode="numeric"
              value={text.lb}
              onChange={(e) => setWeight(e.target.value.replace(/\D/g, ""), text.oz)}
              className={`${inputClass} w-20`}
            />
            <span className="text-sm text-muted">lb</span>
            <input
              aria-label="Ounces"
              inputMode="decimal"
              value={text.oz}
              onChange={(e) => setWeight(text.lb, decimal(e.target.value))}
              className={`${inputClass} w-20`}
            />
            <span className="text-sm text-muted">oz</span>
          </div>
          {listing.est_weight_oz && (
            <p className="mt-1 text-xs text-muted">
              Estimated from the photos. Weigh it packed for accurate shipping labels.
            </p>
          )}
        </div>
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
          <p className="mt-1 text-xs text-muted">Each site tab shows this in that site&apos;s own terms.</p>
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
          value={text.flaws}
          placeholder="None seen in photos"
          copyText={listing.condition.flaws.map((f) => `- ${f}`).join("\n")}
          onChange={(v) => {
            setT({ flaws: v });
            setCondition({ flaws: lines(v) });
          }}
        />
      </Section>

      <Section title="Price">
        <div className="rounded-xl bg-background px-3 py-2 text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide">Estimate</span> · Based on the
          photos only. Use the &quot;Check sold listings&quot; buttons before you commit.
        </div>
        <div className="flex items-end gap-2">
          <MoneyInput
            label="Low"
            value={text.low}
            onChange={(v) => {
              setT({ low: v });
              setPrice({ low: num(v) ?? 0 });
            }}
          />
          <span className="pb-3 text-muted">–</span>
          <MoneyInput
            label="High"
            value={text.high}
            onChange={(v) => {
              setT({ high: v });
              setPrice({ high: num(v) ?? 0 });
            }}
          />
        </div>
        {listing.price.basis && <p className="text-sm text-muted">{listing.price.basis}</p>}

        <MoneyInput
          label="What you want to take home"
          value={text.goal}
          placeholder={goalPlaceholder}
          onChange={(v) => {
            setT({ goal: v });
            set("take_home_goal", num(v));
          }}
        />
        <p className="text-xs text-muted">
          Defaults to what the middle of the estimate nets on eBay. Each site&apos;s price below is set
          so you take home about the same after its fees (shipping not included).
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-1 font-medium">Site</th>
              <th className="py-1 text-right font-medium">List at</th>
              <th className="py-1 text-right font-medium">Fees</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {prices.map(({ p, list, fee }) => (
              <tr key={p}>
                <td className="py-2">{PLATFORM_INFO[p].shortLabel}</td>
                <td className="py-2 text-right font-semibold">${list}</td>
                <td className="py-2 text-right text-muted">{money(fee)}</td>
                <td className="py-2 text-right">
                  <CopyButton text={String(list)} className="px-2 py-1 text-xs" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Search terms">
        <Field
          label="Keywords (comma separated)"
          multiline
          rows={3}
          value={text.keywords}
          copyText={listing.keywords.join(", ")}
          onChange={(v) => {
            setT({ keywords: v });
            set("keywords", tagList(v));
          }}
        />
        <Field
          label="Depop hashtags"
          meta={`${listing.hashtags.length}/5`}
          value={text.hashtags}
          copyText={listing.hashtags.map((h) => `#${h}`).join(" ")}
          onChange={(v) => {
            setT({ hashtags: v });
            set("hashtags", tagList(v).map((h) => h.replace(/\s+/g, "")));
          }}
        />
        <Field
          label="Etsy tags"
          multiline
          meta={`${listing.etsy_tags.length}/13`}
          value={text.etsyTags}
          copyText={listing.etsy_tags.join(", ")}
          onChange={(v) => {
            setT({ etsyTags: v });
            set("etsy_tags", tagList(v));
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
  const label = { saved: "Saved", dirty: "Editing…", saving: "Saving…", error: "Not saved — check connection" }[
    state
  ];
  return <span className={state === "error" ? "text-danger" : ""}>{label}</span>;
}

function MoneyInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block flex-1">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <div className="flex items-center rounded-xl border border-border bg-surface px-3 focus-within:border-accent">
        <span className="text-muted">$</span>
        <input
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(decimal(e.target.value))}
          className="w-full bg-transparent px-1 py-2.5 text-base outline-none"
        />
      </div>
    </label>
  );
}
