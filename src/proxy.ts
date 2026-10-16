import { NextResponse, type NextRequest } from "next/server";

// Kept in sync with SESSION_COOKIE in src/lib/session.ts (that module is server-only).
const SESSION_COOKIE = "cents_session";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ONE_YEAR = 60 * 60 * 24 * 365;
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * 1. Rejects cross-site state-changing API calls (defense in depth on top of SameSite=Lax).
 * 2. Issues the anonymous demo-session cookie (random server-generated UUID) on first visit.
 */
export function proxy(request: NextRequest) {
  if (MUTATING.has(request.method) && request.nextUrl.pathname.startsWith("/api/") && isCrossSite(request)) {
    return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
  }

  const current = request.cookies.get(SESSION_COOKIE)?.value;
  if (current && UUID.test(current)) return NextResponse.next();

  const id = crypto.randomUUID();
  request.cookies.set(SESSION_COOKIE, id); // visible to this request's handlers
  const response = NextResponse.next({ request: { headers: request.headers } });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: id,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR,
  });
  return response;
}

/** Browsers send Origin (and Sec-Fetch-Site) on POSTs; a mismatch with our host means cross-site. */
function isCrossSite(request: NextRequest): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return true;
  const origin = request.headers.get("origin");
  if (!origin) return false; // non-browser clients; the session cookie still scopes everything
  try {
    return new URL(origin).host !== (request.headers.get("x-forwarded-host") ?? request.headers.get("host"));
  } catch {
    return true;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
