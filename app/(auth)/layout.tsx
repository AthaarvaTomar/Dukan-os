import Link from "next/link";
import { Store } from "lucide-react";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f7f8fa] px-4 py-10 text-slate-900">
      <Link href="/" className="mb-8 flex items-center gap-3" aria-label="DukaanOS home">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-lime-300 text-slate-950">
          <Store size={22} strokeWidth={2.2} aria-hidden="true" />
        </span>
        <span className="text-xl font-semibold tracking-tight">
          dukaan<span className="font-normal text-slate-400">OS</span>
        </span>
      </Link>
      <main className="w-full max-w-md">{children}</main>
      <p className="mt-8 text-xs text-slate-400">Your shop&apos;s home base, all in one place.</p>
    </div>
  );
}
