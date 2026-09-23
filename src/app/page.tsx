import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getDailyUsage } from "@/lib/usage";
import { CaptureForm } from "./_capture/CaptureForm";

export default async function CapturePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");

  const usage = await getDailyUsage(supabase, userId);

  return (
    <>
      <AppHeader active="new" />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-32 pt-4">
        <h1 className="text-xl font-semibold tracking-tight">New listing</h1>
        <p className="mt-1 text-sm text-muted">
          Add 1–6 photos of one item: front, back, label or tag, and any flaws.
        </p>
        <CaptureForm remaining={usage.remaining} limit={usage.limit} />
      </main>
    </>
  );
}
