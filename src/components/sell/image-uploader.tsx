"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Trash2, Loader2, FolderOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CameraCapture } from "./camera-capture";

interface ImageSlotState {
  file: File | null;
  previewUrl: string | null;
  publicUrl: string | null;
  storagePath: string | null;
  uploading: boolean;
  progress: number;
}

const INITIAL_SLOT: ImageSlotState = {
  file: null,
  previewUrl: null,
  publicUrl: null,
  storagePath: null,
  uploading: false,
  progress: 0,
};

interface ImageUploaderProps {
  onImagesChange?: (images: {
    coverUrl: string | null;
    backUrl: string | null;
  }) => void;
  initialCoverUrl?: string | null;
  initialBackUrl?: string | null;
}

const MAX_DIMENSION = 1200;
const WEBP_QUALITY = 0.8;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB before compression

async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Impossible de créer le contexte Canvas"));
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, width, height);

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

function ImageSlot({
  label,
  slot,
  onSelect,
  onRemove,
  onOpenCamera,
  disabled,
}: {
  label: string;
  slot: ImageSlotState;
  onSelect: (file: File) => void;
  onRemove: () => void;
  onOpenCamera: () => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFileChange = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;

      if (!ACCEPTED_TYPES.includes(file.type)) {
        toast.error("Format non supporté. Utilisez JPG, PNG ou WebP.");
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error("L'image est trop volumineuse (max 20 Mo).");
        return;
      }

      onSelect(file);
    },
    [onSelect],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (disabled || slot.uploading) return;
      handleFileChange(e.dataTransfer.files);
    },
    [disabled, slot.uploading, handleFileChange],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled && !slot.uploading) setIsDragOver(true);
    },
    [disabled, slot.uploading],
  );

  const handleDragLeave = useCallback(() => setIsDragOver(false), []);

  const hasImage = slot.previewUrl || slot.publicUrl;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-foreground text-sm font-medium">{label}</span>

      <motion.div
        className={cn(
          "relative aspect-[3/4] w-full overflow-hidden rounded-xl border-2 border-dashed transition-colors",
          hasImage
            ? "border-transparent"
            : isDragOver
              ? "border-brand bg-brand/5"
              : "border-muted-foreground/25 hover:border-brand/50 hover:bg-muted/50",
          disabled && "pointer-events-none opacity-50",
        )}
        whileHover={!hasImage && !disabled ? { scale: 1.02 } : undefined}
        whileTap={!hasImage && !disabled ? { scale: 0.98 } : undefined}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <AnimatePresence mode="wait">
          {slot.uploading ? (
            <motion.div
              key="uploading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex h-full flex-col items-center justify-center gap-3"
            >
              <div className="relative size-14">
                <svg
                  className="size-14 -rotate-90"
                  viewBox="0 0 56 56"
                  fill="none"
                >
                  <circle
                    cx="28"
                    cy="28"
                    r="24"
                    stroke="currentColor"
                    strokeWidth="4"
                    className="text-muted"
                  />
                  <circle
                    cx="28"
                    cy="28"
                    r="24"
                    stroke="currentColor"
                    strokeWidth="4"
                    strokeLinecap="round"
                    className="text-brand transition-all duration-300"
                    strokeDasharray={2 * Math.PI * 24}
                    strokeDashoffset={
                      2 * Math.PI * 24 * (1 - slot.progress / 100)
                    }
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="text-brand size-5 animate-spin" />
                </div>
              </div>
              <span className="text-muted-foreground text-xs font-medium">
                Compression & upload…
              </span>
            </motion.div>
          ) : hasImage ? (
            <motion.div
              key="preview"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="group relative h-full w-full"
            >
              <Image
                src={slot.previewUrl || slot.publicUrl!}
                alt={label}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 45vw, 300px"
                unoptimized={!!slot.previewUrl}
              />

              <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/30" />

              <motion.button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                aria-label={`Supprimer ${label.toLowerCase()}`}
              >
                <Trash2 className="size-4" />
              </motion.button>

              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
              >
                Remplacer
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex h-full w-full flex-col items-center justify-center gap-2 p-4"
            >
              <motion.button
                type="button"
                onClick={onOpenCamera}
                className={cn(
                  "flex size-14 items-center justify-center rounded-2xl transition-colors",
                  "bg-brand/10 text-brand hover:bg-brand/20",
                )}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                aria-label="Ouvrir la caméra"
              >
                <Camera className="size-7" />
              </motion.button>

              <p className="text-foreground text-sm font-medium">
                Prendre en photo
              </p>

              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="text-muted-foreground hover:text-foreground mt-1 flex items-center gap-1.5 text-xs transition-colors"
              >
                <FolderOpen className="size-3.5" />
                Choisir un fichier
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          className="hidden"
          onChange={(e) => {
            handleFileChange(e.target.files);
            e.target.value = "";
          }}
          disabled={disabled || slot.uploading}
        />
      </motion.div>
    </div>
  );
}

type CameraTarget = "cover" | "back" | null;

