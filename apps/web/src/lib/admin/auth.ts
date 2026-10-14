import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type AdminContext = {
  user: { id: string; email: string | undefined };
  profile: { role: string };
};

type AdminLookup =
  | { status: "anonymous" }
  | { status: "forbidden" }
  | { status: "ok"; admin: AdminContext };

/**
 * The `(admin)` layout cannot protect page data. Next.js renders each route
 * segment on its own, so a layout redirect or a withheld `children` slot still
 * leaves the page Server Component in the RSC payload. Privileged pages must
 * call `requireAdminPage` before reading with the service role.
 */
async function loadAdminContext(): Promise<AdminLookup> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { status: "anonymous" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") return { status: "forbidden" };

  return {
    status: "ok",
    admin: {
      user: { id: user.id, email: user.email },
      profile: { role: profile.role },
    },
  };
}

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
export async function requireAdmin(): Promise<AdminContext | NextResponse> {
  const lookup = await loadAdminContext();
  if (lookup.status === "anonymous") {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  if (lookup.status === "forbidden") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  return lookup.admin;
}

/**
 * Guard for admin Server Component pages. Throws via `redirect` before any
 * service-role read so the page segment cannot serialize privileged data.
 */
export async function requireAdminPage(): Promise<AdminContext> {
  const lookup = await loadAdminContext();
  if (lookup.status === "anonymous") redirect("/auth");
  if (lookup.status === "forbidden") redirect("/");
  return lookup.admin;
}
