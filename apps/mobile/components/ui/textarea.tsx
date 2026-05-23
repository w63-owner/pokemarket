import { forwardRef } from "react";
import { TextInput, type TextInputProps } from "react-native";
import { cn } from "@/lib/cn";
import { useThemeColor } from "@/lib/theme-colors";

export type TextareaProps = TextInputProps & {
  error?: boolean;
};

export const Textarea = forwardRef<TextInput, TextareaProps>(function Textarea(
  { className, error, placeholderTextColor, ...rest },
  ref,
) {
  const mutedForeground = useThemeColor("mutedForeground");
  return (
    <TextInput
      ref={ref}
      multiline
      textAlignVertical="top"
      placeholderTextColor={placeholderTextColor ?? mutedForeground}
      className={cn(
        "min-h-24 rounded-xl border border-border bg-background p-4 text-base text-foreground",
        error && "border-destructive",
        className as string,
      )}
      {...rest}
    />
  );
});
