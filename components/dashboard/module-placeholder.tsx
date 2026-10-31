import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getNavigationItem } from "@/lib/navigation";

export function ModulePlaceholder({ href }: { href: string }) {
  const item = getNavigationItem(href);
  const Icon = item?.icon;

  return (
    <section className="mx-auto flex min-h-[calc(100vh-160px)] w-full max-w-3xl flex-col items-center justify-center px-4 pb-12 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm">
        {Icon && <Icon size={27} strokeWidth={1.7} aria-hidden="true" />}
      </span>
      <p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
        DukaanOS workspace
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
        {item?.label}
      </h1>
      <p className="mt-3 max-w-md text-sm leading-6 text-slate-500">
        This space is ready for what&apos;s next. Your {item?.label.toLowerCase()} tools will live here as your DukaanOS workspace grows.
      </p>
      <Link
        href="/"
        className="mt-7 inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
      >
        Back to overview
        <ArrowRight size={15} aria-hidden="true" />
      </Link>
    </section>
  );
}
