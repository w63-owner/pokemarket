import { forwardRef } from "react";
import { TextInput, type TextInputProps } from "react-native";
import { cn } from "@/lib/cn";

export type TextareaProps = TextInputProps & {
  error?: boolean;
};

export const Textarea = forwardRef<TextInput, TextareaProps>(function Textarea(
  { className, error, ...rest },
  ref,
) {
  return (
    <TextInput
      ref={ref}
      multiline
      textAlignVertical="top"
      placeholderTextColor="#94a3b8"
      className={cn(
        "min-h-24 rounded-xl border border-border bg-background p-4 text-base text-foreground",
        error && "border-destructive",
        className as string,
      )}
      {...rest}
    />
  );
});
