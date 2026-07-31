"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type KeyboardEvent,
  type FormEvent,
  type ChangeEvent,
} from "react";
import { m, useReducedMotion } from "framer-motion";
import { Send, ImagePlus, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LIMITS } from "@/lib/constants";
import { toast } from "sonner";
import type { ReplySnapshot } from "./message-thread-utils";

const MAX_SOURCE_SIZE = 20 * 1024 * 1024;
const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;
const MAX_DIMENSION = 1600;
const WEBP_QUALITY = 0.82;

interface MessageInputProps {
  onSend: (content: string, replyTo?: ReplySnapshot | null) => void;
  onSendImage?: (file: File) => Promise<void> | void;
  disabled?: boolean;
  replyingTo?: ReplySnapshot | null;
  onCancelReply?: () => void;
  currentUserId: string;
  otherUsername: string;
}

export async function compressMessageImage(file: File): Promise<File> {
  if (file.size > MAX_SOURCE_SIZE) {
    throw new Error("L'image dépasse la limite de 20 Mo");
  }

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new window.Image();
    const objectUrl = URL.createObjectURL(file);
    element.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(element);
    };
    element.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Ce format d'image n'est pas pris en charge"));
    };
    element.src = objectUrl;
  });

  const ratio = Math.min(
    1,
    MAX_DIMENSION / image.width,
    MAX_DIMENSION / image.height,
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * ratio));
  canvas.height = Math.max(1, Math.round(image.height * ratio));

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Impossible de compresser l'image");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) =>
        result
          ? resolve(result)
          : reject(new Error("Impossible de compresser l'image")),
      "image/webp",
      WEBP_QUALITY,
    );
  });

  if (blob.size > MAX_UPLOAD_SIZE) {
    throw new Error("L'image compressée dépasse la limite de 5 Mo");
  }

  return new File(
    [blob],
    `${file.name.replace(/\.[^.]+$/, "") || "image"}.webp`,
    {
      type: "image/webp",
    },
  );
}

export function MessageInput({
  onSend,
  onSendImage,
  disabled,
  replyingTo,
  onCancelReply,
  currentUserId,
  otherUsername,
}: MessageInputProps) {
  const [value, setValue] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prefersReducedMotion = useReducedMotion();

  const trimmed = value.trim();
  const canSend = trimmed.length > 0 && !disabled && !isUploading;

  useEffect(() => {
    if (replyingTo) textareaRef.current?.focus();
  }, [replyingTo]);

  const handleSend = useCallback(() => {
    if (!canSend) return;
    onSend(trimmed, replyingTo);
    setValue("");
    onCancelReply?.();
    textareaRef.current?.focus();
  }, [canSend, onCancelReply, onSend, replyingTo, trimmed]);

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

  const handleImageChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file || !onSendImage) return;

      setIsUploading(true);
      try {
        await onSendImage(await compressMessageImage(file));
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Impossible d'envoyer l'image",
        );
      } finally {
        setIsUploading(false);
      }
    },
    [onSendImage],
  );

  const replyAuthor =
    replyingTo?.sender_id === currentUserId ? "Vous" : otherUsername;

  return (
    <div className="border-border bg-background/80 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
      {replyingTo && (
        <div className="flex items-center gap-2 px-3 pt-2">
          <div className="border-brand bg-muted/60 min-w-0 flex-1 rounded-lg border-l-2 px-3 py-2">
            <p className="text-brand text-xs font-semibold">{replyAuthor}</p>
            <p className="text-muted-foreground truncate text-xs">
              {replyingTo.message_type === "image"
                ? "Photo"
                : replyingTo.content}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onCancelReply}
            aria-label="Annuler la réponse"
          >
            <X className="size-4" />
          </Button>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="flex items-end gap-2 px-3 py-2"
        aria-label="Composer un message"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={handleImageChange}
          aria-label="Choisir une image"
          tabIndex={-1}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground size-9 shrink-0"
          disabled={disabled || isUploading || !onSendImage}
          onClick={() => fileInputRef.current?.click()}
          aria-label={
            isUploading ? "Envoi de l'image en cours" : "Envoyer une image"
          }
        >
          {isUploading ? (
            <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" />
          ) : (
            <ImagePlus className="size-5" />
          )}
        </Button>

        <label htmlFor="message-composer" className="sr-only">
          Votre message
        </label>
        <textarea
          id="message-composer"
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Votre message..."
          maxLength={LIMITS.MAX_MESSAGE_LENGTH}
          rows={1}
          disabled={disabled || isUploading}
          aria-describedby="message-composer-help"
          className={cn(
            "border-input bg-muted/50 field-sizing-content max-h-20 min-h-[2.25rem] flex-1 resize-none rounded-2xl border px-3.5 py-2 text-sm leading-snug transition-colors outline-none",
            "placeholder:text-muted-foreground/60 focus:border-ring focus:ring-ring/30 focus:ring-1",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        />
        <span id="message-composer-help" className="sr-only">
          Appuyez sur Entrée pour envoyer, Majuscule Entrée pour aller à la
          ligne.
        </span>

        <m.div whileTap={prefersReducedMotion ? undefined : { scale: 0.9 }}>
          <Button
            type="submit"
            size="icon"
            disabled={!canSend}
            className="size-9 shrink-0 rounded-full"
            aria-label="Envoyer le message"
          >
            <Send className="size-4" />
          </Button>
        </m.div>
      </form>
    </div>
  );
}
