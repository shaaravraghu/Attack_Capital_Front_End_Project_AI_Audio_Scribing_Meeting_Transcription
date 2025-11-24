import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware to protect routes and handle authentication
 * For now, we'll allow all routes - authentication can be added per-route
 */
export default async function middleware(request: NextRequest) {
  // Get the pathname from the request
  const { pathname } = request.nextUrl;

  // Allow public access for now - can add auth checks later
  // Example: Protect /sessions route
  // if (pathname.startsWith("/sessions")) {
  //   const session = await auth.api.getSession({ headers: Object.fromEntries(request.headers) });
  //   if (!session) {
  //     return NextResponse.redirect(new URL("/login", request.url));
  //   }
  // }

  // Continue with the request
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"]
};

