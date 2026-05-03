import { createAdminClient } from "@/lib/supabase/admin";
import { AdminUsersTable, type AdminUserRow } from "./users-table";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 500;

export default async function AdminUsersPage() {
  let users: AdminUserRow[] = [];

  try {
    const admin = createAdminClient();

    // Latest profiles. Cap at PAGE_SIZE for now — paginated server-side
    // search comes later when this scales beyond a few hundred users.
    const { data: profiles, error: profilesError } = await admin
      .from("profiles")
      .select("id, username, role, kyc_status, created_at")
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (profilesError) throw profilesError;

    const rows = profiles ?? [];

    // Emails live in auth.users, only reachable via the admin auth API.
    // listUsers is paginated (max 1000/page); for now we read the first page,
    // which lines up with our PAGE_SIZE. If the user count grows past ~1k,
    // switch to per-user `getUserById` lookups or a server-side join view.
    const emailById = new Map<string, string>();
    try {
      const { data: authPage } = await admin.auth.admin.listUsers({
        perPage: 1000,
      });
      for (const u of authPage?.users ?? []) {
        if (u.email) emailById.set(u.id, u.email);
      }
    } catch {
      // Auth admin API unavailable (placeholder envs at build time, etc.) —
      // fall through with empty emails rather than 500-ing the page.
    }

    // Listing counts per seller via a single query, aggregated in memory.
    const listingCountById = new Map<string, number>();
    if (rows.length > 0) {
      const ids = rows.map((p) => p.id);
      const { data: listings } = await admin
        .from("listings")
        .select("seller_id")
        .in("seller_id", ids);
      for (const l of listings ?? []) {
        listingCountById.set(
          l.seller_id,
          (listingCountById.get(l.seller_id) ?? 0) + 1,
        );
      }
    }

    users = rows.map((p) => ({
      id: p.id,
      username: p.username,
      email: emailById.get(p.id) ?? "—",
      role: (p.role === "admin" ? "admin" : "user") as "admin" | "user",
      kyc_status: p.kyc_status,
      listings_count: listingCountById.get(p.id) ?? 0,
      joined_at: p.created_at
        ? new Date(p.created_at).toLocaleDateString("fr-FR")
        : "—",
    }));
  } catch (err) {
    // Don't crash the admin shell if Supabase is briefly unreachable —
    // surface an empty state instead.
    console.error("AdminUsersPage: failed to load users", err);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          Gestion des utilisateurs
        </h1>
        <p className="text-muted-foreground text-sm">
          Recherchez, consultez et moderez les comptes utilisateurs (limite a{" "}
          {PAGE_SIZE} comptes les plus recents).
        </p>
      </div>

      <AdminUsersTable users={users} />
    </div>
  );
}
