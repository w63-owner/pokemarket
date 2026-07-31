import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendExpo: vi.fn(async () => undefined),
  maybeSingle: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: mocks.maybeSingle }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/push/expo", () => ({
  sendExpoPushNotification: mocks.sendExpo,
}));
vi.mock("@sentry/nextjs", () => ({
  captureException: mocks.captureException,
}));
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}));

import { sendPushNotification } from "./send";

describe("sendPushNotification preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips every transport when the recipient disabled the category", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { enabled: false },
      error: null,
    });

    await sendPushNotification("user-1", "Titre", "Corps", "/messages/1", {
      category: "messages",
    });

    expect(mocks.sendExpo).not.toHaveBeenCalled();
  });

  it("fails closed when preferences cannot be read", async () => {
    const error = new Error("database unavailable");
    mocks.maybeSingle.mockResolvedValue({ data: null, error });

    await sendPushNotification("user-1", "Titre", "Corps", undefined, {
      category: "messages",
    });

    expect(mocks.sendExpo).not.toHaveBeenCalled();
    expect(mocks.captureException).toHaveBeenCalledWith(
      error,
      expect.any(Object),
    );
  });
});
