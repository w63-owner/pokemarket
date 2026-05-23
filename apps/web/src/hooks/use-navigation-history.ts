"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

let navCount = -1;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return navCount;
}

function getServerSnapshot() {
  return 0;
}

function increment() {
  navCount++;
  listeners.forEach((l) => l());
}

export function useNavigationHistory() {
  const count = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { hasHistory: count > 0 };
}

export function NavigationHistoryTracker() {
  const pathname = usePathname();

  useEffect(() => {
    increment();
  }, [pathname]);

  return null;
}
