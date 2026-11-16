import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { env } from "@/lib/env";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/signup",
  "/expired",
  "/api/auth/login",
  "/api/admin/users",
];
const ENTRY_PATHS = ["/", "/login", "/signup"];
const ADMIN_ONLY_PREFIXES = ["/chats", "/settings", "/admin", "/archive", "/rooms"];
const USER_ONLY_PREFIXES = ["/chat"];

function startsWithAny(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function isPublic(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (pathname.startsWith("/i/")) return true;
  if (pathname === "/join" || pathname.startsWith("/join/")) return true;
  if (pathname === "/api/rooms/join") return true;
  if (pathname.startsWith("/api/auth/")) return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname.startsWith("/favicon")) return true;
  if (pathname === "/manifest.webmanifest") return true;
  if (pathname === "/robots.txt") return true;
  return false;
}

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin, suspended, archived")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.suspended || profile.archived) {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = "/expired";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (ENTRY_PATHS.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = profile.is_admin ? "/chats" : "/chat";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (startsWithAny(pathname, ADMIN_ONLY_PREFIXES) && !profile.is_admin) {
    const url = request.nextUrl.clone();
    url.pathname = "/chat";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (startsWithAny(pathname, USER_ONLY_PREFIXES) && profile.is_admin) {
    const url = request.nextUrl.clone();
    url.pathname = "/chats";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
