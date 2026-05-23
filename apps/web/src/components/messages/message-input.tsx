"use client";

import {
  useRef,
  useState,
  useCallback,
  type KeyboardEvent,
  type FormEvent,
} from "react";
import { m } from "framer-motion";
import { Send, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LIMITS } from "@/lib/constants";

interface MessageInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
}

export function MessageInput({ onSend, disabled }: MessageInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const trimmed = value.trim();
  const canSend = trimmed.length > 0 && !disabled;

  const handleSend = useCallback(() => {
    if (!canSend) return;
    onSend(trimmed);
    setValue("");
    textareaRef.current?.focus();
  }, [canSend, trimmed, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      handleSend();
    },
    [handleSend],
  );

  return (
    <div className="border-border bg-background/80 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
      <form onSubmit={handleSubmit} className="flex items-end gap-2 px-3 py-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground size-9 shrink-0"
          disabled={disabled}
          aria-label="Envoyer une image"
        >
          <ImagePlus className="size-5" />
        </Button>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Votre message..."
          maxLength={LIMITS.MAX_MESSAGE_LENGTH}
          rows={1}
          disabled={disabled}
          className={cn(
            "border-input bg-muted/50 field-sizing-content max-h-20 min-h-[2.25rem] flex-1 resize-none rounded-2xl border px-3.5 py-2 text-sm leading-snug transition-colors outline-none",
            "placeholder:text-muted-foreground/60 focus:border-ring focus:ring-ring/30 focus:ring-1",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        />

        <m.div whileTap={{ scale: 0.9 }}>
          <Button
            type="submit"
            size="icon"
            disabled={!canSend}
            className="size-9 shrink-0 rounded-full"
            aria-label="Envoyer"
          >
            <Send className="size-4" />
          </Button>
        </m.div>
      </form>
    </div>
  );
}
