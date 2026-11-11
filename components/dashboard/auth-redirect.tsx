"use client";

import { useEffect } from "react";
import Link from "next/link";
import { LoaderCircle, Store } from "lucide-react";
import { navigateAcrossAuthBoundary } from "@/lib/supabase/env";

/**
 * Build-time/prerender fallback for the dashboard layout: sends the visitor to
 * sign-in without requiring a runtime redirect.
 */
export function AuthRedirect({
  to = "/login",
  message,
}: {
  to?: string;
  message?: string;
}) {
  useEffect(() => {
    navigateAcrossAuthBoundary(to, true);
  }, [to]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f7f8fa] px-4 text-slate-900">
      <Link href="/login" className="mb-6 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-lime-300 text-slate-950">
          <Store size={22} strokeWidth={2.2} aria-hidden="true" />
        </span>
        <span className="text-xl font-semibold tracking-tight">
          dukaan<span className="font-normal text-slate-400">OS</span>
        </span>
      </Link>
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <LoaderCircle size={15} className="animate-spin" />
        {message ?? "Taking you to sign in…"}
      </p>
    </div>
  );
}
