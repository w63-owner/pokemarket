import { Modal, Pressable, View, type ModalProps } from "react-native";
import { MotiView } from "moti";
import { cn } from "@/lib/cn";
import { duration, fadeInScale, useReducedMotionSafe } from "@/lib/motion";
import { Text } from "./text";

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
} & Omit<ModalProps, "visible" | "onRequestClose" | "transparent">;

export function Dialog({ open, onOpenChange, children, ...rest }: DialogProps) {
  const reduceMotion = useReducedMotionSafe();
  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={() => onOpenChange(false)}
      {...rest}
    >
      <Pressable
        onPress={() => onOpenChange(false)}
        className="flex-1 items-center justify-center bg-black/50 px-4"
      >
        <Pressable onPress={(e) => e.stopPropagation()} className="w-full">
          <MotiView
            from={reduceMotion ? fadeInScale.animate : fadeInScale.from}
            animate={fadeInScale.animate}
            transition={{ type: "timing", duration: duration.fast }}
            className="w-full rounded-2xl bg-card p-6"
          >
            {children}
          </MotiView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function DialogHeader({ children }: { children: React.ReactNode }) {
  return <View className="mb-4 gap-1">{children}</View>;
}

export function DialogTitle({ children }: { children: React.ReactNode }) {
  return <Text variant="h4">{children}</Text>;
}

export function DialogDescription({ children }: { children: React.ReactNode }) {
  return <Text variant="muted">{children}</Text>;
}

export function DialogFooter({ children }: { children: React.ReactNode }) {
  return <View className="mt-4 flex-row justify-end gap-2">{children}</View>;
}
