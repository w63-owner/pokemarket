import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-side guard for /api/admin/* routes.
 *
 * Returns the authed admin user on success, or a `NextResponse` you should
 * return to the client (401 or 403). Mirrors the pattern used by
 * src/components/layout/admin-guard.tsx for Server Components.
 *
 * Usage:
 *
 *   const guard = await requireAdmin();
 *   if (guard instanceof NextResponse) return guard;
 *   const { user, profile } = guard;
 */
export async function requireAdmin(): Promise<
  | {
      user: { id: string; email: string | undefined };
      profile: { role: string };
    }
  | NextResponse
> {
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
