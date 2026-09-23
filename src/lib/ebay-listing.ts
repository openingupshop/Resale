import type { Aspect, ConditionDescriptor } from "@/lib/ebay";
import { descriptionFor, detail, detailExact } from "@/lib/listing-format";
import type { Listing } from "@/lib/listing-schema";

const DEPARTMENT: Record<string, string> = { Men: "Men", Women: "Women", Unisex: "Unisex Adults" };

/**
 * Fill eBay item specifics we already know. Only values read from the photos or
 * entered by the seller are used; everything else is left for the seller.
 */
export function prefillAspects(l: Listing, aspects: Aspect[]): Record<string, string[]> {
  const known: Record<string, string | null | undefined> = {
    brand: l.brand,
    size: l.size,
    color: l.color,
    material: l.material,
    "outer shell material": l.material,
    department: DEPARTMENT[l.department],
    model: l.model,
    style: l.model,
  };
  for (const d of l.details) if (d.value) known[d.name.toLowerCase()] ??= d.value;
  const lookup = (name: string) => {
    const key = name.toLowerCase();
    if (known[key]) return known[key];
    // "Player/Athlete" vs "Player", "Year Manufactured" vs "Year", etc.
    const hit = Object.entries(known).find(([k, v]) => v && (key.includes(k) || k.includes(key)));
    return hit?.[1];
  };
  const out: Record<string, string[]> = {};
  for (const a of aspects) {
    const value = lookup(a.name);
    if (!value) continue;
    if (a.freeText) {
      out[a.name] = [value];
      continue;
    }
    const match = a.values.find((v) => v.toLowerCase() === value.toLowerCase());
    if (match) out[a.name] = [match];
  }
  return out;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function ebayDescriptionHtml(l: Listing): string {
  return descriptionFor(l, "ebay")
    .split("\n\n")
    .map((block) => `<p>${block.split("\n").map(escapeHtml).join("<br>")}</p>`)
    .join("");
}

export function conditionDescription(l: Listing): string | undefined {
  if (l.condition.grade === "New with tags" && l.functional_status !== "not_working") return undefined;
  const working = {
    tested_working: "Tested and working.",
    untested: "Untested; sold as-is.",
    not_working: "Not working; for parts or repair.",
    not_applicable: "",
  }[l.functional_status];
  const flaws = l.condition.flaws.length ? `Flaws: ${l.condition.flaws.join("; ")}.` : "";
  return [working, l.condition.summary.trim(), flaws].filter(Boolean).join(" ") || undefined;
}

export { isGradedCard } from "@/lib/listing-format";

/** Card condition (ungraded) from our grade, as eBay words it. */
const CARD_CONDITION: Record<string, string> = {
  "New with tags": "near mint",
  "New without tags": "near mint",
  Excellent: "excellent",
  "Very good": "very good",
  Good: "very good",
  Fair: "poor",
  "Poor / for parts": "poor",
};

/** Pre-fill condition descriptors (grader, grade, cert number, card condition) from what was read. */
export function prefillDescriptors(l: Listing, descriptors: ConditionDescriptor[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of descriptors) {
    const name = d.name.toLowerCase();
    let wanted: string | null = null;
    if (name.includes("grader")) wanted = detail(l, "grading company", "grader");
    else if (name.includes("cert")) wanted = detail(l, "cert");
    else if (name.includes("grade")) wanted = detailExact(l, "grade")?.replace(/^[a-z ]+/i, "") ?? null;
    else if (name.includes("card condition")) wanted = CARD_CONDITION[l.condition.grade];
    if (!wanted) continue;
    if (d.freeText) {
      out[d.id] = wanted;
      continue;
    }
    const w = wanted.toLowerCase().trim();
    // Exact, then whole-word ("PSA" in "Professional Sports Authenticator (PSA)"), then prefix.
    const word = new RegExp(`(^|[^a-z0-9.])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9.]|$)`, "i");
    const match =
      d.values.find((v) => v.name.toLowerCase() === w) ??
      d.values.find((v) => word.test(v.name)) ??
      d.values.find((v) => v.name.toLowerCase().startsWith(w));
    if (match) out[d.id] = match.id;
  }
  return out;
}
