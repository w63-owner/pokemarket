/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDb } from "@/test-utils/db-mock";

let currentUser: { id: string; email?: string } | null = {
  id: "user-b",
  email: "b@example.com",
};

vi.mock("@/lib/auth/api", () => ({
  getRequestUser: vi.fn(async () => ({
    user: currentUser,
    source: "bearer" as const,
  })),
}));

let mockClient: any;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockClient,
}));

import { POST } from "./route";

const token = "ExpoPushToken[shared-device-token]";

beforeEach(() => {
  currentUser = { id: "user-b", email: "b@example.com" };
});

function req(body: unknown) {
  return new Request("http://localhost/api/push/expo-tokens", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("push/expo-tokens", () => {
  it("reassigns an existing physical device token to the signed-in user", async () => {
    const db = createMockDb({
      expo_push_tokens: [
        {
          id: "token-1",
          user_id: "user-a",
          token,
          platform: "ios",
          device_id: null,
          app_version: "1.0.0",
          created_at: "2026-06-18T10:00:00.000Z",
          updated_at: "2026-06-18T10:00:00.000Z",
        },
      ],
    });
    mockClient = db.client;

    const res = await POST(
      req({ token, platform: "android", app_version: "1.0.1" }),
    );

    expect(res.status).toBe(200);
    expect(db.state.expo_push_tokens).toHaveLength(1);
    expect(db.state.expo_push_tokens[0]).toMatchObject({
      id: "token-1",
      user_id: "user-b",
      token,
      platform: "android",
      app_version: "1.0.1",
    });
  });
});
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

let currentUser: { id: string } | null = { id: "user-1" };

const upsertSpy = vi.fn(async () => ({ error: null }));
const deleteEqEqSpy = vi.fn(async () => ({ error: null }));

vi.mock("@/lib/auth/api", () => ({
  getRequestUser: async () => ({
    user: currentUser,
    source: "bearer" as const,
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      upsert: upsertSpy,
      delete: () => ({
        eq: (_col: string, _val: string) => ({
          eq: deleteEqEqSpy,
        }),
      }),
    }),
  }),
}));

import { POST, DELETE } from "./route";

function makeReq(body: any, method: "POST" | "DELETE" = "POST") {
  return new Request("http://localhost/api/push/expo-tokens", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  upsertSpy.mockClear();
  deleteEqEqSpy.mockClear();
  currentUser = { id: "user-1" };
});

describe("POST /api/push/expo-tokens", () => {
  it("rejects unauthenticated", async () => {
    currentUser = null;
    const res = await POST(
      makeReq({
        token: "ExponentPushToken[abc]",
        platform: "ios",
      }),
    );
    expect(res.status).toBe(401);
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it("rejects payloads missing the platform", async () => {
    const res = await POST(makeReq({ token: "ExponentPushToken[abc]" }));
    expect(res.status).toBe(400);
  });

  it("rejects tokens that don't look like Expo push tokens", async () => {
    const res = await POST(makeReq({ token: "garbage", platform: "ios" }));
    expect(res.status).toBe(400);
  });

  it("upserts a valid token with user_id derived from auth", async () => {
    const res = await POST(
      makeReq({
        token: "ExponentPushToken[deviceA]",
        platform: "android",
        device_id: "PixelPro",
        app_version: "0.1.0",
      }),
    );
    expect(res.status).toBe(200);
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        token: "ExponentPushToken[deviceA]",
        platform: "android",
        device_id: "PixelPro",
        app_version: "0.1.0",
      }),
      expect.objectContaining({ onConflict: "user_id,token" }),
    );
  });
});

describe("DELETE /api/push/expo-tokens", () => {
  it("rejects unauthenticated", async () => {
    currentUser = null;
    const res = await DELETE(
      makeReq({ token: "ExponentPushToken[abc]" }, "DELETE"),
    );
    expect(res.status).toBe(401);
    expect(deleteEqEqSpy).not.toHaveBeenCalled();
  });

  it("deletes the matching (user_id, token) row", async () => {
    const res = await DELETE(
      makeReq({ token: "ExponentPushToken[abc]" }, "DELETE"),
    );
    expect(res.status).toBe(200);
    expect(deleteEqEqSpy).toHaveBeenCalledWith(
      "token",
      "ExponentPushToken[abc]",
    );
  });
});
