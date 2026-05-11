import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260511110628_restrict_message_read_receipt_updates.sql",
  ),
  "utf8",
);

describe("message read-receipt RLS hardening migration", () => {
  it("installs a BEFORE UPDATE trigger on messages", () => {
    expect(migration).toContain(
      "CREATE TRIGGER ensure_message_read_receipt_update_only",
    );
    expect(migration).toContain("BEFORE UPDATE ON public.messages");
  });

  it("blocks direct API updates to message fields other than read_at", () => {
    expect(migration).toContain("current_user NOT IN ('anon', 'authenticated')");

    for (const column of [
      "id",
      "conversation_id",
      "sender_id",
      "content",
      "message_type",
      "offer_id",
      "metadata",
      "created_at",
    ]) {
      expect(migration).toContain(
        `NEW.${column} IS DISTINCT FROM OLD.${column}`,
      );
    }

    expect(migration).toContain(
      "OLD.read_at IS NOT NULL AND NEW.read_at IS DISTINCT FROM OLD.read_at",
    );
  });
});
