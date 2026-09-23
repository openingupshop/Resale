import type { Listing, Platform } from "@/lib/listing-schema";
import { FUNCTIONAL_LABELS, ITEM_TYPE_INFO } from "@/lib/item-types";
import { listPriceFor, PLATFORM_INFO, takeHome } from "@/lib/platforms";

export function formatPrice(l: Listing): string {
  const { low, high } = l.price;
  const f = (n: number) => `$${Math.round(n)}`;
  return low === high ? f(low) : `${f(low)}–${f(high)}`;
}

export function money(n: number): string {
  return `$${n.toFixed(2).replace(/\.00$/, "")}`;
}

/** Title for a site, falling back for listings saved before that site existed. */
export function titleFor(l: Listing, p: Platform): string {
  return l.titles[p] || l.titles.poshmark || l.titles.ebay || "";
}

/** Default take-home goal: what the middle of the estimate nets on eBay. */
export function defaultTakeHome(l: Listing): number {
  const mid = (l.price.low + l.price.high) / 2;
  return Math.max(0, Math.round(takeHome("ebay", mid, l.is_apparel)));
}

export function takeHomeGoal(l: Listing): number {
  return l.take_home_goal ?? defaultTakeHome(l);
}

export function pricing(l: Listing, p: Platform) {
  const goal = takeHomeGoal(l);
  const list = listPriceFor(p, goal, l.is_apparel);
  const fee = PLATFORM_INFO[p].fees.fee(list, { apparel: l.is_apparel });
  return { goal, list, fee, net: list - fee };
}

export function measurementLines(l: Listing): string[] {
  return l.measurements
    .filter((m) => m.value && m.value.trim())
    .map((m) => `${m.name}: ${m.value}`);
}

export function weightLabel(oz: number | null): string {
  if (!oz) return "";
  const lb = Math.floor(oz / 16);
  const rest = Math.round(oz - lb * 16);
  return lb ? `${lb} lb${rest ? ` ${rest} oz` : ""}` : `${rest} oz`;
}

/** Keywords for the "Check prices" searches. An ISBN finds the exact book. */
export function searchQuery(l: Listing): string {
  if (l.barcode?.type === "ISBN") return l.barcode.value;
  return [l.brand, l.model, l.category].filter(Boolean).join(" ") || l.keywords.slice(0, 4).join(" ");
}

/** First detail whose name contains any of `names` (lowercase). */
export const detail = (l: Listing, ...names: string[]) =>
  l.details.find((d) => names.some((n) => d.name.toLowerCase().includes(n)))?.value ?? null;

/** Detail with exactly this name, so "Grade" doesn't pick up "Graded". */
export const detailExact = (l: Listing, name: string) =>
  l.details.find((d) => d.name.toLowerCase() === name)?.value ?? detail(l, `${name} `, `${name}:`);

/** Whether a trading card is in a grading slab, from the details read. */
export function isGradedCard(l: Listing): boolean {
  const graded = detailExact(l, "graded");
  return Boolean(graded && /^y/i.test(graded)) || Boolean(detail(l, "grading company", "grader"));
}

/** Broken items are listed for parts whatever the cosmetic grade. */
export function effectiveGrade(l: Listing) {
  return l.functional_status === "not_working" ? ("Poor / for parts" as const) : l.condition.grade;
}

export function siteCondition(l: Listing, p: Platform): string {
  // eBay lists cards as Graded or Ungraded rather than on the usual scale.
  if (p === "ebay" && l.item_type === "trading_cards" && l.functional_status !== "not_working") {
    return isGradedCard(l) ? "Graded" : "Ungraded";
  }
  return PLATFORM_INFO[p].condition(effectiveGrade(l), { apparel: l.is_apparel });
}

export function detailLines(l: Listing): string[] {
  const lines = l.details.filter((d) => d.value && d.value.trim()).map((d) => `${d.name}: ${d.value}`);
  if (l.barcode?.value) lines.push(`${l.barcode.type}: ${l.barcode.value}`);
  return lines;
}

/** Sites that fit this kind of item, best first. */
export function sitesFor(l: Listing): Platform[] {
  return ITEM_TYPE_INFO[l.item_type].sites;
}

/** Sites without structured fields for these get them in the description. */
const DETAILS_IN_DESCRIPTION: Platform[] = ["facebook", "offerup"];

