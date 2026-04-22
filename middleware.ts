import { NextRequest, NextResponse } from "next/server";

// Centralized auth and request middleware.
//
// Currently a pass-through skeleton that establishes the pattern for future
// route guards. Add per-route authentication here rather than duplicating
// auth logic in each API route handler.
//
// Example future use:
//   if (req.nextUrl.pathname.startsWith("/api/admin")) {
//     const token = req.headers.get("authorization");
//     if (token !== `Bearer ${process.env.ADMIN_SECRET}`) {
//       return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//     }
//   }

export function middleware(_req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all API routes. Exclude static files and Next.js internals.
    "/api/:path*",
  ],
};
