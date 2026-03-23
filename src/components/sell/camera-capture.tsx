"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, SwitchCamera, Aperture } from "lucide-react";

import { CameraOverlay, getOverlayCropRatios } from "./camera-overlay";
import { cn } from "@/lib/utils";

type FacingMode = "environment" | "user";

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onClose: () => void;
}

const WEBP_QUALITY = 0.92;

/**
 * Crop the camera frame to the overlay cutout region, producing a File.
 *
 * 1. Compute the cutout ratios from the visible <video> element dimensions.
 * 2. Map those ratios to the intrinsic video resolution (may be 12MP+).
 * 3. Draw only that portion onto an offscreen canvas.
 * 4. Export as WebP blob → File.
 */
function cropToOverlay(video: HTMLVideoElement): Promise<File> {
  return new Promise((resolve, reject) => {
    const displayW = video.clientWidth;
    const displayH = video.clientHeight;

    const intrinsicW = video.videoWidth;
    const intrinsicH = video.videoHeight;

    if (!intrinsicW || !intrinsicH) {
      reject(new Error("Video intrinsic size unavailable"));
      return;
    }

    const crop = getOverlayCropRatios(displayW, displayH);

    // The <video> uses object-fit:cover — the video is scaled and cropped
    // to fill the container. We need to account for that mapping.
    const videoAspect = intrinsicW / intrinsicH;
    const containerAspect = displayW / displayH;

    let srcX: number, srcY: number, srcW: number, srcH: number;

    if (videoAspect > containerAspect) {
      // Video is wider than container → horizontal crop (pillarbox)
      const visibleW = intrinsicH * containerAspect;
      const offsetX = (intrinsicW - visibleW) / 2;
      srcX = offsetX + crop.x * visibleW;
      srcY = crop.y * intrinsicH;
      srcW = crop.width * visibleW;
      srcH = crop.height * intrinsicH;
    } else {
      // Video is taller than container → vertical crop (letterbox)
      const visibleH = intrinsicW / containerAspect;
      const offsetY = (intrinsicH - visibleH) / 2;
      srcX = crop.x * intrinsicW;
      srcY = offsetY + crop.y * visibleH;
      srcW = crop.width * intrinsicW;
      srcH = crop.height * visibleH;
    }

    // Clamp to valid bounds
    srcX = Math.max(0, Math.round(srcX));
    srcY = Math.max(0, Math.round(srcY));
    srcW = Math.min(Math.round(srcW), intrinsicW - srcX);
    srcH = Math.min(Math.round(srcH), intrinsicH - srcY);

    const canvas = document.createElement("canvas");
    canvas.width = srcW;
    canvas.height = srcH;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("Canvas context unavailable"));
      return;
    }

    ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("toBlob failed"));
          return;
        }
        const file = new File([blob], `card-${Date.now()}.webp`, {
          type: "image/webp",
        });
        resolve(file);
      },
      "image/webp",
      WEBP_QUALITY,
    );
  });
}

export function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [facingMode, setFacingMode] = useState<FacingMode>("environment");
  const [isReady, setIsReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(
    async (facing: FacingMode) => {
      stopStream();
      setIsReady(false);
      setError(null);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 3840 },
            height: { ideal: 2160 },
          },
          audio: false,
        });

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setIsReady(true);
        }
      } catch (err) {
        console.error("Camera access failed:", err);
        setError("Impossible d'accéder à la caméra. Vérifiez les permissions.");
      }
    },
    [stopStream],
  );

  useEffect(() => {
    startCamera(facingMode);
    return stopStream;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFlip = useCallback(() => {
    const next: FacingMode =
      facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    startCamera(next);
  }, [facingMode, startCamera]);

  const handleCapture = useCallback(async () => {
    if (!videoRef.current || isCapturing) return;

    setIsCapturing(true);
    try {
      const file = await cropToOverlay(videoRef.current);
      onCapture(file);
    } catch (err) {
      console.error("Capture failed:", err);
      setError("Échec de la capture. Veuillez réessayer.");
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, onCapture]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopStream();
  }, [stopStream]);

  return (
    <AnimatePresence>
      <motion.div
        className="bg-background fixed inset-0 z-50 flex flex-col"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
      >
        {/* Video area */}
        <div className="relative flex-1 overflow-hidden bg-black">
          <video
            ref={videoRef}
            className={cn(
              "absolute inset-0 h-full w-full object-cover transition-opacity duration-300",
              facingMode === "user" && "-scale-x-100",
              isReady ? "opacity-100" : "opacity-0",
            )}
            autoPlay
            playsInline
            muted
          />

          {isReady && <CameraOverlay />}

          {/* Error state */}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 px-6">
              <p className="text-center text-sm text-white/80">{error}</p>
            </div>
          )}
        </div>

        {/* Controls bar */}
        <div className="safe-area-bottom bg-black px-6 py-5">
          <div className="mx-auto flex max-w-sm items-center justify-between">
            {/* Close */}
            <motion.button
              type="button"
              onClick={() => {
                stopStream();
                onClose();
              }}
              className="flex size-12 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.9 }}
              aria-label="Fermer la caméra"
            >
              <X className="size-5" />
            </motion.button>

            {/* Shutter */}
            <motion.button
              type="button"
              onClick={handleCapture}
              disabled={!isReady || isCapturing}
              className={cn(
                "flex size-[72px] items-center justify-center rounded-full border-[3px] border-white transition-colors",
                isReady && !isCapturing
                  ? "bg-white/90 active:bg-white"
                  : "bg-white/30",
              )}
              whileTap={isReady && !isCapturing ? { scale: 0.85 } : undefined}
              aria-label="Prendre la photo"
            >
              <Aperture
                className={cn(
                  "size-8",
                  isCapturing ? "animate-spin text-black/40" : "text-black/70",
                )}
              />
            </motion.button>

            {/* Flip camera */}
            <motion.button
              type="button"
              onClick={handleFlip}
              className="flex size-12 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.9 }}
              aria-label="Changer de caméra"
            >
              <SwitchCamera className="size-5" />
            </motion.button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
