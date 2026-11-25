import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { pingSupabase, verifyCronAuthorization } from "../lib/supabase/keepalive.ts";

function makeFakeSupabaseClient(response: { error: { message: string } | null }): SupabaseClient {
  return {
    from(table: string) {
      assert.equal(table, "businesses");
      return {
        select(columns: string, options?: { count?: string; head?: boolean }) {
          assert.equal(columns, "id");
          assert.deepEqual(options, { count: "exact", head: true });
          return Promise.resolve(response);
        },
      };
    },
  } as unknown as SupabaseClient;
}

test("cron auth: allows requests when CRON_SECRET is unset", () => {
  assert.equal(verifyCronAuthorization(null, undefined), true);
  assert.equal(verifyCronAuthorization(null, "   "), true);
});

test("cron auth: requires exact Bearer token when CRON_SECRET is set", () => {
  assert.equal(verifyCronAuthorization("Bearer top-secret", "top-secret"), true);
  assert.equal(verifyCronAuthorization("Bearer wrong", "top-secret"), false);
  assert.equal(verifyCronAuthorization("Bearer top-secret-extra", "top-secret"), false);
  assert.equal(verifyCronAuthorization("top-secret", "top-secret"), false);
  assert.equal(verifyCronAuthorization(null, "top-secret"), false);
});

test("pingSupabase: succeeds on clean head query", async () => {
  const result = await pingSupabase(makeFakeSupabaseClient({ error: null }));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.mode, "injected");
    assert.ok(!Number.isNaN(Date.parse(result.checkedAt)));
  }
});

test("pingSupabase: surfaces database errors", async () => {
  const result = await pingSupabase(
    makeFakeSupabaseClient({ error: { message: "relation \"public.businesses\" does not exist" } }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 500);
    assert.match(result.error, /businesses/);
  }
});

test("pingSupabase: returns 503 when Supabase env vars are missing", async () => {
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const prevService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const result = await pingSupabase();
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 503);
      assert.match(result.error, /not configured/i);
    }
  } finally {
    if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    if (prevAnon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevAnon;
    if (prevService === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = prevService;
  }
});
