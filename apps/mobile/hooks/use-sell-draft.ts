import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "@pokemarket/sell-draft/v1";

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
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(
          () => undefined,
        );
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
    await AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
  }, []);

  return { draft, hydrated, update, clear } as const;
}
