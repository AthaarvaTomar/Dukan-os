"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { navigateAcrossAuthBoundary } from "@/lib/supabase/env";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const { createSupabaseBrowserClient } = await import("@/lib/supabase/client");
      const supabase = createSupabaseBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw new Error(updateError.message);
      navigateAcrossAuthBoundary("/");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not update the password.");
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
      <h1 className="text-xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mt-1 text-sm text-slate-500">Set a new password for your account.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block text-xs font-medium text-slate-600">
          New password
          <input
            required
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm outline-none transition focus:border-lime-500 focus:bg-white focus:ring-2 focus:ring-lime-100"
          />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Confirm new password
          <input
            required
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
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
          {busy ? <LoaderCircle size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
          Update password
        </button>
      </form>
    </section>
  );
}
