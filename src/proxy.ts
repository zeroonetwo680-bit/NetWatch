import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken } from "@/server/auth-edge";

/**
 * Next.js 16 proxy (formerly middleware) — the first gate.
 * Pages: redirect to /login?next=… when unauthenticated.
 * APIs:  401 UNAUTHORIZED for missing sessions.
 * Route handlers re-check roles themselves (never trust the proxy alone).
 */

const PUBLIC_PATHS = ["/api/auth/login", "/_next", "/favicon.ico"];
const PUBLIC_EXACT = ["/login"];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  if (PUBLIC_EXACT.includes(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get("netwatch_session")?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          status: 401,
          code: "UNAUTHORIZED",
          title: "يجب تسجيل الدخول للوصول إلى هذا المورد.",
        },
        { status: 401 },
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.next();
  response.headers.set("x-netwatch-user", String(session.id));
  response.headers.set("x-netwatch-role", session.role);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