export function descriptionFor(l: Listing, p: Platform): string {
  const parts: string[] = [];
  if (p === "depop" && l.titles.depop) parts.push(l.titles.depop, "");
  parts.push(l.description.trim());

  if (DETAILS_IN_DESCRIPTION.includes(p)) {
    const details = [
      l.brand && `Brand: ${l.brand}`,
      l.size && `Size: ${l.size}`,
      l.color && `Color: ${l.color}`,
      l.material && `Material: ${l.material}`,
      `Condition: ${siteCondition(l, p)}`,
    ].filter(Boolean) as string[];
    parts.push("", ...details);
  }
  // Etsy's form has no condition field, so it goes in the description.
  if (p === "etsy") {
    parts.push("");
    if (l.era) parts.push(`Era: ${l.era}`);
    parts.push(`Condition: ${siteCondition(l, "etsy")}`);
  }

  if (l.functional_status !== "not_applicable") {
    const status = {
      tested_working: "Tested and working.",
      untested: "Untested; sold as-is.",
      not_working: "Not working; sold for parts or repair.",
    }[l.functional_status];
    parts.push("", status);
  }

  const details = detailLines(l);
  if (details.length) parts.push("", ...details);

  const measurements = measurementLines(l);
  const heading = ITEM_TYPE_INFO[l.item_type].measurementsHeading;
  if (heading && measurements.length) {
    parts.push("", `${heading}:`, ...measurements.map((m) => `- ${m}`));
  }
  if (l.condition.flaws.length) {
    parts.push("", "Flaws:", ...l.condition.flaws.map((f) => `- ${f}`));
  }
  if (p === "depop" && l.hashtags.length) {
    parts.push("", l.hashtags.map((h) => `#${h}`).join(" "));
  }
  return parts.join("\n");
}

export type SiteField = { label: string; value: string; note?: string };

/** The fields a site's listing form asks for, in roughly the order it asks. */
export function siteFields(l: Listing, p: Platform): SiteField[] {
  const price = pricing(l, p);
  const fields: SiteField[] = [
    { label: "Category", value: l.categories[p] || l.category || "", note: "Suggested" },
    { label: "Brand", value: l.brand ?? "", note: l.brand ? undefined : "Not visible in photos" },
    { label: "Size", value: l.size ?? "" },
    { label: "Condition", value: siteCondition(l, p) },
    { label: "Color", value: l.color ?? "" },
  ]
    .filter((f) => !(p === "etsy" && f.label === "Condition"))
    .filter((f) => l.item_type === "clothing" || f.label !== "Size" || f.value);
  if (l.functional_status !== "not_applicable") {
    fields.push({ label: "Working?", value: FUNCTIONAL_LABELS[l.functional_status] });
  }
  if (l.barcode?.value && (p === "ebay" || p === "mercari")) {
    fields.push({ label: l.barcode.type, value: l.barcode.value });
  }
  if (p === "ebay" || p === "etsy") fields.push({ label: "Material", value: l.material ?? "" });
  if (p === "etsy") fields.push({ label: "When made", value: l.era ?? "" });
  if (p === "etsy" && l.etsy_tags.length) {
    fields.push({ label: "Tags", value: l.etsy_tags.join(", "), note: `${l.etsy_tags.length}/13` });
  }
  if (p === "ebay" || p === "mercari" || p === "poshmark") {
    fields.push({ label: "Package weight", value: weightLabel(l.weight_oz) });
  }
  fields.push({
    label: "Price",
    value: String(price.list),
    note: `You take home about ${money(price.net)} after fees`,
  });
  return fields;
}

/** Everything for one site in one block, for a single copy. */
export function fullListingText(l: Listing, p: Platform): string {
  const title = PLATFORM_INFO[p].titleMax === null ? null : titleFor(l, p);
  const inDescription = DETAILS_IN_DESCRIPTION.includes(p);
  const fields = siteFields(l, p)
    .filter((f) => f.value)
    .filter((f) => !inDescription || f.label === "Category" || f.label === "Price")
    .map((f) => `${f.label}: ${f.label === "Price" ? `$${f.value}` : f.value}`);
  return [title, title && "", descriptionFor(l, p), "", ...fields]
    .filter((x) => x !== null)
    .join("\n");
}
