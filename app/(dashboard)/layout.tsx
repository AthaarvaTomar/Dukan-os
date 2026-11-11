import Link from "next/link";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { AuthRedirect } from "@/components/dashboard/auth-redirect";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { fetchMyBusinessId } from "@/lib/db/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function AuthenticatedDashboard({ children }: { children: ReactNode }) {
  // Advance past Cache Components' Runtime stage before Supabase calls Date.now()
  // internally while validating or refreshing the session.
  await connection();

  // Supabase not configured (e.g. before .env.local is filled in): send the
  // visitor to sign-in gracefully instead of failing the render.
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> | null = null;
  try {
    supabase = await createSupabaseServerClient();
  } catch (configError) {
    return (
      <AuthRedirect
        message={
          configError instanceof Error
            ? configError.message
            : "Supabase is not configured yet. Add your project keys to .env.local."
        }
      />
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <AuthRedirect />;

  let businessId: string | null = null;
  try {
    businessId = await fetchMyBusinessId(supabase);
  } catch (workspaceError) {
    const message =
      workspaceError instanceof Error ? workspaceError.message : "Could not load your shop workspace.";
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f8fa] px-4 text-slate-900">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
          <h1 className="text-lg font-semibold tracking-tight text-slate-950">Workspace setup error</h1>
          <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700" role="alert">
            {message}
          </p>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Verify that your Supabase SQL migrations (`0001`–`0005`) have been run and your Supabase URL/anon key belong to the right project.
          </p>
          <div className="mt-5 flex items-center gap-3 text-xs">
            <Link
              href="/login"
              className="inline-flex h-9 items-center rounded-xl bg-slate-900 px-4 font-medium text-white hover:bg-slate-700"
            >
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }
  if (!businessId) {
    return <AuthRedirect to="/onboarding" message="Setting up your shop…" />;
  }

  const { data: business } = await supabase
    .from("businesses")
    .select("name")
    .eq("id", businessId)
    .single();

  const displayName =
    (user.user_metadata?.full_name as string | undefined)?.trim() || user.email || "Merchant";

  return (
    <DashboardShell
      userName={displayName}
      userEmail={user.email ?? ""}
      businessName={business?.name ?? "Your shop"}
    >
      {children}
    </DashboardShell>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#f7f8fa] text-sm text-slate-500">
          Loading workspace…
        </div>
      }
    >
      <AuthenticatedDashboard>{children}</AuthenticatedDashboard>
    </Suspense>
  );
}
