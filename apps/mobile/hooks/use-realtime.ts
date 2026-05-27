import { useEffect, useMemo, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";
import type { Database } from "@pokemarket/shared";
import { supabase } from "@/lib/supabase";

type TableName = keyof Database["public"]["Tables"];
type EventType = "INSERT" | "UPDATE" | "DELETE" | "*";

export type RowOf<T extends TableName> = Database["public"]["Tables"][T]["Row"];
export type RealtimePayload<T extends TableName> =
  RealtimePostgresChangesPayload<RowOf<T>>;

/**
 * Typed handler for a single Supabase `postgres_changes` event on a
 * specific table.
 */
export type RealtimeHandler<T extends TableName> = (
  payload: RealtimePayload<T>,
) => void;

/**
 * Uniform subscription shape stored in the registry. Use the
 * `subscription()` builder below to create a strongly typed entry
 * without fighting TypeScript's array invariance — every entry in a
 * `subscriptions: Subscription[]` array gets independent payload
 * typing via the builder closure, while the array element type stays
 * uniform (and loose).
 */
export interface Subscription {
  table: TableName;
  event?: EventType;
  filter?: string;
  onInsert?: (
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  ) => void;
  onUpdate?: (
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  ) => void;
  onDelete?: (
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  ) => void;
}

/**
 * Helper to declare a type-safe subscription on a specific table while
 * still producing the uniform `Subscription` shape consumed by
 * `useRealtime`. Each call narrows `T` so handler payloads remain
 * typed; the resulting array stays homogeneous.
 *
 * @example
 *   subscription("messages", "INSERT", { onInsert: (p) => p.new.content })
 */
export function subscription<T extends TableName>(
  table: T,
  event: EventType,
  opts: {
    filter?: string;
    onInsert?: RealtimeHandler<T>;
    onUpdate?: RealtimeHandler<T>;
    onDelete?: RealtimeHandler<T>;
  } = {},
): Subscription {
  return {
    table,
    event,
    filter: opts.filter,
    onInsert: opts.onInsert as Subscription["onInsert"],
    onUpdate: opts.onUpdate as Subscription["onUpdate"],
    onDelete: opts.onDelete as Subscription["onDelete"],
  };
}

interface UseRealtimeOptions {
  channelName: string;
  enabled?: boolean;
  subscriptions: ReadonlyArray<Subscription>;
}

// ─────────────────────────────────────────────────────────────────────────
// Global channel registry — ref-counted
//
// Why: the previous implementation appended a random suffix to every
// channel name so that simultaneously mounted callers wouldn't collide
// on Supabase's "cannot add postgres_changes callbacks after subscribe()"
// rule. The trade-off was one websocket per mount — observable in the
// realtime inspector as `inbox-<uid>:ab12cd34`, `inbox-<uid>:ef56gh78`,
// etc. — and missed dedup opportunities across screens.
//
// This registry replaces that with deterministic naming + ref counting:
//   - First mount creates the underlying `supabase.channel(name)`,
//     attaches every `.on('postgres_changes', …)` listener up-front,
//     and calls `.subscribe()` once.
//   - Subsequent mounts with the SAME `channelName` just bump the
//     refcount and attach their dispatcher to the existing listener.
//   - Last unmount tears down the channel + AppState subscription.
//
// Assumption (enforced by callers via `lib/realtime/channels.ts`): every
// call site that shares a `channelName` MUST register identical
// subscription configs (same `{table, event, filter}` tuples). The
// registry warns in dev on config drift and skips the late-added
// listener — to keep the contract obvious.
// ─────────────────────────────────────────────────────────────────────────

type Dispatcher = (
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
) => void;

interface RegistryEntry {
  channel: RealtimeChannel;
  refCount: number;
  /** key = `${event}|${table}|${filter ?? ''}` */
  dispatchers: Map<string, Set<Dispatcher>>;
  /** Subscription configs that have been wired to a `.on()` listener. */
  wired: Map<string, { event: EventType; table: string; filter?: string }>;
  /** AppState subscription shared across refs of this channel. */
  appStateSub: { remove: () => void } | null;
  /** Tracks whether `.subscribe()` was already called on this channel. */
  subscribed: boolean;
}

const registry = new Map<string, RegistryEntry>();

function subscriptionKey(s: {
  event: EventType;
  table: string;
  filter?: string;
}): string {
  return `${s.event}|${s.table}|${s.filter ?? ""}`;
}

function attachListener(
  entry: RegistryEntry,
  key: string,
  config: { event: EventType; table: string; filter?: string },
) {
  const channelConfig: {
    event: EventType;
    schema: string;
    table: string;
    filter?: string;
  } = {
    event: config.event,
    schema: "public",
    table: config.table,
  };
  if (config.filter) channelConfig.filter = config.filter;

  entry.channel.on(
    "postgres_changes" as never,
    channelConfig,
    (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      const dispatchers = entry.dispatchers.get(key);
      if (!dispatchers) return;
      for (const d of dispatchers) d(payload);
    },
  );
}

function ensureSubscribed(entry: RegistryEntry) {
  if (entry.subscribed) return;
  entry.subscribed = true;
  entry.channel.subscribe();
}

function teardown(name: string, entry: RegistryEntry) {
  if (entry.appStateSub) {
    entry.appStateSub.remove();
    entry.appStateSub = null;
  }
  entry.subscribed = false;
  registry.delete(name);
  supabase.removeChannel(entry.channel).catch(() => {});
}

function rebuildChannelForForeground(name: string, entry: RegistryEntry) {
  // Supabase channels are single-use — `.removeChannel()` makes the
  // instance unusable, so we mint a fresh channel and re-attach every
  // already-wired listener before subscribing.
  const fresh = supabase.channel(name);
  entry.channel = fresh;
  entry.subscribed = false;
  for (const [key, config] of entry.wired) {
    attachListener(entry, key, config);
  }
  ensureSubscribed(entry);
}

function acquire(
  channelName: string,
  configs: ReadonlyArray<Subscription>,
): () => void {
  let entry = registry.get(channelName);

  if (!entry) {
    entry = {
      channel: supabase.channel(channelName),
      refCount: 0,
      dispatchers: new Map(),
      wired: new Map(),
      appStateSub: null,
      subscribed: false,
    };
    registry.set(channelName, entry);
  }

  const e = entry;
  e.refCount += 1;

  const cleanups: (() => void)[] = [];

  for (const sub of configs) {
    const event: EventType = sub.event ?? "*";
    const key = subscriptionKey({
      event,
      table: sub.table,
      filter: sub.filter,
    });

    let dispatcherSet = e.dispatchers.get(key);
    if (!dispatcherSet) {
      dispatcherSet = new Set();
      e.dispatchers.set(key, dispatcherSet);
    }

    const dispatcher: Dispatcher = (payload) => {
      switch (payload.eventType) {
        case "INSERT":
          sub.onInsert?.(payload);
          break;
        case "UPDATE":
          sub.onUpdate?.(payload);
          break;
        case "DELETE":
          sub.onDelete?.(payload);
          break;
      }
    };
    dispatcherSet.add(dispatcher);

    if (!e.wired.has(key)) {
      if (e.subscribed) {
        if (__DEV__) {
          console.warn(
            `[useRealtime] Cannot add subscription "${key}" to already-subscribed channel "${channelName}". ` +
              `Every call site sharing a channel name MUST register identical subscriptions in the same render pass.`,
          );
        }
      } else {
        e.wired.set(key, { event, table: sub.table, filter: sub.filter });
        attachListener(e, key, {
          event,
          table: sub.table,
          filter: sub.filter,
        });
      }
    }

    cleanups.push(() => {
      const ds = e.dispatchers.get(key);
      ds?.delete(dispatcher);
    });
  }

  // First ref wires the shared AppState listener: background drops the
  // websocket (battery), foreground rebuilds it with the same .on()
  // listeners. iOS will silently kill an idle socket otherwise and
  // leave React Query stuck on stale data.
  if (!e.appStateSub) {
    let isForeground = AppState.currentState === "active";

    e.appStateSub = AppState.addEventListener(
      "change",
      (next: AppStateStatus) => {
        const active = next === "active";
        if (active === isForeground) return;
        isForeground = active;

        if (active) {
          rebuildChannelForForeground(channelName, e);
        } else {
          const old = e.channel;
          e.subscribed = false;
          supabase.removeChannel(old).catch(() => {});
        }
      },
    );
  }

  // Defer subscribe one microtask so React commit-phase siblings
  // sharing the same channelName can attach their listeners BEFORE we
  // lock the channel via `.subscribe()`.
  queueMicrotask(() => {
    const cur = registry.get(channelName);
    if (!cur) return;
    if (AppState.currentState === "active") {
      ensureSubscribed(cur);
    }
  });

  return () => {
    for (const fn of cleanups) fn();
    e.refCount -= 1;
    if (e.refCount <= 0) {
      teardown(channelName, e);
    }
  };
}

/**
 * Subscribe to Supabase Realtime `postgres_changes` from React Native.
 *
 * Pass multiple `subscriptions` to fuse what used to live on separate
 * channels into a single websocket — e.g. the inbox channel that
 * watches BOTH `messages` INSERT and `conversations` *.
 *
 * Channel names are deduplicated globally via a ref-counted registry,
 * so two mounts of the same logical channel share a single socket.
 */
export function useRealtime({
  channelName,
  enabled = true,
  subscriptions,
}: UseRealtimeOptions) {
  // Keep the latest callbacks in a ref so re-renders don't tear the
  // channel down — the registry binds once per `channelName` and we
  // forward each event through the up-to-date refs.
  const subsRef = useRef(subscriptions);
  useEffect(() => {
    subsRef.current = subscriptions;
  }, [subscriptions]);

  // Build stable proxy subscriptions whose handlers read from the ref
  // so we never re-acquire just because the parent re-rendered with
  // fresh inline callbacks.
  const structuralKey = subscriptions
    .map((s) => `${s.table}|${s.event ?? "*"}|${s.filter ?? ""}`)
    .join("~");

  const proxiedSubs = useMemo<Subscription[]>(() => {
    return subscriptions.map((sub, index) => ({
      table: sub.table,
      event: sub.event,
      filter: sub.filter,
      onInsert: (payload) => subsRef.current[index]?.onInsert?.(payload),
      onUpdate: (payload) => subsRef.current[index]?.onUpdate?.(payload),
      onDelete: (payload) => subsRef.current[index]?.onDelete?.(payload),
    }));
    // We intentionally only rebuild the proxies when the structural
    // identity of the subscription list changes — not on every callback
    // change (handled via subsRef).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structuralKey]);

  useEffect(() => {
    if (!enabled) return;
    const release = acquire(channelName, proxiedSubs);
    return () => {
      release();
    };
  }, [channelName, enabled, proxiedSubs]);
}
