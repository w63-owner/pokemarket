import { Pressable, View } from "react-native";
import { Popover } from "./popover";
import { Text } from "./text";
import { cn } from "@/lib/cn";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: Array<{
    label: string;
    onPress: () => void;
    destructive?: boolean;
    icon?: React.ReactNode;
  }>;
};

export function DropdownMenu({ open, onOpenChange, items }: Props) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <View className="min-w-44">
        {items.map((item, i) => (
          <Pressable
            key={i}
            onPress={() => {
              item.onPress();
              onOpenChange(false);
            }}
            className="flex-row items-center gap-2 rounded-md px-3 py-2.5 active:bg-muted"
          >
            {item.icon}
            <Text
              className={cn(
                "text-sm",
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
