import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { toast } from "@/components/ui/toast";

const STORAGE_KEY = "@pokemarket/sell-draft/v1";

// Minimum delay between two "Brouillon enregistré" toasts. The wizard
// can call `update()` very often (every photo change, every form blur),
// so we throttle to avoid stacking duplicate toasts on top of each
// other when the user is rapidly editing fields.
const SAVE_TOAST_THROTTLE_MS = 30_000;

export type SellDraftPayload = {
  cover?: { publicUrl: string; storagePath: string } | null;
  back?: { publicUrl: string; storagePath: string } | null;
  ocr?: {
    selectedCardKey: string | null;
    parsedName: string | null;
    parsedCardNumber: string | null;
    parsedLanguage: string | null;
  } | null;
  form?: Record<string, unknown> | null;
  updatedAt?: string;
};

/**
 * Persists the in-progress sell flow to AsyncStorage so the user does not
 * lose photos, OCR results or partially-filled fields if the app is killed.
 *
 * Cleared explicitly via `clear()` after a successful publish.
 */
export function useSellDraft() {
  const [draft, setDraft] = useState<SellDraftPayload | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Timestamp of the last "Brouillon enregistré" toast, used to throttle
  // the confirmation toast to once every `SAVE_TOAST_THROTTLE_MS`.
  const lastToastAtRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        if (raw) {
          try {
            setDraft(JSON.parse(raw) as SellDraftPayload);
          } catch {
            setDraft(null);
          }
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });

    return () => {
      cancelled = true;
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, []);

  const update = useCallback((patch: Partial<SellDraftPayload>) => {
    setDraft((prev) => {
      const next: SellDraftPayload = {
        ...(prev ?? {}),
        ...patch,
        updatedAt: new Date().toISOString(),
      };

      if (persistTimer.current) clearTimeout(persistTimer.current);
      persistTimer.current = setTimeout(() => {
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next))
          .then(() => {
            const now = Date.now();
            if (now - lastToastAtRef.current >= SAVE_TOAST_THROTTLE_MS) {
              lastToastAtRef.current = now;
              toast.info("Brouillon enregistré", { duration: 2000 });
            }
          })
          .catch(() => undefined);
      }, 400);

      return next;
    });
  }, []);

  const clear = useCallback(async () => {
    setDraft(null);
    if (persistTimer.current) {
      clearTimeout(persistTimer.current);
      persistTimer.current = null;
    }
    lastToastAtRef.current = 0;
    await AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
  }, []);

  return { draft, hydrated, update, clear } as const;
}
