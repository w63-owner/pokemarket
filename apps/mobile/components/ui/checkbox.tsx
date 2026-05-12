import { Pressable, View } from "react-native";
import { Check } from "lucide-react-native";
import { cn } from "@/lib/cn";

type Props = {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
};

export function Checkbox({ checked, onCheckedChange, disabled }: Props) {
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
      {checked ? <Check size={14} color="#fff" strokeWidth={3} /> : null}
    </Pressable>
  );
}
