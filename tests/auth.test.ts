import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { NextRequest } from "next/server";

import {
  getSafeRedirectPath,
  readSupabasePublicEnv,
  requireSupabasePublicEnv,
} from "../lib/supabase/env.ts";
import { updateSession } from "../lib/supabase/middleware.ts";

test("auth env: trims pasted whitespace and validates URLs", () => {
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "  https://example.supabase.co\n";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "  anon-key-123  ";
    assert.deepEqual(readSupabasePublicEnv(), {
      url: "https://example.supabase.co",
      anonKey: "anon-key-123",
    });

    process.env.NEXT_PUBLIC_SUPABASE_URL = "not-a-valid-url";
    assert.equal(readSupabasePublicEnv(), null);
    assert.throws(() => requireSupabasePublicEnv(), /valid http\(s\) URL/);

    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    assert.throws(() => requireSupabasePublicEnv(), /Supabase is not configured/);
  } finally {
    if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    if (prevKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevKey;
  }
});

test("auth redirects: allows safe relative paths and rejects protocol-relative or external URLs", () => {
  assert.equal(getSafeRedirectPath("/billing"), "/billing");
  assert.equal(getSafeRedirectPath("/onboarding?from=signup"), "/onboarding?from=signup");
  assert.equal(getSafeRedirectPath("//evil.example/phish"), "/");
  assert.equal(getSafeRedirectPath("https://evil.example"), "/");
  assert.equal(getSafeRedirectPath(null), "/");
});

test("auth middleware: allows unauthenticated /auth/callback and redirects protected paths to /login", async () => {
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key-123";

    const callbackReq = new NextRequest("https://app.example.com/auth/callback?code=pkce-123&next=/onboarding");
    const callbackResult = await updateSession(callbackReq);
    assert.equal(callbackResult.configured, true);
    assert.equal(callbackResult.response.headers.get("location"), null);

    const billingReq = new NextRequest("https://app.example.com/billing");
    const billingResult = await updateSession(billingReq);
    assert.equal(billingResult.configured, true);
    assert.equal(
      billingResult.response.headers.get("location"),
      "https://app.example.com/login?next=%2Fbilling",
    );
  } finally {
    if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    if (prevKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevKey;
  }
});

test("dashboard layout: calls connection() before Supabase session checks for Cache Components", () => {
  const layoutSource = fs.readFileSync(
    path.join(process.cwd(), "app", "(dashboard)", "layout.tsx"),
    "utf8",
  );
  const connectionPos = layoutSource.indexOf("await connection()");
  const getUserPos = layoutSource.indexOf("supabase.auth.getUser()");
  assert.ok(connectionPos !== -1, "Expected await connection() in AuthenticatedDashboard");
  assert.ok(getUserPos > connectionPos, "Expected await connection() before supabase.auth.getUser()");
});

