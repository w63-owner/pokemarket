import { useEffect, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { channels } from "@/lib/realtime/channels";

/**
 * Lightweight global presence channel — every authenticated user joins the
 * same channel and broadcasts their `user_id`. Used by the inbox to show
 * "online now" dots next to conversation partners.
 *
 * Supabase Presence is in-memory only (no DB writes), so this is essentially
 * free even at 10k MAU. We tear down the channel when the app backgrounds
 * to release the websocket — same pattern as `useRealtime`.
 */
export function usePresence(currentUserId: string | undefined) {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!currentUserId) {
      setOnlineIds(new Set());
      return;
    }

    let channel: RealtimeChannel | null = null;
    let isForeground = AppState.currentState === "active";

    const collectPresentIds = (): Set<string> => {
      if (!channel) return new Set();
      const state = channel.presenceState<{ user_id: string }>();
      const ids = new Set<string>();
      for (const arr of Object.values(state)) {
        for (const entry of arr) {
          if (entry.user_id) ids.add(entry.user_id);
        }
      }
      return ids;
    };

    const subscribe = () => {
      if (channel) return;
      channel = supabase.channel(channels.presence(), {
        config: { presence: { key: currentUserId } },
      });

      channel
        .on("presence", { event: "sync" }, () => {
          setOnlineIds(collectPresentIds());
        })
        .on("presence", { event: "join" }, () => {
          setOnlineIds(collectPresentIds());
        })
        .on("presence", { event: "leave" }, () => {
          setOnlineIds(collectPresentIds());
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await channel?.track({
              user_id: currentUserId,
              online_at: Date.now(),
            });
          }
        });
    };

    const unsubscribe = () => {
      if (!channel) return;
      const c = channel;
      channel = null;
      c.untrack().catch(() => {});
      supabase.removeChannel(c).catch(() => {});
    };

    if (isForeground) subscribe();

    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      const active = next === "active";
      if (active === isForeground) return;
      isForeground = active;
      if (active) {
        subscribe();
      } else {
        unsubscribe();
        setOnlineIds(new Set());
      }
    });

    return () => {
      sub.remove();
      unsubscribe();
    };
  }, [currentUserId]);

  return onlineIds;
}