export function ImageUploader({
  onImagesChange,
  initialCoverUrl,
  initialBackUrl,
}: ImageUploaderProps) {
  const { user } = useAuth();
  const supabase = createClient();

  const [cover, setCover] = useState<ImageSlotState>(
    initialCoverUrl
      ? { ...INITIAL_SLOT, publicUrl: initialCoverUrl }
      : { ...INITIAL_SLOT },
  );
  const [back, setBack] = useState<ImageSlotState>(
    initialBackUrl
      ? { ...INITIAL_SLOT, publicUrl: initialBackUrl }
      : { ...INITIAL_SLOT },
  );

  const [cameraTarget, setCameraTarget] = useState<CameraTarget>(null);

  const notifyParent = useCallback(
    (nextCover: ImageSlotState | null, nextBack: ImageSlotState | null) => {
      const c = nextCover ?? cover;
      const b = nextBack ?? back;
      onImagesChange?.({
        coverUrl: c.publicUrl,
        backUrl: b.publicUrl,
      });
    },
    [cover, back, onImagesChange],
  );

  const uploadImage = useCallback(
    async (
      file: File,
      setter: React.Dispatch<React.SetStateAction<ImageSlotState>>,
      currentSlot: ImageSlotState,
      iscover: boolean,
    ) => {
      if (!user) {
        toast.error("Vous devez être connecté pour uploader une image.");
        return;
      }

      const previewUrl = URL.createObjectURL(file);

      setter((prev) => ({
        ...prev,
        file,
        previewUrl,
        uploading: true,
        progress: 10,
      }));

      try {
        setter((prev) => ({ ...prev, progress: 30 }));

        const compressed = await compressImage(file);

        setter((prev) => ({ ...prev, progress: 60 }));

        if (currentSlot.storagePath) {
          await supabase.storage
            .from("listing-images")
            .remove([currentSlot.storagePath]);
        }

        const fileName = `${user.id}/${crypto.randomUUID()}.webp`;

        const { error: uploadError } = await supabase.storage
          .from("listing-images")
          .upload(fileName, compressed, {
            contentType: "image/webp",
            cacheControl: "31536000",
            upsert: false,
          });

        if (uploadError) throw uploadError;

        setter((prev) => ({ ...prev, progress: 90 }));

        const {
          data: { publicUrl },
        } = supabase.storage.from("listing-images").getPublicUrl(fileName);

        const newState: ImageSlotState = {
          file,
          previewUrl,
          publicUrl,
          storagePath: fileName,
          uploading: false,
          progress: 100,
        };

        setter(newState);

        if (iscover) {
          notifyParent(newState, null);
        } else {
          notifyParent(null, newState);
        }

        toast.success("Image uploadée !");
      } catch (err) {
        console.error("Upload failed:", err);
        URL.revokeObjectURL(previewUrl);
        setter((prev) => ({
          ...prev,
          previewUrl: prev.publicUrl ? prev.previewUrl : null,
          uploading: false,
          progress: 0,
        }));
        toast.error("Échec de l'upload. Veuillez réessayer.");
      }
    },
    [user, supabase, notifyParent],
  );

  const removeImage = useCallback(
    async (
      setter: React.Dispatch<React.SetStateAction<ImageSlotState>>,
      currentSlot: ImageSlotState,
      isCover: boolean,
    ) => {
      if (currentSlot.storagePath) {
        await supabase.storage
          .from("listing-images")
          .remove([currentSlot.storagePath]);
      }

      if (currentSlot.previewUrl) {
        URL.revokeObjectURL(currentSlot.previewUrl);
      }

      const newState = { ...INITIAL_SLOT };
      setter(newState);

      if (isCover) {
        notifyParent(newState, null);
      } else {
        notifyParent(null, newState);
      }
    },
    [supabase, notifyParent],
  );

  const handleCameraCapture = useCallback(
    (file: File) => {
      if (cameraTarget === "cover") {
        uploadImage(file, setCover, cover, true);
      } else if (cameraTarget === "back") {
        uploadImage(file, setBack, back, false);
      }
      setCameraTarget(null);
    },
    [cameraTarget, cover, back, uploadImage],
  );

  const isUploading = cover.uploading || back.uploading;

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-foreground text-base font-semibold">
            Photos de la carte
          </h3>
          <span className="text-muted-foreground text-xs">
            Recto & verso obligatoires
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <ImageSlot
            label="Recto"
            slot={cover}
            disabled={isUploading && !cover.uploading}
            onSelect={(file) => uploadImage(file, setCover, cover, true)}
            onRemove={() => removeImage(setCover, cover, true)}
            onOpenCamera={() => setCameraTarget("cover")}
          />
          <ImageSlot
            label="Verso"
            slot={back}
            disabled={isUploading && !back.uploading}
            onSelect={(file) => uploadImage(file, setBack, back, false)}
            onRemove={() => removeImage(setBack, back, false)}
            onOpenCamera={() => setCameraTarget("back")}
          />
        </div>
      </div>

      {/* Fullscreen camera with overlay & auto-crop */}
      <AnimatePresence>
        {cameraTarget && (
          <CameraCapture
            key="camera"
            onCapture={handleCameraCapture}
            onClose={() => setCameraTarget(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
