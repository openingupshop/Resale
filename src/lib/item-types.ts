import type { ConditionGrade, ItemType, Platform } from "@/lib/listing-schema";

type ItemTypeInfo = {
  label: string;
  /** Sites where this kind of item sells, best fit first. The rest stay reachable. */
  sites: Platform[];
  /** Heading for the measurements block in descriptions; null hides the section. */
  measurementsHeading: string | null;
  /** Condition names shown to the seller, where the clothing wording doesn't fit. */
  conditionLabels?: Partial<Record<ConditionGrade, string>>;
};

const NEW_ITEM_LABELS: Partial<Record<ConditionGrade, string>> = {
  "New with tags": "New, sealed / in box",
  "New without tags": "New, open box",
};

export const ITEM_TYPE_INFO: Record<ItemType, ItemTypeInfo> = {
  clothing: {
    label: "Clothing & accessories",
    sites: ["ebay", "poshmark", "mercari", "depop", "vinted", "grailed", "facebook", "etsy", "offerup"],
    measurementsHeading: "Measurements (approx., laid flat)",
  },
  electronics: {
    label: "Electronics",
    sites: ["ebay", "mercari", "facebook", "offerup"],
    measurementsHeading: "Dimensions",
    conditionLabels: NEW_ITEM_LABELS,
  },
  media: {
    label: "Books, games & media",
    sites: ["ebay", "mercari", "facebook", "offerup", "etsy"],
    measurementsHeading: null,
    conditionLabels: NEW_ITEM_LABELS,
  },
  trading_cards: {
    label: "Trading cards",
    sites: ["ebay", "mercari", "facebook"],
    measurementsHeading: null,
    conditionLabels: NEW_ITEM_LABELS,
  },
  collectibles: {
    label: "Toys & collectibles",
    sites: ["ebay", "mercari", "etsy", "facebook", "offerup"],
    measurementsHeading: "Dimensions",
    conditionLabels: NEW_ITEM_LABELS,
  },
  home: {
    label: "Home goods",
    sites: ["ebay", "mercari", "facebook", "offerup", "poshmark", "etsy"],
    measurementsHeading: "Dimensions",
    conditionLabels: NEW_ITEM_LABELS,
  },
  furniture: {
    label: "Furniture & large items",
    sites: ["facebook", "offerup", "ebay", "etsy"],
    measurementsHeading: "Dimensions",
    conditionLabels: NEW_ITEM_LABELS,
  },
  other: {
    label: "Other",
    sites: ["ebay", "mercari", "facebook", "offerup"],
    measurementsHeading: "Dimensions",
    conditionLabels: NEW_ITEM_LABELS,
  },
};

export function conditionLabel(type: ItemType, grade: ConditionGrade): string {
  return ITEM_TYPE_INFO[type].conditionLabels?.[grade] ?? grade;
}

export const FUNCTIONAL_LABELS = {
  tested_working: "Tested, works",
  untested: "Untested",
  not_working: "Not working / for parts",
  not_applicable: "Doesn't apply",
} as const;
