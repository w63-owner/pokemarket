"use client";

import { memo } from "react";
import { m } from "framer-motion";
import { useInView } from "react-intersection-observer";
import { Check, CheckCheck, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Message } from "@/types";

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  isPending?: boolean;
  onVisible?: (messageId: string) => void;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const MessageBubble = memo(function MessageBubble({
  message,
  isOwn,
  isPending,
  onVisible,
}: MessageBubbleProps) {
  const { ref } = useInView({
    threshold: 0.5,
    triggerOnce: true,
    onChange: (inView) => {
      if (inView && !isOwn && !message.read_at) {
        onVisible?.(message.id);
      }
    },
  });

  return (
    <m.div
      ref={ref}
      layout="position"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: isPending ? 0.6 : 1, y: 0 }}
      transition={{ type: "spring", stiffness: 500, damping: 40 }}
      className={cn("flex w-full", isOwn ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "relative max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
          isOwn
            ? "bg-brand text-brand-foreground rounded-br-md"
            : "bg-muted text-foreground rounded-bl-md",
        )}
      >
        <p className="leading-relaxed break-words whitespace-pre-wrap">
          {message.content}
        </p>

        <div
          className={cn(
            "mt-0.5 flex items-center justify-end gap-1",
            isOwn ? "text-brand-foreground/60" : "text-muted-foreground/60",
          )}
        >
          <span className="text-[10px] leading-none">
            {formatTime(message.created_at)}
          </span>
          {isOwn &&
            (isPending ? (
              <Clock className="size-3" />
            ) : message.read_at ? (
              <CheckCheck className="text-brand-foreground/80 size-3" />
            ) : (
              <Check className="size-3" />
            ))}
        </div>
      </div>
    </m.div>
  );
});
