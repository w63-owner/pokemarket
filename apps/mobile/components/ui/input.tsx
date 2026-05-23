import { forwardRef } from "react";
import { TextInput, type TextInputProps } from "react-native";
import { cn } from "@/lib/cn";
import { useThemeColor } from "@/lib/theme-colors";

export type InputProps = TextInputProps & {
  error?: boolean;
};

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { className, error, placeholderTextColor, ...rest },
  ref,
) {
  const mutedForeground = useThemeColor("mutedForeground");
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={placeholderTextColor ?? mutedForeground}
      className={cn(
        "h-12 rounded-xl border border-border bg-background px-4 text-base text-foreground",
        error && "border-destructive",
        className as string,
      )}
      {...rest}
    />
  );
});
