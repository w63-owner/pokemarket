import { forwardRef } from "react";
import { TextInput, type TextInputProps } from "react-native";
import { cn } from "@/lib/cn";

export type InputProps = TextInputProps & {
  error?: boolean;
};

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { className, error, ...rest },
  ref,
) {
  return (
    <TextInput
      ref={ref}
      placeholderTextColor="#94a3b8"
      className={cn(
        "h-12 rounded-xl border border-border bg-background px-4 text-base text-foreground",
        error && "border-destructive",
        className as string,
      )}
      {...rest}
    />
  );
});
