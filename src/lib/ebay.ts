import "server-only";
import type { ConditionGrade } from "@/lib/listing-schema";
import { createAdminClient } from "@/lib/supabase/admin";

/*
 * eBay REST APIs used here (all official):
 *   OAuth, Commerce Identity (who connected), Taxonomy (category + item specifics),
 *   Sell Metadata (allowed conditions), Sell Account (business policies),
 *   Media (photo upload), Sell Inventory (item, offer, publish), Buy Browse (price comps).
 */

const SANDBOX = process.env.EBAY_ENV === "sandbox";
const host = (sub: string) => `https://${sub}${SANDBOX ? ".sandbox" : ""}.ebay.com`;
const HOSTS = {
  api: host("api"),
  auth: host("auth"),
  apim: host("apim"),
  apiz: host("apiz"),
  web: SANDBOX ? "https://sandbox.ebay.com" : "https://www.ebay.com",
};

export const MARKETPLACE_ID = "EBAY_US";

const SCOPE = "https://api.ebay.com/oauth/api_scope";
export const USER_SCOPES = [
  SCOPE,
  `${SCOPE}/sell.inventory`,
  `${SCOPE}/sell.account.readonly`,
  `${SCOPE}/commerce.identity.readonly`,
];

/** Enough for public data such as price comps. */
export function ebayAppConfigured(): boolean {
  return Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);
}

