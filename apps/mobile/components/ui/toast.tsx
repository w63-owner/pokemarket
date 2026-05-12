import { create } from "zustand";
import { useEffect } from "react";
import { Pressable, View } from "react-native";
import { MotiView, AnimatePresence } from "moti";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react-native";
import { Text } from "./text";

type ToastType = "success" | "error" | "info";

type ToastItem = {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
};

type Store = {
  items: ToastItem[];
  push: (t: Omit<ToastItem, "id">) => void;
  dismiss: (id: string) => void;
};

const useStore = create<Store>((set) => ({
  items: [],
  push: (t) => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ items: [...s.items, { ...t, id }] }));
    setTimeout(() => {
      set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
    }, 3500);
  },
  dismiss: (id) =>
    set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}));

export const toast = {
  success: (title: string, description?: string) =>
    useStore.getState().push({ type: "success", title, description }),
  error: (title: string, description?: string) =>
    useStore.getState().push({ type: "error", title, description }),
  info: (title: string, description?: string) =>
    useStore.getState().push({ type: "info", title, description }),
};

const iconMap: Record<ToastType, React.ComponentType<{ size: number; color: string }>> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const colorMap: Record<ToastType, string> = {
  success: "#16a34a",
  error: "#dc2626",
  info: "#2563eb",
};

export function ToastViewport() {
  const items = useStore((s) => s.items);
  const dismiss = useStore((s) => s.dismiss);
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", top: insets.top + 8, left: 16, right: 16 }}
    >
      <AnimatePresence>
        {items.map((item) => {
          const Icon = iconMap[item.type];
          return (
            <MotiView
              key={item.id}
              from={{ opacity: 0, translateY: -20 }}
              animate={{ opacity: 1, translateY: 0 }}
              exit={{ opacity: 0, translateY: -20 }}
              transition={{ type: "timing", duration: 200 }}
              className="mb-2 flex-row items-start gap-3 rounded-xl border border-border bg-card p-3 shadow"
            >
              <Icon size={20} color={colorMap[item.type]} />
              <View className="flex-1">
                <Text className="font-semibold">{item.title}</Text>
                {item.description ? (
                  <Text variant="muted">{item.description}</Text>
                ) : null}
              </View>
              <Pressable onPress={() => dismiss(item.id)} hitSlop={8}>
                <X size={16} color="#64748b" />
              </Pressable>
            </MotiView>
          );
        })}
      </AnimatePresence>
    </View>
  );
}
