import { Pressable } from "react-native";
import { Check } from "lucide-react-native";
import { cn } from "@/lib/cn";
import { useThemeColor } from "@/lib/theme-colors";

type Props = {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
};

export function Checkbox({ checked, onCheckedChange, disabled }: Props) {
  const primaryForeground = useThemeColor("primaryForeground");
  return (
    <Pressable
      disabled={disabled}
      onPress={() => onCheckedChange(!checked)}
      hitSlop={8}
      className={cn(
        "h-5 w-5 items-center justify-center rounded border",
        checked ? "border-primary bg-primary" : "border-border bg-background",
        disabled && "opacity-50",
      )}
    >
      {checked ? (
        <Check size={14} color={primaryForeground} strokeWidth={3} />
      ) : null}
    </Pressable>
  );
}
