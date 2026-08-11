import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronAuthorized } from "@/lib/cron/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RETENTION_DAYS = 365;
const ORPHAN_GRACE_HOURS = 24;
const STORAGE_BATCH_SIZE = 500;
const MESSAGE_BATCH_SIZE = 5_000;
const MAX_BATCHES = 10;

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const retentionCutoff = new Date(
    Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1_000,
  ).toISOString();
  const orphanCutoff = new Date(
    Date.now() - ORPHAN_GRACE_HOURS * 60 * 60 * 1_000,
  ).toISOString();

  let deletedAttachments = 0;
  let deletedOrphans = 0;
  let deletedMessages = 0;

  try {
    for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
      const { data, error } = await admin.rpc(
        "get_expired_message_attachment_paths",
        { p_before: retentionCutoff, p_limit: STORAGE_BATCH_SIZE },
      );
      if (error) throw error;

      const paths = (data ?? []).map((row) => row.storage_path);
      if (paths.length === 0) break;

      const { error: removeError } = await admin.storage
        .from("message_attachments")
        .remove(paths);
      if (removeError) throw removeError;
      deletedAttachments += paths.length;
      if (paths.length < STORAGE_BATCH_SIZE) break;
    }

    for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
      const { data, error } = await admin.rpc(
        "get_orphaned_message_attachment_paths",
        { p_before: orphanCutoff, p_limit: STORAGE_BATCH_SIZE },
      );
      if (error) throw error;

      const paths = (data ?? []).map((row) => row.storage_path);
      if (paths.length === 0) break;

      const { error: removeError } = await admin.storage
        .from("message_attachments")
        .remove(paths);
      if (removeError) throw removeError;
      deletedOrphans += paths.length;
      if (paths.length < STORAGE_BATCH_SIZE) break;
    }

    for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
      const { data, error } = await admin.rpc("delete_expired_messages", {
        p_before: retentionCutoff,
        p_limit: MESSAGE_BATCH_SIZE,
      });
      if (error) throw error;

      const count = Number(data ?? 0);
      deletedMessages += count;
      if (count < MESSAGE_BATCH_SIZE) break;
    }

    return NextResponse.json({
      retention_days: RETENTION_DAYS,
      deleted_attachments: deletedAttachments,
      deleted_orphans: deletedOrphans,
      deleted_messages: deletedMessages,
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { component: "messaging", operation: "retention" },
    });
    return NextResponse.json(
      { error: "Messaging retention failed" },
      { status: 500 },
    );
  }
}
