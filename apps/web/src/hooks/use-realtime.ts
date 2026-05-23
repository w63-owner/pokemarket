"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type TableName = keyof Database["public"]["Tables"];
type EventType = "INSERT" | "UPDATE" | "DELETE" | "*";

interface UseRealtimeOptions<T extends TableName> {
  channelName: string;
  table: T;
  filter?: string;
  event?: EventType;
  onInsert?: (
    payload: RealtimePostgresChangesPayload<
      Database["public"]["Tables"][T]["Row"]
    >,
  ) => void;
  onUpdate?: (
    payload: RealtimePostgresChangesPayload<
      Database["public"]["Tables"][T]["Row"]
    >,
  ) => void;
  onDelete?: (
    payload: RealtimePostgresChangesPayload<
      Database["public"]["Tables"][T]["Row"]
    >,
  ) => void;
  enabled?: boolean;
}

export function useRealtime<T extends TableName>({
  channelName,
  table,
  filter,
  event = "*",
  onInsert,
  onUpdate,
  onDelete,
  enabled = true,
}: UseRealtimeOptions<T>) {
  const callbacksRef = useRef({ onInsert, onUpdate, onDelete });

  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    callbacksRef.current = { onInsert, onUpdate, onDelete };
  }, [onInsert, onUpdate, onDelete]);

  useEffect(() => {
    if (!enabled) return;

    // #region agent log
    try {
      const w = window as unknown as { __rtCounters?: Record<string, number> };
      w.__rtCounters = w.__rtCounters || {};
      w.__rtCounters[channelName] = (w.__rtCounters[channelName] || 0) + 1;
      fetch(
        "http://127.0.0.1:7638/ingest/38e16e0f-1e33-457e-a7b0-2a438c776c6a",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "f9fd1f",
          },
          body: JSON.stringify({
            sessionId: "f9fd1f",
            hypothesisId: "A",
            location: "use-realtime.ts:56",
            message: "useRealtime effect run",
            data: {
              channelName,
              subscribeCallId: w.__rtCounters[channelName],
              table,
              event,
              enabled,
              hasFilter: Boolean(filter),
              stack: new Error("trace").stack?.split("\n").slice(1, 6),
            },
            timestamp: Date.now(),
          }),
        },
      ).catch(() => {});
    } catch {
      /* noop */
    }
    // #endregion

    const supabase = createClient();

    const channelConfig: {
      event: EventType;
      schema: string;
      table: string;
      filter?: string;
    } = {
      event,
      schema: "public",
      table,
    };

    if (filter) {
      channelConfig.filter = filter;
    }

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes" as const,
        channelConfig,
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const typed = payload as RealtimePostgresChangesPayload<
            Database["public"]["Tables"][T]["Row"]
          >;

          switch (payload.eventType) {
            case "INSERT":
              callbacksRef.current.onInsert?.(typed);
              break;
            case "UPDATE":
              callbacksRef.current.onUpdate?.(typed);
              break;
            case "DELETE":
              callbacksRef.current.onDelete?.(typed);
              break;
          }
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [channelName, table, filter, event, enabled]);

  return channelRef;
}
