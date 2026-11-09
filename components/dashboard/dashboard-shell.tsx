"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Bell, LoaderCircle, LogOut, Menu, Store, X } from "lucide-react";
import { Toaster, toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BusinessProvider } from "@/components/dashboard/business-context";
import { businessActions } from "@/lib/db/store";
import { cn } from "@/lib/utils";
import { getNavigationItem, navigationGroups } from "@/lib/navigation";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-3" aria-label="DukaanOS home">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime-300 text-slate-950">
        <Store size={20} strokeWidth={2.2} aria-hidden="true" />
      </span>
      <span className="text-[17px] font-semibold tracking-tight text-white">
        dukaan<span className="font-normal text-slate-400">OS</span>
      </span>
    </Link>
  );
}

function MerchantProfile({
  userName,
  businessName,
  onSignOut,
  signingOut,
}: {
  userName: string;
  businessName: string;
  onSignOut: () => void;
  signingOut: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-200 to-orange-300 text-sm font-semibold text-orange-950">
          {initials(userName)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{businessName}</p>
          <p className="mt-0.5 truncate text-xs text-slate-400">{userName}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onSignOut}
        disabled={signingOut}
        className="mt-3 flex h-8 w-full items-center justify-center gap-2 rounded-lg border border-white/10 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
      >
        {signingOut ? <LoaderCircle size={13} className="animate-spin" /> : <LogOut size={13} />}
        Sign out
      </button>
    </div>
  );
}

function Sidebar({
  pathname,
  onNavigate,
  userName,
  businessName,
  onSignOut,
  signingOut,
}: {
  pathname: string;
  onNavigate: () => void;
  userName: string;
  businessName: string;
  onSignOut: () => void;
  signingOut: boolean;
}) {
  return (
    <div className="flex h-full flex-col bg-[#111a29] px-4 pb-4 pt-5">
      <div className="mb-9 flex items-center justify-between px-1">
        <Brand />
        <Button
          variant="ghost"
          size="icon"
          className="text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"
          onClick={onNavigate}
          aria-label="Close navigation"
        >
          <X size={19} />
        </Button>
      </div>

      <nav aria-label="Main navigation" className="flex-1 space-y-7">
        {navigationGroups.map((group) => (
          <div key={group.label}>
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              {group.label}
            </p>
            <ul className="space-y-1">
              {group.items.map((item) => {
                const active = getNavigationItem(pathname)?.href === item.href;
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors",
                        active
                          ? "bg-white/10 text-white shadow-sm"
                          : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-100",
                      )}
                    >
                      <Icon
                        size={18}
                        strokeWidth={active ? 2 : 1.8}
                        className={cn(
                          "shrink-0 transition-colors",
                          active ? "text-lime-300" : "text-slate-500 group-hover:text-slate-300",
                        )}
                        aria-hidden="true"
                      />
                      <span>{item.label}</span>
                      {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-lime-300" aria-hidden="true" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="mb-4 rounded-xl border border-lime-300/10 bg-lime-300/[0.06] px-3.5 py-3">
        <p className="text-xs font-medium text-lime-200">Made for your next big thing</p>
        <p className="mt-1 text-[11px] leading-5 text-slate-400">
          Your shop&apos;s home base, all in one place.
        </p>
      </div>
      <MerchantProfile
        userName={userName}
        businessName={businessName}
        onSignOut={onSignOut}
        signingOut={signingOut}
      />
    </div>
  );
}

export function DashboardShell({
  children,
  userName,
  userEmail,
  businessName,
}: {
  children: ReactNode;
  userName: string;
  userEmail: string;
  businessName: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const activeItem = getNavigationItem(pathname);

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const { createSupabaseBrowserClient } = await import("@/lib/supabase/client");
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
      await businessActions.reset();
      router.push("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <BusinessProvider value={{ businessName, userName, userEmail }}>
    <div className="flex min-h-screen bg-[#f7f8fa] text-slate-900">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[2px] lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[268px] transition-transform duration-200 lg:sticky lg:top-0 lg:z-30 lg:h-screen lg:shrink-0 lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <Sidebar
          pathname={pathname}
          onNavigate={() => setSidebarOpen(false)}
          userName={userName}
          businessName={businessName}
          onSignOut={() => void signOut()}
          signingOut={signingOut}
        />
      </aside>

      <div className="min-w-0 flex-1">
        <Toaster position="top-right" />
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-9">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Open navigation menu"
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={20} />
            </Button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="hidden sm:inline">Workspace</span>
                <span className="hidden sm:inline">/</span>
                <span className="truncate font-medium text-slate-600">{activeItem?.label ?? "Overview"}</span>
              </div>
              <p className="mt-0.5 truncate text-sm font-semibold text-slate-900 sm:text-[15px]">
                {activeItem?.label ?? "Overview"}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            <span className="hidden items-center gap-2 text-xs text-slate-500 md:inline-flex">
              <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
              Store is live
            </span>
            <span className="hidden h-7 w-px bg-slate-200 md:block" aria-hidden="true" />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Notifications"
              className="relative"
              onClick={() => toast("You're all caught up", { description: "New store activity will show up here." })}
            >
              <Bell size={18} strokeWidth={1.8} />
              <span className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-orange-500 ring-2 ring-white" aria-hidden="true" />
            </Button>
            <div className="hidden h-8 w-px bg-slate-200 sm:block" aria-hidden="true" />
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-amber-200 to-orange-300 text-xs font-semibold text-orange-950 sm:hidden">
                {initials(userName)}
              </div>
              <div className="hidden text-right sm:block">
                <p className="text-xs font-semibold text-slate-800">{userName}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">{userEmail}</p>
              </div>
              <div className="hidden h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-amber-200 to-orange-300 text-xs font-semibold text-orange-950 sm:flex">
                {initials(userName)}
              </div>
            </div>
          </div>
        </header>
        <main className="px-4 py-7 sm:px-6 sm:py-8 lg:px-9 lg:py-9">{children}</main>
      </div>
      </BusinessProvider>
    </div>
  );
}
