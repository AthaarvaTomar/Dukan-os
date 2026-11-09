import type { ReactNode } from "react";
import { AuthRedirect } from "@/components/dashboard/auth-redirect";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { fetchMyBusinessId } from "@/lib/db/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Supabase not configured (e.g. before .env.local is filled in): send the
  // visitor to sign-in gracefully instead of failing the render.
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> | null = null;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return <AuthRedirect message="Supabase is not configured yet. Add your project keys to .env.local." />;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <AuthRedirect />;

  const businessId = await fetchMyBusinessId(supabase);
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
