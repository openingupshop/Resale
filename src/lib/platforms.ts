import type { ConditionGrade, Platform } from "@/lib/listing-schema";

/*
 * Per-marketplace rules. Fees and limits change: last checked September 2026.
 * Update here and every screen and price calculation follows.
 */

export type FeeInfo = {
  /** Seller fee in dollars for a sale at `price` (item price, no shipping). */
  fee: (price: number, opts: { apparel: boolean }) => number;
  /** Plain-language summary shown to the seller. */
  summary: string;
};

export type PlatformInfo = {
  id: Platform;
  label: string;
  shortLabel: string;
  /** Title limit in characters; null when the site has no separate title. */
  titleMax: number | null;
  descriptionMax: number | null;
  photoMax: number;
  /** Condition options exactly as the site's form shows them. */
  condition: (grade: ConditionGrade) => string;
  fees: FeeInfo;
  /** Search pre-filled with the item's keywords, sold items where the site supports it. */
  compsUrl: (query: string) => string;
  compsLabel: string;
  /** Where to start a new listing (opens the app on phones where supported). */
  sellUrl: string;
  /** Posting from this app is possible through an official API. */
  directPost: boolean;
  tips: string;
};

const pct = (p: number) => (price: number) => (price * p) / 100;
const q = encodeURIComponent;

