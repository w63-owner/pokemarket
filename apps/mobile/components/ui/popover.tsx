import { Modal, Pressable } from "react-native";
import { MotiView } from "moti";
import { cn } from "@/lib/cn";
import { duration, fadeInScale, useReducedMotionSafe } from "@/lib/motion";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
};

/**
 * Mobile popovers should generally be Sheets (bottom sheet) for better UX.
 * This Popover is a centered floating bubble — use sparingly (small menus).
 */
export function Popover({ open, onOpenChange, children, className }: Props) {
  const reduceMotion = useReducedMotionSafe();
  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      onRequestClose={() => onOpenChange(false)}
    >
      <Pressable
        onPress={() => onOpenChange(false)}
        className="flex-1 bg-black/30"
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="absolute right-4 top-20"
        >
          <MotiView
            from={reduceMotion ? fadeInScale.animate : fadeInScale.from}
            animate={fadeInScale.animate}
            transition={{ type: "timing", duration: duration.instant }}
            className={cn(
              "rounded-xl border border-border bg-card p-2 shadow-lg",
              className,
            )}
          >
            {children}
          </MotiView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
