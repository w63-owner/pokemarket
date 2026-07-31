import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const channels: Array<{
    on: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
  }> = [];
  const removeChannel = vi.fn(async () => "ok");
  const connect = vi.fn();
  return {
    channels,
    removeChannel,
    connect,
    createClient: vi.fn(() => ({
      channel: vi.fn(() => {
        const channel = {
          on: vi.fn(),
          subscribe: vi.fn(),
        };
        channel.on.mockReturnValue(channel);
        channels.push(channel);
        return channel;
      }),
      removeChannel,
      realtime: { connect },
    })),
  };
});

vi.mock("@/lib/supabase/client", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@sentry/nextjs", () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  setContext: vi.fn(),
  setMeasurement: vi.fn(),
}));

import { subscription, useRealtime } from "./use-realtime";

const subscriptions = [subscription("messages", "INSERT")];

describe("useRealtime registry", () => {
  beforeEach(() => {
    mocks.channels.length = 0;
    mocks.removeChannel.mockClear();
    mocks.connect.mockClear();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shares one channel until the final reference unmounts", async () => {
    const first = renderHook(() =>
      useRealtime({ channelName: "thread:1", subscriptions }),
    );
    const second = renderHook(() =>
      useRealtime({ channelName: "thread:1", subscriptions }),
    );

    await act(async () => {});
    expect(mocks.channels).toHaveLength(1);
    expect(mocks.channels[0].subscribe).toHaveBeenCalledOnce();

    first.unmount();
    expect(mocks.removeChannel).not.toHaveBeenCalled();
    second.unmount();
    expect(mocks.removeChannel).toHaveBeenCalledOnce();
  });

  it("rebuilds subscribed channels when the tab becomes visible", async () => {
    const hook = renderHook(() =>
      useRealtime({ channelName: "thread:2", subscriptions }),
    );
    await act(async () => {});

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(mocks.removeChannel).toHaveBeenCalledOnce();

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    act(() => document.dispatchEvent(new Event("visibilitychange")));

    expect(mocks.connect).toHaveBeenCalledOnce();
    expect(mocks.channels).toHaveLength(2);
    expect(mocks.channels[1].subscribe).toHaveBeenCalledOnce();
    hook.unmount();
  });
});
