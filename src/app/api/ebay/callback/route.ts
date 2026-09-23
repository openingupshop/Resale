import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { connectAccount } from "@/lib/ebay";

// eBay redirects here (the "accept URL" configured on the RuName) after consent.
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth) return NextResponse.redirect(new URL("/login", request.url));

  const params = request.nextUrl.searchParams;
  const returnTo = request.cookies.get("ebay_oauth_return")?.value ?? "/";
  const back = (status: string) => {
    const url = new URL(returnTo, request.url);
    url.searchParams.set("ebay", status);
    const res = NextResponse.redirect(url);
    res.cookies.delete("ebay_oauth_state");
    res.cookies.delete("ebay_oauth_return");
    return res;
  };

  const code = params.get("code");
  if (!code || params.get("state") !== request.cookies.get("ebay_oauth_state")?.value) {
    return back("denied");
  }
  try {
    await connectAccount(auth.userId, code);
    return back("connected");
  } catch (e) {
    console.error("ebay: connect failed", e);
    return back("error");
  }
}
