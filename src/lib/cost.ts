import type Anthropic from "@anthropic-ai/sdk";
import { PRICE_PER_MTOK } from "@/lib/config";

export type TokenUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
};

export function toTokenUsage(usage: Anthropic.Usage): TokenUsage {
  return {
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
  };
}

/** USD cost of one call at the prices in config. */
export function costUsd(u: TokenUsage): number {
  const cost =
    (u.input_tokens * PRICE_PER_MTOK.input +
      u.output_tokens * PRICE_PER_MTOK.output +
      u.cache_creation_input_tokens * PRICE_PER_MTOK.cacheWrite +
      u.cache_read_input_tokens * PRICE_PER_MTOK.cacheRead) /
    1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export function formatUsd(n: number): string {
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(3)}`;
}
