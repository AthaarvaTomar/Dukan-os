"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { KeyRound, LoaderCircle } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const { createSupabaseBrowserClient } = await import("@/lib/supabase/client");
      const supabase = createSupabaseBrowserClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      if (resetError) throw new Error(resetError.message);
      setSent(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not send the reset email.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
      <h1 className="text-xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-1 text-sm text-slate-500">
        Enter your account email and we&apos;ll send you a reset link.
      </p>
      {sent ? (
        <p role="status" className="mt-6 rounded-lg bg-emerald-50 px-3 py-3 text-xs leading-5 text-emerald-800">
          If an account exists for {email}, a password reset link is on its way. Check your inbox.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-xs font-medium text-slate-600">
            Email
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm outline-none transition focus:border-lime-500 focus:bg-white focus:ring-2 focus:ring-lime-100"
            />
          </label>
          {error && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
          >
            {busy ? <LoaderCircle size={16} className="animate-spin" /> : <KeyRound size={16} />}
            Send reset link
          </button>
        </form>
      )}
      <p className="mt-5 text-center text-xs text-slate-500">
        <Link href="/login" className="font-medium text-lime-700 hover:text-lime-800">
          Back to sign in
        </Link>
      </p>
    </section>
  );
}