/** Everything needed for sellers to connect and post. */
export function ebayConfigured(): boolean {
  return Boolean(
    process.env.EBAY_CLIENT_ID &&
      process.env.EBAY_CLIENT_SECRET &&
      process.env.EBAY_RU_NAME &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export function listingUrl(listingId: string): string {
  return `${HOSTS.web}/itm/${listingId}`;
}

export class EbayError extends Error {
  constructor(
    message: string,
    public status: number,
    public details: { errorId?: number; message?: string; longMessage?: string; parameters?: { name: string; value: string }[] }[] = [],
  ) {
    super(message);
  }
  /** Seller-facing text from eBay's error list. */
  get userMessage(): string {
    const msgs = this.details.map((d) => d.longMessage || d.message).filter(Boolean);
    return msgs.length ? msgs.join(" ") : this.message;
  }
}

// ---------- OAuth ----------

const basicAuth = () =>
  "Basic " + Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString("base64");

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch(`${HOSTS.api}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const json = await res.json();
  if (!res.ok) throw new EbayError(json.error_description || "eBay sign-in failed", res.status);
  return json as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    refresh_token_expires_in?: number;
  };
}

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.EBAY_CLIENT_ID!,
    redirect_uri: process.env.EBAY_RU_NAME!,
    response_type: "code",
    scope: USER_SCOPES.join(" "),
    state,
  });
  return `${HOSTS.auth}/oauth2/authorize?${params}`;
}

const inSeconds = (s: number) => new Date(Date.now() + s * 1000).toISOString();

/** Exchange the consent code, look up the eBay account, and store the tokens. */
export async function connectAccount(userId: string, code: string) {
  const t = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: process.env.EBAY_RU_NAME!,
  });
  const who = await call<{ userId: string; username?: string }>(
    `${HOSTS.apiz}/commerce/identity/v1/user/`,
    t.access_token,
  );

  const { error } = await createAdminClient()
    .from("ebay_accounts")
    .upsert({
      user_id: userId,
      ebay_user_id: who.userId,
      ebay_username: who.username ?? null,
      access_token: t.access_token,
      access_expires_at: inSeconds(t.expires_in),
      refresh_token: t.refresh_token!,
      refresh_expires_at: inSeconds(t.refresh_token_expires_in ?? 0),
    });
  if (error) throw error;
}

export async function getConnection(userId: string) {
  const { data } = await createAdminClient()
    .from("ebay_accounts")
    .select("ebay_username, refresh_expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || new Date(data.refresh_expires_at) < new Date()) return null;
  return { username: data.ebay_username as string | null };
}

export async function disconnect(userId: string) {
  await createAdminClient().from("ebay_accounts").delete().eq("user_id", userId);
}

/** A valid user access token, refreshed when within five minutes of expiry. */
async function userToken(userId: string): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin.from("ebay_accounts").select("*").eq("user_id", userId).maybeSingle();
  if (!data) throw new EbayError("Connect your eBay account first.", 401);
  if (new Date(data.access_expires_at).getTime() - Date.now() > 5 * 60_000) return data.access_token;
  if (new Date(data.refresh_expires_at) < new Date()) {
    throw new EbayError("Your eBay connection expired. Connect eBay again.", 401);
  }
  const t = await tokenRequest({
    grant_type: "refresh_token",
    refresh_token: data.refresh_token,
    scope: USER_SCOPES.join(" "),
  });
  await admin
    .from("ebay_accounts")
    .update({ access_token: t.access_token, access_expires_at: inSeconds(t.expires_in) })
    .eq("user_id", userId);
  return t.access_token;
}

let appToken: { token: string; expires: number } | null = null;

/** Application token for public data (taxonomy, browse). */
async function applicationToken(): Promise<string> {
  if (appToken && appToken.expires - Date.now() > 60_000) return appToken.token;
  const t = await tokenRequest({ grant_type: "client_credentials", scope: SCOPE });
  appToken = { token: t.access_token, expires: Date.now() + t.expires_in * 1000 };
  return t.access_token;
}

// ---------- HTTP ----------

async function call<T>(
  url: string,
  token: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE_ID,
      ...(init.body !== undefined
        ? { "Content-Type": "application/json", "Content-Language": "en-US" }
        : {}),
      ...init.headers,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  let json: { errors?: EbayError["details"] } & Record<string, unknown> = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    // Non-JSON error page; the status code is all we have.
  }
  if (!res.ok) {
    throw new EbayError(`eBay request failed (${res.status})`, res.status, json.errors ?? []);
  }
  return json as unknown as T;
}

// ---------- Categories, item specifics, conditions ----------

export type CategorySuggestion = { id: string; path: string };

export async function suggestCategories(query: string): Promise<CategorySuggestion[]> {
  const token = await applicationToken();
  const res = await call<{
    categorySuggestions?: {
      category: { categoryId: string; categoryName: string };
      categoryTreeNodeAncestors?: { categoryName: string }[];
    }[];
  }>(
    `${HOSTS.api}/commerce/taxonomy/v1/category_tree/0/get_category_suggestions?q=${encodeURIComponent(query)}`,
    token,
  );
  return (res.categorySuggestions ?? []).slice(0, 6).map((s) => ({
    id: s.category.categoryId,
    path: [...(s.categoryTreeNodeAncestors ?? []).map((a) => a.categoryName).reverse(), s.category.categoryName].join(" > "),
  }));
}

export type Aspect = {
  name: string;
  required: boolean;
  multiple: boolean;
  freeText: boolean;
  values: string[];
};

export async function categoryAspects(categoryId: string): Promise<Aspect[]> {
  const token = await applicationToken();
  const res = await call<{
    aspects?: {
      localizedAspectName: string;
      aspectConstraint: {
        aspectRequired?: boolean;
        aspectUsage?: "RECOMMENDED" | "OPTIONAL";
        aspectMode?: "FREE_TEXT" | "SELECTION_ONLY";
        itemToAspectCardinality?: "SINGLE" | "MULTI";
      };
      aspectValues?: { localizedValue: string }[];
    }[];
  }>(
    `${HOSTS.api}/commerce/taxonomy/v1/category_tree/0/get_item_aspects_for_category?category_id=${categoryId}`,
    token,
  );
  return (res.aspects ?? [])
    .filter((a) => a.aspectConstraint.aspectRequired || a.aspectConstraint.aspectUsage === "RECOMMENDED")
    .slice(0, 25)
    .map((a) => ({
      name: a.localizedAspectName,
      required: Boolean(a.aspectConstraint.aspectRequired),
      multiple: a.aspectConstraint.itemToAspectCardinality === "MULTI",
      freeText: a.aspectConstraint.aspectMode !== "SELECTION_ONLY",
      values: (a.aspectValues ?? []).slice(0, 200).map((v) => v.localizedValue),
    }));
}

/** Condition ID -> Inventory API enum. */
const CONDITION_ENUM: Record<number, string> = {
  1000: "NEW",
  1500: "NEW_OTHER",
  1750: "NEW_WITH_DEFECTS",
  2000: "CERTIFIED_REFURBISHED",
  2010: "EXCELLENT_REFURBISHED",
  2020: "VERY_GOOD_REFURBISHED",
  2030: "GOOD_REFURBISHED",
  2500: "SELLER_REFURBISHED",
  2750: "LIKE_NEW",
  2990: "PRE_OWNED_EXCELLENT",
  3000: "USED_EXCELLENT",
  3010: "PRE_OWNED_FAIR",
  4000: "USED_VERY_GOOD",
  5000: "USED_GOOD",
  6000: "USED_ACCEPTABLE",
  7000: "FOR_PARTS_OR_NOT_WORKING",
};

/** Preferred eBay condition IDs per grade, best match first. */
const GRADE_TO_IDS: Record<ConditionGrade, number[]> = {
  "New with tags": [1000],
  "New without tags": [1500, 2750, 1000],
  Excellent: [2990, 2750, 3000],
  "Very good": [3000, 4000],
  Good: [3000, 5000],
  Fair: [3010, 6000, 5000],
  "Poor / for parts": [7000, 3010, 6000],
};

/** Extra condition fields some categories require, e.g. grader and grade for trading cards. */
export type ConditionDescriptor = {
  id: string;
  name: string;
  required: boolean;
  freeText: boolean;
  maxLength: number | null;
  values: { id: string; name: string }[];
};

export type EbayCondition = { id: number; enum: string; label: string; descriptors: ConditionDescriptor[] };

type RawDescriptor = {
  conditionDescriptorId: string;
  conditionDescriptorName: string;
  conditionDescriptorValues?: { conditionDescriptorValueId: string; conditionDescriptorValueName: string }[];
  conditionDescriptorConstraint?: { usage?: string; mode?: string; maxLength?: number };
};

const toDescriptor = (d: RawDescriptor): ConditionDescriptor => ({
  id: d.conditionDescriptorId,
  name: d.conditionDescriptorName,
  required: d.conditionDescriptorConstraint?.usage === "REQUIRED",
  freeText: d.conditionDescriptorConstraint?.mode === "FREE_TEXT" || !d.conditionDescriptorValues?.length,
  maxLength: d.conditionDescriptorConstraint?.maxLength ?? null,
  values: (d.conditionDescriptorValues ?? []).map((v) => ({
    id: v.conditionDescriptorValueId,
    name: v.conditionDescriptorValueName,
  })),
});

/** Trading-card categories use Graded (2750) and Ungraded (4000) instead of the usual scale. */
const CARD_IDS = { graded: [2750], ungraded: [4000] };

export async function conditionFor(
  categoryId: string,
  grade: ConditionGrade,
  userId: string,
  card?: { graded: boolean },
): Promise<{ chosen: EbayCondition; allowed: EbayCondition[] }> {
  const token = await userToken(userId);
  let allowed: EbayCondition[] = [];
  try {
    const res = await call<{
      itemConditionPolicies?: {
        itemConditions?: {
          conditionId: string;
          conditionDescription: string;
          conditionDescriptors?: RawDescriptor[];
        }[];
      }[];
    }>(
      `${HOSTS.api}/sell/metadata/v1/marketplace/${MARKETPLACE_ID}/get_item_condition_policies?filter=${encodeURIComponent(`categoryIds:{${categoryId}}`)}`,
      token,
    );
    allowed = (res.itemConditionPolicies?.[0]?.itemConditions ?? [])
      .map((c) => ({
        id: Number(c.conditionId),
        enum: CONDITION_ENUM[Number(c.conditionId)],
        label: c.conditionDescription,
        descriptors: (c.conditionDescriptors ?? []).map(toDescriptor),
      }))
      .filter((c) => c.enum);
  } catch {
    // Fall through to the grade's first preference.
  }
  const prefs = [...(card ? (card.graded ? CARD_IDS.graded : CARD_IDS.ungraded) : []), ...GRADE_TO_IDS[grade]];
  const chosen =
    prefs.map((id) => allowed.find((c) => c.id === id)).find(Boolean) ??
    allowed[0] ?? { id: prefs[0], enum: CONDITION_ENUM[prefs[0]], label: grade, descriptors: [] };
  return { chosen, allowed };
}

// ---------- Business policies and location ----------

export type Policies = {
  fulfillment: { id: string; name: string }[];
  payment: { id: string; name: string }[];
  returns: { id: string; name: string }[];
  hasLocation: boolean;
};

export async function sellerSetup(userId: string): Promise<Policies> {
  const token = await userToken(userId);
  const q = `?marketplace_id=${MARKETPLACE_ID}`;
  const [f, p, r, loc] = await Promise.all([
    call<{ fulfillmentPolicies?: { fulfillmentPolicyId: string; name: string }[] }>(`${HOSTS.api}/sell/account/v1/fulfillment_policy${q}`, token),
    call<{ paymentPolicies?: { paymentPolicyId: string; name: string }[] }>(`${HOSTS.api}/sell/account/v1/payment_policy${q}`, token),
    call<{ returnPolicies?: { returnPolicyId: string; name: string }[] }>(`${HOSTS.api}/sell/account/v1/return_policy${q}`, token),
    call<{ locations?: unknown[] }>(`${HOSTS.api}/sell/inventory/v1/location?limit=1`, token),
  ]);
  return {
    fulfillment: (f.fulfillmentPolicies ?? []).map((x) => ({ id: x.fulfillmentPolicyId, name: x.name })),
    payment: (p.paymentPolicies ?? []).map((x) => ({ id: x.paymentPolicyId, name: x.name })),
    returns: (r.returnPolicies ?? []).map((x) => ({ id: x.returnPolicyId, name: x.name })),
    hasLocation: (loc.locations ?? []).length > 0,
  };
}

const LOCATION_KEY = "resale-lister-default";

async function ensureLocation(token: string, postalCode?: string): Promise<string> {
  const existing = await call<{ locations?: { merchantLocationKey: string }[] }>(
    `${HOSTS.api}/sell/inventory/v1/location?limit=1`,
    token,
  );
  const key = existing.locations?.[0]?.merchantLocationKey;
  if (key) return key;
  if (!postalCode) throw new EbayError("Enter the ZIP code you ship from.", 400);
  await call(`${HOSTS.api}/sell/inventory/v1/location/${LOCATION_KEY}`, token, {
    method: "POST",
    body: {
      location: { address: { postalCode, country: "US" } },
      locationTypes: ["WAREHOUSE"],
      name: "Ships from",
    },
  });
  return LOCATION_KEY;
}

// ---------- Publishing ----------

async function uploadImage(token: string, imageUrl: string): Promise<string> {
  const res = await call<{ imageUrl: string }>(
    `${HOSTS.apim}/commerce/media/v1_beta/image/create_image_from_url`,
    token,
    { method: "POST", body: { imageUrl } },
  );
  return res.imageUrl;
}

export type PublishInput = {
  sku: string;
  title: string;
  descriptionHtml: string;
  photoUrls: string[];
  categoryId: string;
  conditionEnum: string;
  conditionDescription?: string;
  /** name = descriptor ID; values = value IDs, or additionalInfo for free text. */
  conditionDescriptors: { name: string; values?: string[]; additionalInfo?: string }[];
  barcode: { type: "UPC" | "EAN" | "ISBN"; value: string } | null;
  aspects: Record<string, string[]>;
  price: number;
  weightOz: number | null;
  policies: { fulfillment: string; payment: string; returns: string };
  postalCode?: string;
  existingOfferId: string | null;
};

export async function publishListing(userId: string, input: PublishInput) {
  const token = await userToken(userId);
  const locationKey = await ensureLocation(token, input.postalCode);

  const imageUrls: string[] = [];
  for (const url of input.photoUrls.slice(0, 24)) imageUrls.push(await uploadImage(token, url));

  const sku = encodeURIComponent(input.sku);
  await call(`${HOSTS.api}/sell/inventory/v1/inventory_item/${sku}`, token, {
    method: "PUT",
    body: {
      availability: { shipToLocationAvailability: { quantity: 1 } },
      condition: input.conditionEnum,
      ...(input.conditionDescription ? { conditionDescription: input.conditionDescription.slice(0, 1000) } : {}),
      ...(input.conditionDescriptors.length ? { conditionDescriptors: input.conditionDescriptors } : {}),
      product: {
        title: input.title.slice(0, 80),
        description: input.descriptionHtml,
        aspects: input.aspects,
        imageUrls,
        ...(input.barcode ? { [input.barcode.type.toLowerCase()]: [input.barcode.value] } : {}),
      },
      ...(input.weightOz
        ? { packageWeightAndSize: { weight: { value: input.weightOz, unit: "OUNCE" } } }
        : {}),
    },
  });

  const offer = {
    sku: input.sku,
    marketplaceId: MARKETPLACE_ID,
    format: "FIXED_PRICE",
    availableQuantity: 1,
    categoryId: input.categoryId,
    listingDescription: input.descriptionHtml,
    listingPolicies: {
      fulfillmentPolicyId: input.policies.fulfillment,
      paymentPolicyId: input.policies.payment,
      returnPolicyId: input.policies.returns,
    },
    pricingSummary: { price: { value: input.price.toFixed(2), currency: "USD" } },
    merchantLocationKey: locationKey,
  };

  let offerId = input.existingOfferId;
  if (offerId) {
    await call(`${HOSTS.api}/sell/inventory/v1/offer/${offerId}`, token, { method: "PUT", body: offer });
  } else {
    try {
      offerId = (await call<{ offerId: string }>(`${HOSTS.api}/sell/inventory/v1/offer`, token, { method: "POST", body: offer })).offerId;
    } catch (e) {
      // An offer already exists for this SKU (e.g. an earlier attempt): reuse it.
      const existing = e instanceof EbayError ? e.details.flatMap((d) => d.parameters ?? []).find((p) => p.name === "offerId") : undefined;
      if (!existing) throw e;
      offerId = existing.value;
      await call(`${HOSTS.api}/sell/inventory/v1/offer/${offerId}`, token, { method: "PUT", body: offer });
    }
  }

  const published = await call<{ listingId: string }>(
    `${HOSTS.api}/sell/inventory/v1/offer/${offerId}/publish`,
    token,
    { method: "POST", body: {} },
  );
  return { offerId: offerId!, listingId: published.listingId, url: listingUrl(published.listingId) };
}

// ---------- Price comps ----------

export type Comps = {
  query: string;
  count: number;
  low: number;
  median: number;
  high: number;
  p25: number;
  p75: number;
  fetchedAt: string;
  kind: "active";
};

const quantile = (sorted: number[], q: number) => {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  return sorted[lo] + (sorted[Math.ceil(i)] - sorted[lo]) * (i - lo);
};

/**
 * Current fixed-price asking prices for similar items. eBay's sold-price data
 * (Marketplace Insights API) needs separate approval; this uses the open Browse API.
 */
export async function activeComps(query: string, usedOnly: boolean): Promise<Comps | null> {
  const token = await applicationToken();
  const filter = ["buyingOptions:{FIXED_PRICE}", "priceCurrency:USD", usedOnly ? "conditions:{USED}" : null]
    .filter(Boolean)
    .join(",");
  const res = await call<{ itemSummaries?: { price?: { value: string; currency: string } }[] }>(
    `${HOSTS.api}/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&limit=50&filter=${encodeURIComponent(filter)}`,
    token,
  );
  const prices = (res.itemSummaries ?? [])
    .map((i) => Number(i.price?.value))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  if (prices.length < 3) return null;
  return {
    query,
    count: prices.length,
    low: prices[0],
    high: prices[prices.length - 1],
    median: quantile(prices, 0.5),
    p25: quantile(prices, 0.25),
    p75: quantile(prices, 0.75),
    fetchedAt: new Date().toISOString(),
    kind: "active",
  };
}
