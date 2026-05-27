import { useState } from "react";
import { Pressable } from "react-native";
import { ChevronDown, Check } from "lucide-react-native";
import { Sheet, SheetScrollView } from "./sheet";
import { Text } from "./text";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";
import { useThemeColor } from "@/lib/theme-colors";

export type SelectOption = { value: string; label: string };

type Props = {
  value?: string | null;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /**
   * Optional header rendered at the top of the picker Sheet. Mirrors the
   * field's `<Label>` so users keep their bearings after the sheet
   * covers the form context. Typically pass the same string as the
   * companion `Label`.
   */
  title?: string;
};

export function Select({
  value,
  onValueChange,
  options,
  placeholder = "Sélectionner",
  disabled,
  className,
  title,
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

      <Sheet open={open} onOpenChange={setOpen} snapPoints={["50%", "75%"]}>
        {title ? (
          <Text variant="h4" className="mb-2 mt-1">
            {title}
          </Text>
        ) : null}
        <SheetScrollView>
          {options.map((opt) => {
            const isActive = opt.value === value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => {
                  haptic("select");
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
        </SheetScrollView>
      </Sheet>
    </>
  );
}
