import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  remove: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: mocks.rpc,
    storage: {
      from: () => ({ remove: mocks.remove }),
    },
  }),
}));
vi.mock("@sentry/nextjs", () => ({
  captureException: mocks.captureException,
}));

import { GET } from "./route";

function request(secret = "test-secret") {
  return new Request("http://localhost/api/cron/messaging-retention", {
    headers: { authorization: `Bearer ${secret}` },
  });
}

describe("cron/messaging-retention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
    mocks.remove.mockResolvedValue({ error: null });
  });

  it("fails closed without the configured bearer secret", async () => {
    const response = await GET(request("wrong-secret"));

    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("removes retained and orphaned attachments before message rows", async () => {
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "get_expired_message_attachment_paths") {
        return Promise.resolve({
          data: [{ message_id: "message-1", storage_path: "conv/old.webp" }],
          error: null,
        });
      }
      if (name === "get_orphaned_message_attachment_paths") {
        return Promise.resolve({
          data: [{ storage_path: "conv/orphan.webp" }],
          error: null,
        });
      }
      return Promise.resolve({ data: 42, error: null });
    });

    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      retention_days: 365,
      deleted_attachments: 1,
      deleted_orphans: 1,
      deleted_messages: 42,
    });
    expect(mocks.remove).toHaveBeenNthCalledWith(1, ["conv/old.webp"]);
    expect(mocks.remove).toHaveBeenNthCalledWith(2, ["conv/orphan.webp"]);
  });
});
