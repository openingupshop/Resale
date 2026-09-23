import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { disconnect } from "@/lib/ebay";

export async function POST() {
  const auth = await requireUser();
  if (!auth) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  await disconnect(auth.userId);
  return NextResponse.json({ ok: true });
}
