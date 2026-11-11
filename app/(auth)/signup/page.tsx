"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { LoaderCircle, UserPlus } from "lucide-react";
import { navigateAcrossAuthBoundary } from "@/lib/supabase/env";

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [shopName, setShopName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const { createSupabaseBrowserClient } = await import("@/lib/supabase/client");
      const supabase = createSupabaseBrowserClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName.trim() },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
        },
      });
      if (signUpError) throw new Error(signUpError.message);

      if (!data.session) {
        setInfo(
          "Account created. Check your email for a confirmation link, then sign in to finish setting up your shop.",
        );
        setBusy(false);
        return;
      }

      const { error: businessError } = await supabase.rpc("create_business_for_owner", {
        p_name: shopName.trim(),
      });
      if (businessError) throw new Error(businessError.message);
      navigateAcrossAuthBoundary("/");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Registration failed.");
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
      <h1 className="text-xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1 text-sm text-slate-500">Set up your shop in under a minute.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block text-xs font-medium text-slate-600">
          Your name
          <input
            required
            autoComplete="name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm outline-none transition focus:border-lime-500 focus:bg-white focus:ring-2 focus:ring-lime-100"
          />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Shop name
          <input
            required
            value={shopName}
            onChange={(event) => setShopName(event.target.value)}
            placeholder="e.g. Sharma General Store"
            className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm outline-none transition focus:border-lime-500 focus:bg-white focus:ring-2 focus:ring-lime-100"
          />
        </label>
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
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm outline-none transition focus:border-lime-500 focus:bg-white focus:ring-2 focus:ring-lime-100"
          />
          <span className="mt-1 block text-[11px] font-normal text-slate-400">At least 8 characters.</span>
        </label>
        {error && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
            {error}
          </p>
        )}
        {info && (
          <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800">
            {info}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || Boolean(info)}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
        >
          {busy ? <LoaderCircle size={16} className="animate-spin" /> : <UserPlus size={16} />}
          Create account
        </button>
      </form>
      <p className="mt-5 text-center text-xs text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-lime-700 hover:text-lime-800">
          Sign in
        </Link>
      </p>
    </section>
  );
}
