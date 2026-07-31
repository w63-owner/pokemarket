"use client";

import { memo } from "react";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { m, useReducedMotion } from "framer-motion";
import { useInView } from "react-intersection-observer";
import {
  AlertCircle,
  Check,
  CheckCheck,
  Clock,
  Copy,
  Flag,
  ImageOff,
  Reply,
} from "lucide-react";
import { formatTime, queryKeys } from "@pokemarket/shared";
import { cn } from "@/lib/utils";
import { getMessageAttachmentSignedUrl } from "@/lib/api/conversations";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { Message } from "@/types";
import { getReplySnapshot } from "./message-thread-utils";

const BLUR_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjEwIj48cmVjdCB3aWR0aD0iOCIGaGVpZ2h0PSIxMCIgZmlsbD0iI2UyZThmMCIvPjwvc3ZnPg==";

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  isPending?: boolean;
  isFailed?: boolean;
  isGroupStart?: boolean;
  isLastInGroup?: boolean;
  currentUserId: string;
  otherUsername: string;
  onVisible?: (messageId: string) => void;
  onRetry?: (message: Message) => void;
  onReply?: (message: Message) => void;
  onCopy?: (message: Message) => void;
  onReport?: (message: Message) => void;
}

function ImageMessageContent({ storagePath }: { storagePath: string }) {
  const { data: signedUrl, isLoading } = useQuery({
    queryKey: queryKeys.conversations.messageAttachment(storagePath),
    queryFn: () => getMessageAttachmentSignedUrl(storagePath),
    enabled: !!storagePath,
    staleTime: 50 * 60 * 1000,
  });

  if (isLoading) {
    return <Skeleton className="h-64 w-52 rounded-xl" />;
  }

  if (!signedUrl) {
    return (
      <div className="text-muted-foreground flex h-64 w-52 flex-col items-center justify-center gap-2 rounded-xl bg-black/5">
        <ImageOff className="size-7" />
        <span className="text-xs">Image indisponible</span>
      </div>
    );
  }

  return (
    <Dialog>
      <DialogTrigger
        className="relative block h-64 w-52 overflow-hidden rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2"
        aria-label="Ouvrir l'image en plein écran"
      >
        <Image
          src={signedUrl}
          alt="Image envoyée dans la conversation"
          fill
          sizes="208px"
          className="object-cover"
          placeholder="blur"
          blurDataURL={BLUR_DATA_URL}
        />
      </DialogTrigger>
      <DialogContent className="h-[90dvh] max-w-[min(95vw,64rem)] bg-black/95 p-2 sm:max-w-[min(95vw,64rem)]">
        <DialogTitle className="sr-only">Image du message</DialogTitle>
        <DialogDescription className="sr-only">
          Aperçu agrandi de l&apos;image envoyée
        </DialogDescription>
        <div className="relative min-h-0 w-full">
          <Image
            src={signedUrl}
            alt="Image envoyée dans la conversation, vue agrandie"
            fill
            sizes="95vw"
            className="object-contain"
            placeholder="blur"
            blurDataURL={BLUR_DATA_URL}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export const MessageBubble = memo(function MessageBubble({
  message,
  isOwn,
  isPending,
  isFailed,
  isGroupStart = true,
  isLastInGroup = true,
  currentUserId,
  otherUsername,
  onVisible,
  onRetry,
  onReply,
  onCopy,
  onReport,
}: MessageBubbleProps) {
  const prefersReducedMotion = useReducedMotion();
  const isImage = message.message_type === "image";
  const reply = getReplySnapshot(message);
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
      layout={prefersReducedMotion ? false : "position"}
      initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: isPending ? 0.6 : 1, y: 0 }}
      transition={
        prefersReducedMotion
          ? { duration: 0 }
          : { type: "spring", stiffness: 500, damping: 40 }
      }
      className={cn(
        "group flex w-full items-center gap-1",
        isGroupStart ? "mt-2" : "mt-0",
        isOwn ? "justify-end" : "justify-start",
      )}
    >
      {!isOwn && (
        <div className="flex transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onReply?.(message)}
            aria-label="Répondre à ce message"
          >
            <Reply className="size-3.5" />
          </Button>
          {!isImage && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onCopy?.(message)}
              aria-label="Copier ce message"
            >
              <Copy className="size-3.5" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onReport?.(message)}
            aria-label="Signaler ce message"
          >
            <Flag className="size-3.5" />
          </Button>
        </div>
      )}

      <div
        role={isFailed ? "button" : undefined}
        tabIndex={isFailed ? 0 : undefined}
        onClick={isFailed ? () => onRetry?.(message) : undefined}
        onKeyDown={
          isFailed
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onRetry?.(message);
                }
              }
            : undefined
        }
        aria-label={
          isFailed
            ? "Échec de l'envoi. Activer pour réessayer."
            : `Message de ${isOwn ? "vous" : otherUsername}`
        }
        className={cn(
          "relative max-w-[80%] rounded-2xl text-sm shadow-sm",
          isImage ? "p-1.5" : "px-3.5 py-2",
          isFailed && "cursor-pointer ring-2 ring-red-400/70",
          isOwn
            ? cn(
                "bg-brand text-brand-foreground",
                isLastInGroup && "rounded-br-md",
              )
            : cn("bg-muted text-foreground", isLastInGroup && "rounded-bl-md"),
        )}
      >
        {reply && (
          <div
            className={cn(
              "mb-1.5 rounded-lg border-l-2 px-2.5 py-1.5",
              isOwn
                ? "border-brand-foreground/60 bg-black/10"
                : "border-brand bg-background/60",
            )}
          >
            <p className="text-[11px] font-semibold">
              {reply.sender_id === currentUserId ? "Vous" : otherUsername}
            </p>
            <p className="max-w-56 truncate text-[11px] opacity-75">
              {reply.message_type === "image" ? "Photo" : reply.content}
            </p>
          </div>
        )}

        {isImage && message.content ? (
          <ImageMessageContent storagePath={message.content} />
        ) : (
          <p className="leading-relaxed break-words whitespace-pre-wrap">
            {message.content}
          </p>
        )}

        {isLastInGroup && (
          <div
            className={cn(
              "mt-0.5 flex items-center justify-end gap-1",
              isOwn ? "text-brand-foreground/60" : "text-muted-foreground/60",
            )}
          >
            <span className="text-[10px] leading-none">
              {formatTime(message.created_at ?? "")}
            </span>
            {isOwn &&
              (isFailed ? (
                <AlertCircle className="size-3" />
              ) : isPending ? (
                <Clock className="size-3" />
              ) : message.read_at ? (
                <CheckCheck className="text-brand-foreground/80 size-3" />
              ) : (
                <Check className="size-3" />
              ))}
          </div>
        )}

        {isFailed && (
          <p className="mt-1 text-right text-[10px]">
            Échec · cliquer pour réessayer
          </p>
        )}
      </div>

      {isOwn && (
        <div className="flex transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
          {!isFailed && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onReply?.(message)}
              aria-label="Répondre à ce message"
            >
              <Reply className="size-3.5" />
            </Button>
          )}
          {!isImage && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onCopy?.(message)}
              aria-label="Copier ce message"
            >
              <Copy className="size-3.5" />
            </Button>
          )}
        </div>
      )}
    </m.div>
  );
});
