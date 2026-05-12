import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

export type AdminAuditEntry = {
  adminId: string;
  actionType: string;
  resourceType?: string;
  resourceId?: string;
  payload?: Json;
  ipAddress?: string | null;
  userAgent?: string | null;
};

/**
 * Best-effort audit logging for admin actions.
 *
 * Failures here are swallowed (logged to Sentry) so a logging hiccup never
 * blocks the actual admin action. The action itself should already have
 * succeeded by the time this is called.
 */
export async function logAdminAction(entry: AdminAuditEntry): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("admin_audit_log").insert({
      admin_id: entry.adminId,
      action_type: entry.actionType,
      resource_type: entry.resourceType ?? null,
      resource_id: entry.resourceId ?? null,
      payload: entry.payload ?? {},
      ip_address: entry.ipAddress ?? null,
      user_agent: entry.userAgent ?? null,
    });
    if (error) {
      Sentry.captureException(error, {
        extra: { context: "admin_audit_log_insert", entry },
      });
    }
  } catch (err) {
    Sentry.captureException(err, {
      extra: { context: "admin_audit_log_unhandled", entry },
    });
  }
}
