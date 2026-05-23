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
