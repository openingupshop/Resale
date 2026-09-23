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

/** Shape Claude must return. Also the shape stored in listings.data. */
export const ListingSchema = z.object({
  titles: z.object({
    ebay: z.string().describe("Keyword-first, 80 characters max"),
    poshmark: z.string(),
    facebook: z.string(),
  }),
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
    .describe("What could not be read or confirmed from the photos, e.g. 'No brand label visible.' Empty string if everything was legible."),
  category: z.string().nullable(),
  size: z.string().nullable(),
  color: z.string().nullable(),
  material: z.string().nullable(),
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
});

export type Listing = z.infer<typeof ListingSchema>;
