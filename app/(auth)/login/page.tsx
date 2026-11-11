"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LoaderCircle, LogIn } from "lucide-react";
import { navigateAcrossAuthBoundary } from "@/lib/supabase/env";

export default function LoginPage() {
  return (
    <Suspense fallback={<section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm" />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(() => searchParams.get("error"));
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const { createSupabaseBrowserClient } = await import("@/lib/supabase/client");
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw new Error(signInError.message);
      navigateAcrossAuthBoundary(searchParams.get("next") ?? "/");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Sign in failed.");
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
      <h1 className="text-xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1 text-sm text-slate-500">Sign in to your shop workspace.</p>
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
        <label className="block text-xs font-medium text-slate-600">
          Password
          <input
            required
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
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
          {busy ? <LoaderCircle size={16} className="animate-spin" /> : <LogIn size={16} />}
          Sign in
        </button>
      </form>
      <div className="mt-5 flex items-center justify-between text-xs">
        <Link href="/forgot-password" className="font-medium text-slate-500 hover:text-slate-800">
          Forgot password?
        </Link>
        <Link href="/signup" className="font-medium text-lime-700 hover:text-lime-800">
          Create an account
        </Link>
      </div>
    </section>
  );
}
