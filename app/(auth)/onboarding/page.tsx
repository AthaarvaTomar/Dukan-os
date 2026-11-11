"use client";

import { useEffect, useState, type FormEvent } from "react";
import { LoaderCircle, Store } from "lucide-react";
import { navigateAcrossAuthBoundary } from "@/lib/supabase/env";

export default function OnboardingPage() {
  const [shopName, setShopName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { createSupabaseBrowserClient } = await import("@/lib/supabase/client");
        const { fetchMyBusinessId } = await import("@/lib/db/queries");
        const supabase = createSupabaseBrowserClient();
        const businessId = await fetchMyBusinessId(supabase);
        if (!active) return;
        if (businessId) {
          navigateAcrossAuthBoundary("/", true);
          return;
        }
        setChecking(false);
      } catch {
        if (active) setChecking(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const { createSupabaseBrowserClient } = await import("@/lib/supabase/client");
      const supabase = createSupabaseBrowserClient();
      const { error: businessError } = await supabase.rpc("create_business_for_owner", {
        p_name: shopName.trim(),
      });
      if (businessError) throw new Error(businessError.message);
      navigateAcrossAuthBoundary("/");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Shop setup failed.");
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
      <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
        <Store size={19} className="text-lime-600" aria-hidden="true" />
        Set up your shop
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        One last step — tell us your shop&apos;s name. You can start clean and add products whenever you&apos;re ready.
      </p>
      {checking ? (
        <p className="mt-6 flex items-center gap-2 text-sm text-slate-500" role="status">
          <LoaderCircle size={15} className="animate-spin" /> Checking your workspace…
        </p>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
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
            {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Store size={16} />}
            Create my shop
          </button>
        </form>
      )}
    </section>
  );
}
