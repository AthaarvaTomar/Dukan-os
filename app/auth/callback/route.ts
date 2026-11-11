import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getSafeRedirectPath } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function resolveRedirectOrigin(request: Request, fallbackOrigin: string): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (process.env.NODE_ENV !== "development" && forwardedHost) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${forwardedHost}`;
  }
  return fallbackOrigin;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const authError = searchParams.get("error_description") ?? searchParams.get("error");
  const destination = getSafeRedirectPath(searchParams.get("next"));
  const baseOrigin = resolveRedirectOrigin(request, origin);

  if (authError) {
    return NextResponse.redirect(`${baseOrigin}/login?error=${encodeURIComponent(authError)}`);
  }

  try {
    const supabase = await createSupabaseServerClient();
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(`${baseOrigin}${destination}`);
      }
      return NextResponse.redirect(`${baseOrigin}/login?error=${encodeURIComponent(error.message)}`);
    }
    if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (!error) {
        return NextResponse.redirect(`${baseOrigin}${destination}`);
      }
      return NextResponse.redirect(`${baseOrigin}/login?error=${encodeURIComponent(error.message)}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Authentication callback failed.";
    return NextResponse.redirect(`${baseOrigin}/login?error=${encodeURIComponent(message)}`);
  }

  return NextResponse.redirect(
    `${baseOrigin}/login?error=${encodeURIComponent("Confirmation link was missing or expired. Please sign in or request a new link.")}`,
  );
}
