import { createContext, useContext } from "react";
import { Pressable, View } from "react-native";
import { cn } from "@/lib/cn";

type RadioContextValue = {
  value: string;
  onValueChange: (next: string) => void;
};

const RadioContext = createContext<RadioContextValue | null>(null);

export function RadioGroup({
  value,
  onValueChange,
  children,
  className,
}: {
  value: string;
  onValueChange: (next: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <RadioContext.Provider value={{ value, onValueChange }}>
      <View className={cn("gap-2", className)}>{children}</View>
    </RadioContext.Provider>
  );
}

export function RadioGroupItem({
  value,
  children,
}: {
  value: string;
  children?: React.ReactNode;
}) {
  const ctx = useContext(RadioContext);
  if (!ctx) throw new Error("RadioGroupItem must be inside RadioGroup");
  const selected = ctx.value === value;
  return (
    <Pressable
      onPress={() => ctx.onValueChange(value)}
      className="flex-row items-center gap-3"
    >
      <View
        className={cn(
          "h-5 w-5 items-center justify-center rounded-full border",
          selected ? "border-primary" : "border-border",
        )}
      >
        {selected ? (
          <View className="h-2.5 w-2.5 rounded-full bg-primary" />
        ) : null}
      </View>
      {children}
    </Pressable>
  );
}
