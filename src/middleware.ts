import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "pp_session";

const AUTH_PATHS = new Set(["/login", "/registo"]);

const PUBLIC_FILE = /\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$/i;

function hasSession(request: NextRequest): boolean {
  return Boolean(request.cookies.get(SESSION_COOKIE)?.value);
}

function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    PUBLIC_FILE.test(pathname)
  ) {
    return applySecurityHeaders(NextResponse.next());
  }

  // Cron e webhooks futuros — autenticação própria na route.
  if (pathname.startsWith("/api/cron/")) {
    return applySecurityHeaders(NextResponse.next());
  }

  const authed = hasSession(request);

  if (AUTH_PATHS.has(pathname)) {
    if (authed) {
      return applySecurityHeaders(
        NextResponse.redirect(new URL("/dashboard", request.url)),
      );
    }
    return applySecurityHeaders(NextResponse.next());
  }

  if (!authed) {
    if (pathname.startsWith("/api/")) {
      return applySecurityHeaders(
        NextResponse.json({ error: "Não autenticado." }, { status: 401 }),
      );
    }
    const login = new URL("/login", request.url);
    if (pathname !== "/") {
      login.searchParams.set("next", pathname + request.nextUrl.search);
    }
    return applySecurityHeaders(NextResponse.redirect(login));
  }

  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
