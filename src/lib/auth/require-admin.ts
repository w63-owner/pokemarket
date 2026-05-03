import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export interface AdminContext {
  user: { id: string; email?: string | null };
}

/**
 * Authentication guard for admin-only API routes.
 *
 * Usage:
 *   const { ctx, response } = await requireAdmin();
 *   if (response) return response;        // 401 / 403
 *   // ctx.user.id is the authenticated admin
 *
 * Mirrors the page-level AdminGuard component but returns JSON errors so
 * route handlers can short-circuit with a single line.
 */
export async function requireAdmin(): Promise<
  { ctx: AdminContext; response: null } | { ctx: null; response: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ctx: null,
      response: NextResponse.json(
        { error: "Non authentifié" },
        { status: 401 },
      ),
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return {
      ctx: null,
      response: NextResponse.json({ error: "Accès refusé" }, { status: 403 }),
    };
  }

  return {
    ctx: { user: { id: user.id, email: user.email } },
    response: null,
  };
}
