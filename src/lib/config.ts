// Central app settings. Change values here; nothing else needs to move.

/** Max listing generations per user per UTC day. */
export const DAILY_GENERATION_LIMIT = 10;

/** Photos per item. */
export const MIN_PHOTOS = 1;
export const MAX_PHOTOS = 6;

/**
 * Browser-side image compression. Claude bills images at roughly
 * (width * height) / 750 tokens, so a 1024px long edge keeps each photo
 * around 1,000 tokens while leaving labels and tags readable.
 */
export const IMAGE_MAX_DIMENSION = 1024;
export const IMAGE_JPEG_QUALITY = 0.8;
export const THUMBNAIL_MAX_DIMENSION = 240;

/** Claude model and per-million-token prices (USD) used for cost logging. */
export const CLAUDE_MODEL = "claude-sonnet-5";
export const CLAUDE_EFFORT = "medium" as const;
export const CLAUDE_MAX_TOKENS = 16000;
export const PRICE_PER_MTOK = {
  input: 2.0,
  output: 10.0,
  cacheWrite: 2.5,
  cacheRead: 0.2,
};

/** eBay title limit. */
export const EBAY_TITLE_MAX = 80;
