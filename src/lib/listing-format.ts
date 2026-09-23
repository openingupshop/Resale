import type { Listing } from "@/lib/listing-schema";

export type Platform = "ebay" | "poshmark" | "facebook";

export const PLATFORM_LABELS: Record<Platform, string> = {
  ebay: "eBay",
  poshmark: "Poshmark",
  facebook: "Facebook Marketplace",
};

export function formatPrice(l: Listing): string {
  const { low, high } = l.price;
  const f = (n: number) => `$${Math.round(n)}`;
  return low === high ? f(low) : `${f(low)}–${f(high)}`;
}

/** Detail lines shown under the description when copying a full listing. */
export function detailLines(l: Listing): string[] {
  const rows: [string, string | null][] = [
    ["Brand", l.brand],
    ["Model", l.model],
    ["Category", l.category],
    ["Size", l.size],
    ["Color", l.color],
    ["Material", l.material],
    ["Condition", l.condition.grade],
  ];
  return rows.filter(([, v]) => v && v.trim()).map(([k, v]) => `${k}: ${v}`);
}

export function fullListingText(l: Listing, platform: Platform): string {
  const parts = [l.titles[platform], "", l.description.trim()];
  if (l.condition.flaws.length) {
    parts.push("", "Flaws:", ...l.condition.flaws.map((f) => `- ${f}`));
  }
  const details = detailLines(l);
  if (details.length) parts.push("", ...details);
  if (platform === "poshmark" && l.keywords.length) {
    parts.push("", l.keywords.map((k) => `#${k.replace(/\s+/g, "")}`).join(" "));
  }
  return parts.join("\n");
}
