import { Pressable, View } from "react-native";
import { Popover } from "./popover";
import { Text } from "./text";
import { cn } from "@/lib/cn";

type DropdownItem = {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  icon?: React.ReactNode;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: DropdownItem[];
};

/**
 * Mobile DropdownMenu — list of actions surfaced via the bottom Sheet
 * pattern (see `<Popover>` for the rationale behind this divergence
 * from the web's spatial anchoring). Each row uses a 48dp tap target,
 * keeping label sizes large enough for accessibility while still
 * matching the action-sheet aesthetic of the platform.
 */
export function DropdownMenu({ open, onOpenChange, items }: Props) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <View className="gap-0.5">
        {items.map((item, i) => (
          <Pressable
            key={i}
            onPress={() => {
              item.onPress();
              onOpenChange(false);
            }}
            className="flex-row items-center gap-3 rounded-lg px-3 py-3.5 active:bg-muted"
            accessibilityRole="button"
            accessibilityLabel={item.label}
          >
            {item.icon ? (
              <View className="w-5 items-center">{item.icon}</View>
            ) : null}
            <Text
              className={cn(
                "text-base",
                item.destructive ? "text-destructive" : "text-foreground",
              )}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Popover>
  );
}
