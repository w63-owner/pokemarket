import { Modal, Pressable, View } from "react-native";
import { MotiView } from "moti";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "@/lib/cn";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  side?: "bottom" | "top";
  className?: string;
};

export function Sheet({
  open,
  onOpenChange,
  children,
  side = "bottom",
  className,
}: Props) {
  const insets = useSafeAreaInsets();
  const fromY = side === "bottom" ? 400 : -400;

  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      onRequestClose={() => onOpenChange(false)}
    >
      <Pressable
        onPress={() => onOpenChange(false)}
        className={cn(
          "flex-1 bg-black/50",
          side === "bottom" ? "justify-end" : "justify-start",
        )}
      >
        <Pressable onPress={(e) => e.stopPropagation()}>
          <MotiView
            from={{ translateY: fromY }}
            animate={{ translateY: 0 }}
            exit={{ translateY: fromY }}
            transition={{ type: "spring", damping: 18, stiffness: 200 }}
            style={{
              paddingBottom: side === "bottom" ? insets.bottom + 16 : 16,
              paddingTop: side === "top" ? insets.top + 16 : 16,
            }}
            className={cn(
              "bg-card px-4",
              side === "bottom" ? "rounded-t-3xl" : "rounded-b-3xl",
              className,
            )}
          >
            {side === "bottom" ? (
              <View className="mb-3 h-1.5 w-12 self-center rounded-full bg-muted" />
            ) : null}
            {children}
          </MotiView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
