import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";
import type { Database } from "@pokemarket/shared";
import { supabase } from "@/lib/supabase";

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

/**
 * Subscribe to Supabase Realtime postgres_changes from React Native.
 *
 * Cleanup is critical on mobile: we tear down the channel on unmount AND
 * when the app moves to background, then re-subscribe when foreground.
 * This avoids battery drain and stale-socket warnings on iOS.
 */
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
  const isForegroundRef = useRef(AppState.currentState === "active");

  useEffect(() => {
    callbacksRef.current = { onInsert, onUpdate, onDelete };
  }, [onInsert, onUpdate, onDelete]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    function subscribe() {
      if (cancelled || channelRef.current) return;

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

      if (filter) channelConfig.filter = filter;

      const channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes" as never,
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
    }

    function unsubscribe() {
      const channel = channelRef.current;
      if (!channel) return;
      channelRef.current = null;
      supabase.removeChannel(channel).catch(() => {});
    }

    if (isForegroundRef.current) subscribe();

    const sub = AppState.addEventListener(
      "change",
      (next: AppStateStatus) => {
        const isActive = next === "active";
        isForegroundRef.current = isActive;
        if (isActive) {
          subscribe();
        } else {
          unsubscribe();
        }
      },
    );

    return () => {
      cancelled = true;
      sub.remove();
      unsubscribe();
    };
  }, [channelName, table, filter, event, enabled]);

  return channelRef;
}
