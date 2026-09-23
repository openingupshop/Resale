import type { Aspect } from "@/lib/ebay";
import { descriptionFor } from "@/lib/listing-format";
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
  const out: Record<string, string[]> = {};
  for (const a of aspects) {
    const value = known[a.name.toLowerCase()];
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
  if (l.condition.grade === "New with tags") return undefined;
  const flaws = l.condition.flaws.length ? `Flaws: ${l.condition.flaws.join("; ")}.` : "";
  return [l.condition.summary.trim(), flaws].filter(Boolean).join(" ") || undefined;
}
