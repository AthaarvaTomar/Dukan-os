/**
 * Shared public Supabase environment readers and redirect path sanitization.
 * Uses literal `process.env.NEXT_PUBLIC_*` lookups so Next.js inlines values
 * into browser and edge bundles at build time.
 */

const MISSING_ENV_MESSAGE =
  "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.";

function isValidSupabaseUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function readSupabasePublicEnv(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!isValidSupabaseUrl(url) || !anonKey) return null;
  return { url, anonKey };
}

export function requireSupabasePublicEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    throw new Error(MISSING_ENV_MESSAGE);
  }
  if (!isValidSupabaseUrl(url)) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid http(s) URL.");
  }
  return { url, anonKey };
}

/** Allow only same-origin relative paths (reject protocol-relative `//...`). */
export function getSafeRedirectPath(
  next: string | null | undefined,
  fallback = "/",
): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}

/** Full browser navigation clears Next.js Router Cache across auth state changes. */
export function navigateAcrossAuthBoundary(path: string, replace = false): void {
  const target = new URL(getSafeRedirectPath(path), window.location.origin).toString();
  if (replace) {
    window.location.replace(target);
  } else {
    window.location.assign(target);
  }
}

