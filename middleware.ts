// NOTE: this file is not picked up by Next.js. The app lives in src/app, and
// Next.js only loads middleware from src/middleware.ts in that layout. Moving
// it there switches the route guard on for every request, so do that as its
// own change and test it (see CLAUDE.md → Gotchas).
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Skip static assets and image optimizer; run everything else.
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico|woff2?|ttf)).*)",
  ],
};
