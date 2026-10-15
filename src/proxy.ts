import { NextResponse, type NextRequest } from "next/server";

// Kept in sync with SESSION_COOKIE in src/lib/session.ts (that module is server-only).
const SESSION_COOKIE = "cents_session";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ONE_YEAR = 60 * 60 * 24 * 365;

/** Issues the anonymous demo-session cookie (random server-generated UUID) on first visit. */
export function proxy(request: NextRequest) {
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

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
