import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/*
 * eBay requires apps that store eBay user data to handle marketplace account
 * deletion notifications. Register this URL and EBAY_VERIFICATION_TOKEN in the
 * eBay developer portal (Alerts & Notifications).
 */
const endpoint = () => process.env.EBAY_DELETION_ENDPOINT_URL ?? "";

export async function GET(request: NextRequest) {
  const challenge = request.nextUrl.searchParams.get("challenge_code");
  const token = process.env.EBAY_VERIFICATION_TOKEN;
  if (!challenge || !token || !endpoint()) {
    return NextResponse.json({ error: "Not configured" }, { status: 400 });
  }
  const challengeResponse = createHash("sha256").update(challenge + token + endpoint()).digest("hex");
  return NextResponse.json({ challengeResponse });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const ebayUserId: string | undefined = body?.notification?.data?.userId;
  if (ebayUserId) {
    const { error } = await createAdminClient().from("ebay_accounts").delete().eq("ebay_user_id", ebayUserId);
    if (error) console.error("ebay: account deletion failed", error);
  }
  // Always acknowledge so eBay doesn't retry.
  return new NextResponse(null, { status: 204 });
}
