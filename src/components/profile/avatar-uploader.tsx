"use client";

import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";

const AVATAR_MAX_DIM = 512;
const WEBP_QUALITY = 0.85;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function cropAndCompress(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const size = Math.min(img.width, img.height);
      const sx = (img.width - size) / 2;
      const sy = (img.height - size) / 2;

      const dim = Math.min(size, AVATAR_MAX_DIM);

      const canvas = document.createElement("canvas");
      canvas.width = dim;
      canvas.height = dim;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Impossible de créer le contexte Canvas"));
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, sx, sy, size, size, 0, 0, dim, dim);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Échec de la conversion WebP"));
            return;
          }
          resolve(blob);
        },
        "image/webp",
        WEBP_QUALITY,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Impossible de lire l'image"));
    };

    img.src = url;
  });
}

interface AvatarUploaderProps {
  currentUrl: string | null | undefined;
  fallback: string;
  onUploaded: (publicUrl: string) => void;
}

export function AvatarUploader({
  currentUrl,
  fallback,
  onUploaded,
}: AvatarUploaderProps) {
  const { user } = useAuth();
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const displayUrl = previewUrl || currentUrl || undefined;

  const handleFile = useCallback(
    async (file: File) => {
      if (!user) {
        toast.error("Vous devez être connecté.");
        return;
      }

      if (!ACCEPTED_TYPES.includes(file.type)) {
        toast.error("Format non supporté. Utilisez JPG, PNG ou WebP.");
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        toast.error("L'image est trop volumineuse (max 10 Mo).");
        return;
      }

      const preview = URL.createObjectURL(file);
      setPreviewUrl(preview);
      setUploading(true);

      try {
        const compressed = await cropAndCompress(file);

        const fileName = `${user.id}/avatar.webp`;

        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(fileName, compressed, {
            contentType: "image/webp",
            cacheControl: "3600",
            upsert: true,
          });

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("avatars").getPublicUrl(fileName);

        const cacheBustedUrl = `${publicUrl}?t=${Date.now()}`;

        onUploaded(cacheBustedUrl);
        toast.success("Photo de profil mise à jour !");
      } catch (err) {
        console.error("Avatar upload failed:", err);
        URL.revokeObjectURL(preview);
        setPreviewUrl(null);
        toast.error("Échec de l'upload. Veuillez réessayer.");
      } finally {
        setUploading(false);
      }
    },
    [user, supabase, onUploaded],
  );

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="group focus-visible:ring-ring relative cursor-pointer rounded-full focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        aria-label="Changer la photo de profil"
      >
        <Avatar className="size-24">
          <AvatarImage src={displayUrl} />
          <AvatarFallback className="text-2xl">{fallback}</AvatarFallback>
        </Avatar>

        <AnimatePresence>
          {uploading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50"
            >
              <Loader2 className="size-8 animate-spin text-white" />
            </motion.div>
          ) : (
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0 }}
              whileHover={{ opacity: 1 }}
              className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 transition-opacity group-hover:opacity-100"
            >
              <Camera className="size-6 text-white" />
            </motion.div>
          )}
        </AnimatePresence>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
        disabled={uploading}
      />
    </div>
  );
}
