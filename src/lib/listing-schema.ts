import { z } from "zod";

export const CONDITION_GRADES = [
  "New with tags",
  "New without tags",
  "Excellent",
  "Very good",
  "Good",
  "Fair",
  "Poor / for parts",
] as const;
export type ConditionGrade = (typeof CONDITION_GRADES)[number];

export const PLATFORMS = [
  "ebay",
  "poshmark",
  "mercari",
  "depop",
  "vinted",
  "facebook",
  "grailed",
  "etsy",
  "offerup",
] as const;
export type Platform = (typeof PLATFORMS)[number];

const perPlatform = <T extends z.ZodType>(value: T) =>
  z.object(Object.fromEntries(PLATFORMS.map((p) => [p, value])) as Record<Platform, T>);

/** Shape Claude must return. */
export const GeneratedListingSchema = z.object({
  titles: perPlatform(z.string()).describe(
    "One title per platform, following that platform's rules in the instructions",
  ),
  description: z.string(),
  brand: z
    .string()
    .nullable()
    .describe("Only if printed on the item, label, tag, or packaging in the photos; otherwise null"),
  model: z
    .string()
    .nullable()
    .describe("Model, style name, or number only if legible in the photos; otherwise null"),
  identification_note: z
    .string()
    .describe(
      "What could not be read or confirmed from the photos, e.g. 'No brand label visible.' Empty string if everything was legible.",
    ),
  department: z
    .enum(["Women", "Men", "Unisex", "Kids", "Baby", "Home", "Other"])
    .describe("Who or what the item is for"),
  is_apparel: z.boolean().describe("Clothing, shoes, or accessories"),
  category: z.string().nullable().describe("Plain-language item type, e.g. 'Denim trucker jacket'"),
  categories: perPlatform(z.string()).describe(
    "Suggested category path on each platform, using that platform's own category names, separated by ' > '",
  ),
  size: z.string().nullable(),
  color: z.string().nullable(),
  material: z.string().nullable(),
  era: z
    .string()
    .nullable()
    .describe("Decade or era only when tags, labels, or construction clearly show it; otherwise null"),
  measurements: z
    .array(
      z.object({
        name: z.string(),
        value: z.string().nullable().describe("Only if a tape measure or ruler reading is visible; otherwise null"),
      }),
    )
    .describe("The measurements buyers expect for this kind of item, e.g. pit to pit, length, sleeve"),
  est_weight_oz: z
    .number()
    .nullable()
    .describe("Estimated packed shipping weight in ounces; null if you can't judge the item's size"),
  condition: z.object({
    grade: z.enum(CONDITION_GRADES),
    summary: z.string(),
    flaws: z.array(z.string()).describe("Each visible flaw with its location; empty if none seen"),
  }),
  price: z.object({
    low: z.number(),
    high: z.number(),
    currency: z.string(),
    basis: z.string().describe("One sentence on what drives the estimate"),
  }),
  keywords: z.array(z.string()),
  hashtags: z.array(z.string()).describe("Exactly 5 Depop hashtags without the # sign"),
  etsy_tags: z.array(z.string()).describe("Up to 13 Etsy tags, each 20 characters or fewer"),
});
export type GeneratedListing = z.infer<typeof GeneratedListingSchema>;

/** Fields the seller adds after generation. */
const SellerFieldsSchema = z.object({
  weight_oz: z.number().nullable().default(null),
  cost_paid: z.number().nullable().default(null),
  take_home_goal: z.number().nullable().default(null),
});

const emptyPerPlatform = () =>
  Object.fromEntries(PLATFORMS.map((p) => [p, ""])) as Record<Platform, string>;

/**
 * Stored shape (listings.data). Defaults let listings saved by older
 * versions of the app load without a migration.
 */
export const ListingSchema = GeneratedListingSchema.extend({
  titles: perPlatform(z.string().default("")),
  department: GeneratedListingSchema.shape.department.default("Other"),
  is_apparel: z.boolean().default(false),
  categories: perPlatform(z.string().default("")).default(emptyPerPlatform),
  era: z.string().nullable().default(null),
  measurements: GeneratedListingSchema.shape.measurements.default([]),
  est_weight_oz: z.number().nullable().default(null),
  hashtags: z.array(z.string()).default([]),
  etsy_tags: z.array(z.string()).default([]),
}).merge(SellerFieldsSchema);
export type Listing = z.infer<typeof ListingSchema>;
