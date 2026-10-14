import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const single = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    const error = new Error(`REDIRECT ${url}`);
    throw Object.assign(error, { digest: `NEXT_REDIRECT;${url}` });
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    from: () => ({
      select: () => ({
        eq: () => ({ single }),
      }),
    }),
  }),
}));

import { requireAdmin, requireAdminPage } from "./auth";

const adminPages = [
  "src/app/(admin)/admin/users/page.tsx",
  "src/app/(admin)/admin/disputes/page.tsx",
  "src/app/(admin)/admin/finance/page.tsx",
];

describe("requireAdminPage", () => {
  beforeEach(() => {
    getUser.mockReset();
    single.mockReset();
  });

  it("redirects anonymous callers to sign-in before any admin read", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    await expect(requireAdminPage()).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;/auth",
    });
    expect(single).not.toHaveBeenCalled();
  });

  it("redirects signed-in non-admins away from admin data", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "buyer@example.com" } },
    });
    single.mockResolvedValue({ data: { role: "user" } });

    await expect(requireAdminPage()).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;/",
    });
  });

  it("returns the admin context for an admin", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "admin-1", email: "admin@example.com" } },
    });
    single.mockResolvedValue({ data: { role: "admin" } });

    await expect(requireAdminPage()).resolves.toEqual({
      user: { id: "admin-1", email: "admin@example.com" },
      profile: { role: "admin" },
    });
  });
});

describe("requireAdmin", () => {
  beforeEach(() => {
    getUser.mockReset();
    single.mockReset();
  });

  it("keeps 401 for anonymous API callers and 403 for non-admins", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const anonymous = await requireAdmin();
    expect(anonymous).toBeInstanceOf(Response);
    expect((anonymous as Response).status).toBe(401);

    getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "buyer@example.com" } },
    });
    single.mockResolvedValue({ data: { role: "user" } });
    const forbidden = await requireAdmin();
    expect(forbidden).toBeInstanceOf(Response);
    expect((forbidden as Response).status).toBe(403);
  });
});

describe("admin pages", () => {
  it("authorizes before reading with the service role", () => {
    const webRoot = path.resolve(__dirname, "../../..");
    for (const relativePath of adminPages) {
      const source = readFileSync(path.join(webRoot, relativePath), "utf8");
      const guardAt = source.indexOf("await requireAdminPage()");
      const readAt = Math.min(
        ...["createAdminClient(", "getFinancialOperationsSnapshot("]
          .map((needle) => source.indexOf(needle))
          .filter((index) => index >= 0),
      );
      expect(guardAt, relativePath).toBeGreaterThan(-1);
      expect(guardAt, relativePath).toBeLessThan(readAt);
    }
  });
});
