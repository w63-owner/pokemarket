import { View } from "react-native";
import { cn } from "@/lib/cn";
import { Sheet } from "./sheet";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
};

/**
 * On mobile, popovers are surfaced as bottom sheets — the native
 * iOS/Android action-sheet pattern. This is a deliberate divergence
 * from the web `<Popover>` which anchors to its trigger; on phones the
 * spatial anchor hurts more than it helps because the trigger is often
 * partially obscured by the keyboard or stuck near the top of the
 * screen, far from the user's thumb.
 *
 * The API matches the previous floating-bubble Popover so call sites
 * (most importantly `DropdownMenu`) don't need to change.
 */
export function Popover({ open, onOpenChange, children, className }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <View className={cn("py-2", className)}>{children}</View>
    </Sheet>
  );
}
