import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { readSupabasePublicEnv } from "@/lib/supabase/env";

const PROTECTED_PATHS = ["/", "/billing", "/customers", "/marketing", "/inventory", "/insights", "/ai-assistant", "/settings", "/onboarding"];
const AUTH_PATHS = ["/login", "/signup", "/forgot-password"];

function matchesPrefix(pathname: string, paths: readonly string[]): boolean {
  return paths.some((p) => (p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`)));
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const env = readSupabasePublicEnv();
  if (!env) {
    // Supabase not configured yet: leave routing alone so demo/dev still works.
    return { response, user: null, configured: false };
  }

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  // Never guard /auth/callback — confirmation and password-reset links arrive unauthenticated.
  const isProtected = matchesPrefix(pathname, PROTECTED_PATHS);
  const isAuthPage = matchesPrefix(pathname, AUTH_PATHS);

  if (!user && isProtected) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", pathname);
    return { response: NextResponse.redirect(redirectUrl), user, configured: true };
  }

  if (user && isAuthPage) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    redirectUrl.search = "";
    return { response: NextResponse.redirect(redirectUrl), user, configured: true };
  }

  return { response, user, configured: true };
}
