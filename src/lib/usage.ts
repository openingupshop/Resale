import type { SupabaseClient } from "@supabase/supabase-js";
import { DAILY_GENERATION_LIMIT } from "@/lib/config";

export function startOfUtcDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Generations the user has used today (UTC) and how many remain. */
export async function getDailyUsage(supabase: SupabaseClient, userId: string) {
  const { count, error } = await supabase
    .from("generations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", startOfUtcDay().toISOString());
  if (error) throw error;
  const used = count ?? 0;
  return {
    used,
    limit: DAILY_GENERATION_LIMIT,
    remaining: Math.max(0, DAILY_GENERATION_LIMIT - used),
  };
}
