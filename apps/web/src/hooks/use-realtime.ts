"use client";

import { useEffect, useMemo, useRef } from "react";
import * as Sentry from "@sentry/nextjs";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
  SupabaseClient,
} from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";

type TableName = keyof Database["public"]["Tables"];
type EventType = "INSERT" | "UPDATE" | "DELETE" | "*";
type Payload = RealtimePostgresChangesPayload<Record<string, unknown>>;
type Dispatcher = (payload: Payload) => void;

export type RealtimePayload<T extends TableName> =
  RealtimePostgresChangesPayload<Database["public"]["Tables"][T]["Row"]>;

export interface Subscription {
  table: TableName;
  event?: EventType;
  filter?: string;
  onInsert?: Dispatcher;
  onUpdate?: Dispatcher;
  onDelete?: Dispatcher;
}

export function subscription<T extends TableName>(
  table: T,
  event: EventType,
  options: {
    filter?: string;
    onInsert?: (payload: RealtimePayload<T>) => void;
    onUpdate?: (payload: RealtimePayload<T>) => void;
    onDelete?: (payload: RealtimePayload<T>) => void;
  } = {},
): Subscription {
  return {
    table,
    event,
    filter: options.filter,
    onInsert: options.onInsert as Dispatcher | undefined,
    onUpdate: options.onUpdate as Dispatcher | undefined,
    onDelete: options.onDelete as Dispatcher | undefined,
  };
}

interface RegistryEntry {
  channel: RealtimeChannel;
  refCount: number;
  dispatchers: Map<string, Set<Dispatcher>>;
  wired: Map<string, { event: EventType; table: TableName; filter?: string }>;
  subscribed: boolean;
}

const registry = new Map<string, RegistryEntry>();
let visibilityCleanup: (() => void) | null = null;

export function getActiveChannelCount(): number {
  return registry.size;
}

function recordChannelCount(): void {
  const count = getActiveChannelCount();
  Sentry.setContext("realtime", { channel_count: count });
  Sentry.addBreadcrumb({
    category: "realtime",
    level: count > 5 ? "warning" : "info",
    message: `active_channels=${count}`,
    data: { channel_count: count },
  });
}

function keyOf(subscriptionConfig: {
  event: EventType;
  table: TableName;
  filter?: string;
}): string {
  return `${subscriptionConfig.event}|${subscriptionConfig.table}|${subscriptionConfig.filter ?? ""}`;
}

function attachListener(entry: RegistryEntry, key: string): void {
  const config = entry.wired.get(key);
  if (!config) return;
  entry.channel.on(
    "postgres_changes" as never,
    {
      event: config.event,
      schema: "public",
      table: config.table,
      ...(config.filter ? { filter: config.filter } : {}),
    },
    (payload: Payload) => {
      const createdAt =
        payload.eventType === "INSERT" &&
        typeof payload.new.created_at === "string"
          ? Date.parse(payload.new.created_at)
          : Number.NaN;
      if (Number.isFinite(createdAt)) {
        Sentry.setMeasurement(
          "messaging.realtime_delay",
          Math.max(0, Date.now() - createdAt),
          "millisecond",
        );
      }
      for (const dispatcher of entry.dispatchers.get(key) ?? []) {
        dispatcher(payload);
      }
    },
  );
}

function subscribe(entry: RegistryEntry, channelName: string): void {
  if (entry.subscribed || document.visibilityState === "hidden") return;
  entry.subscribed = true;
  entry.channel.subscribe((status, error) => {
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      Sentry.captureException(error ?? new Error(`Realtime ${status}`), {
        tags: { component: "realtime", channel: channelName, status },
      });
    }
  });
}

function rebuildChannel(
  supabase: SupabaseClient<Database>,
  channelName: string,
  entry: RegistryEntry,
): void {
  entry.channel = supabase.channel(channelName);
  entry.subscribed = false;
  for (const key of entry.wired.keys()) attachListener(entry, key);
  subscribe(entry, channelName);
}

function ensureVisibilityListener(supabase: SupabaseClient<Database>): void {
  if (visibilityCleanup) return;
  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      for (const entry of registry.values()) {
        entry.subscribed = false;
        void supabase.removeChannel(entry.channel);
      }
      return;
    }

    supabase.realtime.connect();
    for (const [name, entry] of registry) {
      rebuildChannel(supabase, name, entry);
    }
  };
  document.addEventListener("visibilitychange", onVisibilityChange);
  visibilityCleanup = () => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    visibilityCleanup = null;
  };
}

function acquire(
  channelName: string,
  configs: ReadonlyArray<Subscription>,
): () => void {
  const supabase = createClient();
  let entry = registry.get(channelName);
  if (!entry) {
    entry = {
      channel: supabase.channel(channelName),
      refCount: 0,
      dispatchers: new Map(),
      wired: new Map(),
      subscribed: false,
    };
    registry.set(channelName, entry);
    ensureVisibilityListener(supabase);
    recordChannelCount();
  }

  entry.refCount += 1;
  const cleanups: Array<() => void> = [];

  for (const config of configs) {
    const normalized = {
      event: config.event ?? "*",
      table: config.table,
      filter: config.filter,
    };
    const key = keyOf(normalized);
    let dispatchers = entry.dispatchers.get(key);
    if (!dispatchers) {
      dispatchers = new Set();
      entry.dispatchers.set(key, dispatchers);
    }

    const dispatcher: Dispatcher = (payload) => {
      if (payload.eventType === "INSERT") config.onInsert?.(payload);
      if (payload.eventType === "UPDATE") config.onUpdate?.(payload);
      if (payload.eventType === "DELETE") config.onDelete?.(payload);
    };
    dispatchers.add(dispatcher);
    cleanups.push(() => dispatchers?.delete(dispatcher));

    if (!entry.wired.has(key) && !entry.subscribed) {
      entry.wired.set(key, normalized);
      attachListener(entry, key);
    }
  }

  queueMicrotask(() => {
    const current = registry.get(channelName);
    if (current) subscribe(current, channelName);
  });

  return () => {
    for (const cleanup of cleanups) cleanup();
    if (!entry) return;
    entry.refCount -= 1;
    if (entry.refCount > 0) return;
    registry.delete(channelName);
    void supabase.removeChannel(entry.channel);
    if (registry.size === 0) visibilityCleanup?.();
    recordChannelCount();
  };
}

export function useRealtime({
  channelName,
  subscriptions,
  enabled = true,
}: {
  channelName: string;
  subscriptions: ReadonlyArray<Subscription>;
  enabled?: boolean;
}) {
  const subscriptionsRef = useRef(subscriptions);
  useEffect(() => {
    subscriptionsRef.current = subscriptions;
  }, [subscriptions]);

  const structuralKey = subscriptions
    .map((item) => `${item.table}|${item.event ?? "*"}|${item.filter ?? ""}`)
    .join("~");
  const stableSubscriptions = useMemo(
    () =>
      subscriptions.map((item, index) => ({
        table: item.table,
        event: item.event,
        filter: item.filter,
        onInsert: (payload: Payload) =>
          subscriptionsRef.current[index]?.onInsert?.(payload),
        onUpdate: (payload: Payload) =>
          subscriptionsRef.current[index]?.onUpdate?.(payload),
        onDelete: (payload: Payload) =>
          subscriptionsRef.current[index]?.onDelete?.(payload),
      })),
    // Callback identity is deliberately handled through subscriptionsRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [structuralKey],
  );

  useEffect(() => {
    if (!enabled) return;
    return acquire(channelName, stableSubscriptions);
  }, [channelName, enabled, stableSubscriptions]);
}
