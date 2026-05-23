import { useState } from "react";
import { Pressable, ScrollView } from "react-native";
import { ChevronDown, Check } from "lucide-react-native";
import { Sheet } from "./sheet";
import { Text } from "./text";
import { cn } from "@/lib/cn";
import { useThemeColor } from "@/lib/theme-colors";

export type SelectOption = { value: string; label: string };

type Props = {
  value?: string | null;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

export function Select({
  value,
  onValueChange,
  options,
  placeholder = "Sélectionner",
  disabled,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  const mutedForeground = useThemeColor("mutedForeground");
  const primary = useThemeColor("primary");

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        className={cn(
          "h-12 flex-row items-center justify-between rounded-xl border border-border bg-background px-4",
          disabled && "opacity-50",
          className,
        )}
      >
        <Text
          className={cn(selected ? "text-foreground" : "text-muted-foreground")}
        >
          {selected?.label ?? placeholder}
        </Text>
        <ChevronDown size={16} color={mutedForeground} />
      </Pressable>

      <Sheet open={open} onOpenChange={setOpen}>
        <ScrollView style={{ maxHeight: 380 }}>
          {options.map((opt) => {
            const isActive = opt.value === value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => {
                  onValueChange(opt.value);
                  setOpen(false);
                }}
                className="flex-row items-center justify-between py-3"
              >
                <Text className={isActive ? "font-semibold" : ""}>
                  {opt.label}
                </Text>
                {isActive ? <Check size={18} color={primary} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </Sheet>
    </>
  );
}
