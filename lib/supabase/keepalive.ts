import { timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readSupabasePublicEnv } from "./env";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "./service";

export type KeepaliveResult =
  | {
      ok: true;
      checkedAt: string;
      mode: "service" | "anon" | "injected";
    }
  | {
      ok: false;
      checkedAt: string;
      status: number;
      error: string;
    };

/**
 * Verifies the `Authorization: Bearer <CRON_SECRET>` header when `CRON_SECRET` is set.
 * If no secret is configured, returns true so the read-only health ping still works
 * out of the box on platforms like Vercel Cron.
 */
export function verifyCronAuthorization(
  authorizationHeader: string | null,
  expectedSecret: string | undefined = process.env.CRON_SECRET,
): boolean {
  const secret = expectedSecret?.trim();
  if (!secret) return true;
  if (!authorizationHeader) return false;

  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  const actual = Buffer.from(authorizationHeader.trim(), "utf8");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/**
 * Runs a lightweight read-only query against Supabase PostgreSQL so the project
 * registers database activity and does not auto-pause on the Free plan.
 */
export async function pingSupabase(injectedClient?: SupabaseClient): Promise<KeepaliveResult> {
  const checkedAt = new Date().toISOString();

  let supabase: SupabaseClient;
  let mode: "service" | "anon" | "injected";

  if (injectedClient) {
    supabase = injectedClient;
    mode = "injected";
  } else if (isSupabaseServiceConfigured()) {
    supabase = createSupabaseServiceClient();
    mode = "service";
  } else {
    const publicEnv = readSupabasePublicEnv();
    if (!publicEnv) {
      return {
        ok: false,
        checkedAt,
        status: 503,
        error: "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and a Supabase key.",
      };
    }
    supabase = createClient(publicEnv.url, publicEnv.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    mode = "anon";
  }

  try {
    const { error } = await supabase
      .from("businesses")
      .select("id", { count: "exact", head: true });

    if (error) {
      return {
        ok: false,
        checkedAt,
        status: 500,
        error: error.message,
      };
    }

    return { ok: true, checkedAt, mode };
  } catch (error) {
    return {
      ok: false,
      checkedAt,
      status: 500,
      error: error instanceof Error ? error.message : "Unexpected Supabase keep-alive error.",
    };
  }
}
