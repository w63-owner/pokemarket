import { Modal, Pressable, View, type ModalProps } from "react-native";
import { AnimatePresence, MotiView } from "moti";
import { BlurView } from "expo-blur";
import { cn } from "@/lib/cn";
import { duration, fadeInScale, useReducedMotionSafe } from "@/lib/motion";
import { useEffectiveTheme } from "@/lib/stores/theme";
import { Text } from "./text";

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
} & Omit<ModalProps, "visible" | "onRequestClose" | "transparent">;

/**
 * Modal centered dialog with a blurred backdrop (parity with the web
 * `<Dialog>` shadcn primitive). The backdrop fade and the content
 * scale-in are driven by Moti so we can rely on `AnimatePresence` for
 * the exit animation — the native `Modal` `animationType` is left at
 * `"none"` so it doesn't fight our fade.
 */
export function Dialog({
  open,
  onOpenChange,
  children,
  className,
  ...rest
}: DialogProps) {
  const reduceMotion = useReducedMotionSafe();
  const theme = useEffectiveTheme();

  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      onRequestClose={() => onOpenChange(false)}
      statusBarTranslucent
      {...rest}
    >
      <AnimatePresence>
        {open ? (
          <MotiView
            key="dialog-backdrop"
            from={{ opacity: reduceMotion ? 1 : 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: "timing", duration: duration.fast }}
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
            }}
          >
            <BlurView
              intensity={20}
              tint={theme === "dark" ? "dark" : "default"}
              style={{ flex: 1 }}
            >
              <Pressable
                onPress={() => onOpenChange(false)}
                className="flex-1 items-center justify-center bg-black/40 px-4"
              >
                <Pressable
                  onPress={(e) => e.stopPropagation()}
                  className="w-full"
                >
                  <MotiView
                    from={reduceMotion ? fadeInScale.animate : fadeInScale.from}
                    animate={fadeInScale.animate}
                    exit={fadeInScale.exit}
                    transition={{ type: "timing", duration: duration.fast }}
                    className={cn(
                      "w-full rounded-2xl border border-border bg-card p-6",
                      className,
                    )}
                  >
                    {children}
                  </MotiView>
                </Pressable>
              </Pressable>
            </BlurView>
          </MotiView>
        ) : null}
      </AnimatePresence>
    </Modal>
  );
}

export function DialogHeader({ children }: { children: React.ReactNode }) {
  return <View className="mb-4 gap-1">{children}</View>;
}

export function DialogTitle({ children }: { children: React.ReactNode }) {
  return <Text variant="h3">{children}</Text>;
}

export function DialogDescription({ children }: { children: React.ReactNode }) {
  return <Text variant="muted">{children}</Text>;
}

export function DialogFooter({ children }: { children: React.ReactNode }) {
  return <View className="mt-4 flex-row justify-end gap-2">{children}</View>;
}
