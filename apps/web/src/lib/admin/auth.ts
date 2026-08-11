import { forbidden, redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type AdminIdentity = {
  user: { id: string; email: string | undefined };
  profile: { role: string };
};

/**
 * Server-side guard for /api/admin/* routes.
 *
 * Returns the authed admin user on success, or a `NextResponse` you should
 * return to the client (401 or 403).
 *
 * Usage:
 *
 *   const guard = await requireAdmin();
 *   if (guard instanceof NextResponse) return guard;
 *   const { user, profile } = guard;
 */
export async function requireAdmin(): Promise<AdminIdentity | NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  return {
    user: { id: user.id, email: user.email },
    profile: { role: profile.role },
  };
}

/**
 * Authorization boundary for `/admin/*` Server Component pages.
 *
 * Layout-only checks are NOT sufficient in the App Router: page segments
 * render independently and can appear in the RSC payload even when a parent
 * layout hides `{children}`. Call this at the top of every admin page (and
 * any shared admin data loader) before touching service-role data.
 */
export async function requireAdminPage(): Promise<AdminIdentity> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    forbidden();
  }

  return {
    user: { id: user.id, email: user.email },
    profile: { role: "admin" },
  };
}