export const PLATFORM_INFO: Record<Platform, PlatformInfo> = {
  ebay: {
    id: "ebay",
    label: "eBay",
    shortLabel: "eBay",
    titleMax: 80,
    descriptionMax: null,
    photoMax: 24,
    condition: (g) =>
      ({
        "New with tags": "New with tags",
        "New without tags": "New without tags",
        Excellent: "Pre-owned – Excellent",
        "Very good": "Pre-owned – Good",
        Good: "Pre-owned – Good",
        Fair: "Pre-owned – Fair",
        "Poor / for parts": "For parts or not working",
      })[g],
    fees: {
      fee: (price, { apparel }) =>
        (price * (apparel ? 15.3 : 13.6)) / 100 + (price > 10 ? 0.4 : 0.3),
      summary: "13.6% (15.3% clothing) + $0.40 per order, charged on item + shipping",
    },
    compsUrl: (s) => `https://www.ebay.com/sch/i.html?_nkw=${q(s)}&LH_Sold=1&LH_Complete=1`,
    compsLabel: "sold listings",
    sellUrl: "https://www.ebay.com/sl/prelist/suggest",
    directPost: true,
    tips: "Fill every item specific eBay asks for; they drive search.",
  },
  poshmark: {
    id: "poshmark",
    label: "Poshmark",
    shortLabel: "Poshmark",
    titleMax: 80,
    descriptionMax: 1500,
    photoMax: 16,
    condition: (g) =>
      ({
        "New with tags": "New With Tags",
        "New without tags": "Like New",
        Excellent: "Like New",
        "Very good": "Good",
        Good: "Good",
        Fair: "Fair",
        "Poor / for parts": "Fair",
      })[g],
    fees: {
      fee: (price) => (price < 15 ? 2.95 : price * 0.2),
      summary: "20% on sales of $15+, $2.95 under $15",
    },
    compsUrl: (s) => `https://poshmark.com/search?query=${q(s)}&availability=sold_out`,
    compsLabel: "sold listings",
    sellUrl: "https://poshmark.com/create-listing",
    directPost: false,
    tips: "Cover photo shows square. Only the first ~22 title characters show on phones.",
  },
  mercari: {
    id: "mercari",
    label: "Mercari",
    shortLabel: "Mercari",
    titleMax: 80,
    descriptionMax: 1000,
    photoMax: 12,
    condition: (g) =>
      ({
        "New with tags": "New",
        "New without tags": "Like new",
        Excellent: "Like new",
        "Very good": "Good",
        Good: "Good",
        Fair: "Fair",
        "Poor / for parts": "Poor",
      })[g],
    fees: { fee: pct(10), summary: "10% of item + buyer-paid shipping" },
    compsUrl: (s) => `https://www.mercari.com/search/?keyword=${q(s)}&status=sold_out`,
    compsLabel: "sold listings",
    sellUrl: "https://www.mercari.com/sell/",
    directPost: false,
    tips: "Enter the shipping weight so Mercari prices the label correctly.",
  },
  depop: {
    id: "depop",
    label: "Depop",
    shortLabel: "Depop",
    titleMax: null,
    descriptionMax: 1000,
    photoMax: 8,
    condition: (g) =>
      ({
        "New with tags": "Brand new",
        "New without tags": "Like new",
        Excellent: "Used – Excellent",
        "Very good": "Used – Excellent",
        Good: "Used – Good",
        Fair: "Used – Fair",
        "Poor / for parts": "Used – Fair",
      })[g],
    fees: {
      fee: (price) => price * 0.033 + 0.45,
      summary: "No selling fee in the US; 3.3% + $0.45 payment processing",
    },
    compsUrl: (s) => `https://www.depop.com/search/?q=${q(s)}`,
    compsLabel: "listings",
    sellUrl: "https://www.depop.com/products/create/",
    directPost: false,
    tips: "No title field: the first words of the description act as the title. Hashtags go at the end of the description.",
  },
  vinted: {
    id: "vinted",
    label: "Vinted",
    shortLabel: "Vinted",
    titleMax: 60,
    descriptionMax: null,
    photoMax: 20,
    condition: (g) =>
      ({
        "New with tags": "New with tags",
        "New without tags": "New without tags",
        Excellent: "Very good",
        "Very good": "Very good",
        Good: "Good",
        Fair: "Satisfactory",
        "Poor / for parts": "Satisfactory",
      })[g],
    fees: { fee: () => 0, summary: "No seller fee; buyers pay a protection fee" },
    compsUrl: (s) => `https://www.vinted.com/catalog?search_text=${q(s)}`,
    compsLabel: "listings",
    sellUrl: "https://www.vinted.com/items/new",
    directPost: false,
    tips: "Clothing and accessories focused. Buyers pay the fees, so price close to your take-home.",
  },
  facebook: {
    id: "facebook",
    label: "Facebook Marketplace",
    shortLabel: "Facebook",
    titleMax: 100,
    descriptionMax: null,
    photoMax: 10,
    condition: (g) =>
      ({
        "New with tags": "New",
        "New without tags": "Used – Like New",
        Excellent: "Used – Like New",
        "Very good": "Used – Good",
        Good: "Used – Good",
        Fair: "Used – Fair",
        "Poor / for parts": "Used – Fair",
      })[g],
    fees: {
      fee: (price) => Math.max(0.8, price * 0.1),
      summary: "Free for local pickup; 10% (min $0.80) on shipped orders",
    },
    compsUrl: (s) => `https://www.facebook.com/marketplace/search/?query=${q(s)}`,
    compsLabel: "local listings",
    sellUrl: "https://www.facebook.com/marketplace/create/item",
    directPost: false,
    tips: "Short, plain titles work best. Prices assume shipping; local sales have no fee.",
  },
  grailed: {
    id: "grailed",
    label: "Grailed",
    shortLabel: "Grailed",
    titleMax: 60,
    descriptionMax: null,
    photoMax: 12,
    condition: (g) =>
      ({
        "New with tags": "New/Never Worn",
        "New without tags": "New/Never Worn",
        Excellent: "Gently Used",
        "Very good": "Gently Used",
        Good: "Used",
        Fair: "Very Worn",
        "Poor / for parts": "Very Worn",
      })[g],
    fees: {
      fee: (price) =>
        (price < 120 ? Math.max(1.99, price * 0.06) : price * 0.09) + price * 0.0349 + 0.49,
      summary: "6% under $120 (min $1.99), 9% at $120+, plus 3.49% + $0.49 processing",
    },
    compsUrl: (s) => `https://www.grailed.com/sold?query=${q(s)}`,
    compsLabel: "sold listings",
    sellUrl: "https://www.grailed.com/sell/new",
    directPost: false,
    tips: "Menswear and designer. Buyers expect measurements; short titles do better.",
  },
  etsy: {
    id: "etsy",
    label: "Etsy (vintage)",
    shortLabel: "Etsy",
    titleMax: 140,
    descriptionMax: null,
    photoMax: 20,
    condition: (g) => (g.startsWith("New") ? "Unused vintage" : `Vintage – ${g}`),
    fees: {
      fee: (price) => price * 0.065 + price * 0.03 + 0.25 + 0.2,
      summary: "6.5% transaction + 3% + $0.25 processing + $0.20 listing",
    },
    compsUrl: (s) => `https://www.etsy.com/search?q=${q(s)}`,
    compsLabel: "listings",
    sellUrl: "https://www.etsy.com/your/shops/me/listing-editor/create",
    directPost: false,
    tips: "Only for vintage items 20+ years old. Use all 13 tags.",
  },
  offerup: {
    id: "offerup",
    label: "OfferUp",
    shortLabel: "OfferUp",
    titleMax: 100,
    descriptionMax: null,
    photoMax: 12,
    condition: (g) =>
      ({
        "New with tags": "New",
        "New without tags": "Open box",
        Excellent: "Used (normal wear)",
        "Very good": "Used (normal wear)",
        Good: "Used (normal wear)",
        Fair: "Used (normal wear)",
        "Poor / for parts": "For parts",
      })[g],
    fees: {
      fee: (price) => Math.max(1.99, price * 0.129),
      summary: "Free for local pickup; 12.9% (min $1.99) on shipped orders",
    },
    compsUrl: (s) => `https://offerup.com/search?q=${q(s)}`,
    compsLabel: "local listings",
    sellUrl: "https://offerup.com/post",
    directPost: false,
    tips: "Local buyers: good for bulky or heavy items. Prices assume shipping.",
  },
};

/** Take-home after the site's seller fee (shipping excluded). */
export function takeHome(p: Platform, price: number, apparel: boolean): number {
  return price - PLATFORM_INFO[p].fees.fee(price, { apparel });
}

/**
 * Smallest whole-dollar list price whose take-home reaches `goal`.
 * Fee formulas are piecewise, so search rather than invert algebraically.
 */
export function listPriceFor(p: Platform, goal: number, apparel: boolean): number {
  if (goal <= 0) return 0;
  let price = Math.ceil(goal);
  while (takeHome(p, price, apparel) < goal && price < goal * 3 + 50) price += 1;
  return price;
}
