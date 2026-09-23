import { createClient } from "@/lib/supabase/server";

/** Supabase client plus the signed-in user's id, or null when signed out. */
export async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  return userId ? { supabase, userId } : null;
}
