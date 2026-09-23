import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { authorizeUrl, ebayConfigured } from "@/lib/ebay";

export async function GET(request: NextRequest) {
  if (!ebayConfigured()) {
    return NextResponse.json({ error: "eBay isn't set up on this server." }, { status: 503 });
  }
  const state = randomBytes(16).toString("hex");
  const returnTo = request.nextUrl.searchParams.get("returnTo") ?? "/";
  const res = NextResponse.redirect(authorizeUrl(state));
  const cookie = { httpOnly: true, secure: true, sameSite: "lax" as const, maxAge: 600, path: "/" };
  res.cookies.set("ebay_oauth_state", state, cookie);
  res.cookies.set("ebay_oauth_return", returnTo.startsWith("/") ? returnTo : "/", cookie);
  return res;
}
