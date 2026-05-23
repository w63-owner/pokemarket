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
