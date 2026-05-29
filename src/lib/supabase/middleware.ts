import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { env } from "@/lib/env";

const PUBLIC_PATHS = ["/", "/login", "/expired", "/api/auth/login", "/api/admin/users"];
const ADMIN_ONLY_PREFIXES = ["/chats", "/settings", "/admin", "/archive"];
const USER_ONLY_PREFIXES = ["/chat"];

function startsWithAny(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function isPublic(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  // invite links and auth API are always reachable
  if (pathname.startsWith("/i/")) return true;
  if (pathname.startsWith("/api/auth/")) return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname.startsWith("/favicon")) return true;
  if (pathname === "/manifest.webmanifest") return true;
  if (pathname === "/robots.txt") return true;
  return false;
}

/**
 * Refreshes the Supabase auth cookie, gates protected routes, and routes
 * users to /chat vs admins to /chats automatically.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(toSet) {
        for (const { name, value } of toSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user) {
    if (isPublic(pathname)) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // signed in — check whether this user is admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin, suspended, archived")
    .eq("id", user.id)
    .maybeSingle();

  // Suspended / archived → kick out
  if (!profile || profile.suspended || profile.archived) {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = "/expired";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (pathname === "/login" || pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = profile.is_admin ? "/chats" : "/chat";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Admin-only routes
  if (startsWithAny(pathname, ADMIN_ONLY_PREFIXES) && !profile.is_admin) {
    const url = request.nextUrl.clone();
    url.pathname = "/chat";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // The /chat user view should not be reachable by admins (they have /chats)
  if (startsWithAny(pathname, USER_ONLY_PREFIXES) && profile.is_admin) {
    const url = request.nextUrl.clone();
    url.pathname = "/chats";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
