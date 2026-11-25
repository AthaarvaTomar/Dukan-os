"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle, Store } from "lucide-react";
import { useBusinessInfo } from "@/components/dashboard/business-context";
import { isValidUpiId } from "@/lib/billing";

interface BusinessSettings {
  id: string;
  name: string;
  currency: string;
  allow_negative_stock: boolean;
  upi_id?: string | null;
}

export default function SettingsPage() {
  const router = useRouter();
  const { updateBusinessInfo } = useBusinessInfo();
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [name, setName] = useState("");
  const [upiId, setUpiId] = useState("");
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { createSupabaseBrowserClient } = await import("@/lib/supabase/client");
        const { fetchMyBusinessId } = await import("@/lib/db/queries");
        const supabase = createSupabaseBrowserClient();
        const businessId = await fetchMyBusinessId(supabase);
        if (!businessId) throw new Error("No shop found for your account.");

        let loaded: BusinessSettings | null = null;
        const primary = await supabase
          .from("businesses")
          .select("id, name, currency, allow_negative_stock, upi_id")
          .eq("id", businessId)
          .single();

        if (!primary.error && primary.data) {
          loaded = primary.data as BusinessSettings;
        } else if (primary.error?.message?.includes("upi_id")) {
          const fallback = await supabase
            .from("businesses")
            .select("id, name, currency, allow_negative_stock")
            .eq("id", businessId)
            .single();
          if (fallback.error) throw new Error(fallback.error.message);
          loaded = fallback.data ? { ...(fallback.data as BusinessSettings), upi_id: "" } : null;
        } else if (primary.error) {
          throw new Error(primary.error.message);
        }

        if (!active || !loaded) return;
        setSettings(loaded);
        setName(loaded.name);
        setUpiId(loaded.upi_id ?? "");
        setAllowNegativeStock(loaded.allow_negative_stock);
      } catch (loadFailure) {
        if (active) {
          setLoadError(
            loadFailure instanceof Error
              ? loadFailure.message
              : "Shop settings could not be loaded.",
          );
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !settings) return;
    setFormError(null);
    setNotice(null);
    const trimmedName = name.trim();
    const trimmedUpiId = upiId.trim();
    if (!trimmedName) {
      setFormError("Shop name is required.");
      return;
    }
    if (trimmedUpiId && !isValidUpiId(trimmedUpiId)) {
      setFormError("Enter a valid UPI ID (for example, yourshop@okaxis or 9876543210@ybl).");
      return;
    }
    setBusy(true);
    try {
      const { createSupabaseBrowserClient } = await import("@/lib/supabase/client");
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("businesses")
        .update({
          name: trimmedName,
          allow_negative_stock: allowNegativeStock,
          upi_id: trimmedUpiId,
        })
        .eq("id", settings.id);
      if (error) {
        if (error.message.includes("upi_id")) {
          throw new Error(
            "The upi_id column is missing in Supabase. Run migration 0007_upi_qr_billing.sql and try saving again.",
          );
        }
        throw new Error(error.message);
      }
      updateBusinessInfo({ businessName: trimmedName, upiId: trimmedUpiId });
      router.refresh();
      setNotice("Shop settings saved.");
    } catch (saveFailure) {
      setFormError(
        saveFailure instanceof Error ? saveFailure.message : "Shop settings could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6 lg:px-9">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Settings</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Update your shop name, UPI payment ID, and stock rules.
        </p>
      </header>

      {loadError && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {loadError}
        </p>
      )}

      {!loadError && !settings && (
        <p className="flex items-center gap-2 text-sm text-slate-500" role="status">
          <LoaderCircle size={15} className="animate-spin" /> Loading shop settings…
        </p>
      )}

      {settings && (
        <form onSubmit={save} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <label className="block text-xs font-medium text-slate-600">
            Shop name
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm outline-none transition focus:border-lime-500 focus:bg-white focus:ring-2 focus:ring-lime-100"
            />
          </label>

          <label className="block text-xs font-medium text-slate-600">
            UPI ID
            <input
              type="text"
              value={upiId}
              onChange={(event) => setUpiId(event.target.value)}
              placeholder="e.g. sharmastore@okaxis or 9876543210@ybl"
              autoComplete="off"
              spellCheck={false}
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm outline-none transition focus:border-lime-500 focus:bg-white focus:ring-2 focus:ring-lime-100"
            />
            <span className="mt-1 block text-[11px] font-normal text-slate-400">
              Used to generate UPI payment QR codes on billing receipts. Leave blank to hide the QR code.
            </span>
          </label>

          <label className="block text-xs font-medium text-slate-600">
            Currency
            <input
              disabled
              value={settings.currency}
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-100 px-3.5 text-sm text-slate-500"
            />
            <span className="mt-1 block text-[11px] font-normal text-slate-400">
              Currency is fixed to {settings.currency} in this version.
            </span>
          </label>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={allowNegativeStock}
                onChange={(event) => setAllowNegativeStock(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-lime-600"
              />
              <span>
                <span className="block text-sm font-medium text-slate-800">
                  Allow negative stock
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                  By default sales cannot take stock below zero. Enable this only if your
                  workflow records sales before stock arrives.
                </span>
              </span>
            </label>
          </div>

          {notice && (
            <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              {notice}
            </p>
          )}
          {formError && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
          >
            {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />}
            Save settings
          </button>
        </form>
      )}

      {settings && (
        <p className="flex items-center gap-2 text-xs text-slate-400">
          <Store size={13} aria-hidden="true" />
          Shop ID: <span className="font-mono">{settings.id}</span>
        </p>
      )}
    </div>
  );
}
