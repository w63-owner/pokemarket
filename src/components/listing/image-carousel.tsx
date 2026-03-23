"use client";

import { useState, useCallback, useRef } from "react";
import Image from "next/image";
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  type PanInfo,
} from "framer-motion";
import { X, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";

interface CarouselImage {
  url: string;
  alt: string;
  hdUrl?: string;
}

interface ImageCarouselProps {
  images: CarouselImage[];
  className?: string;
}

const SWIPE_THRESHOLD = 50;
const SWIPE_VELOCITY = 500;

const BLUR_PLACEHOLDER =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAFCAYAAABirU3bAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAMElEQVQIHWNgYPj/n4EBCBgZGf8zMDL+Z2Bg+M/IyPSfgYHhP8P//wwMDEz/GRgAH+oIAaHRcUUAAAAASUVORK5CYII=";

export function ImageCarousel({ images, className }: ImageCarouselProps) {
  const prefersReducedMotion = useReducedMotion();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [zoomedImage, setZoomedImage] = useState<CarouselImage | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const paginate = useCallback(
    (newDirection: number) => {
      const nextIndex = currentIndex + newDirection;
      if (nextIndex < 0 || nextIndex >= images.length) return;
      setDirection(newDirection);
      setCurrentIndex(nextIndex);
    },
    [currentIndex, images.length],
  );

  const handleDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const { offset, velocity } = info;
      if (offset.x < -SWIPE_THRESHOLD || velocity.x < -SWIPE_VELOCITY) {
        paginate(1);
      } else if (offset.x > SWIPE_THRESHOLD || velocity.x > SWIPE_VELOCITY) {
        paginate(-1);
      }
    },
    [paginate],
  );

  const handleZoom = useCallback((image: CarouselImage) => {
    setZoomedImage(image);
  }, []);

  if (images.length === 0) {
    return (
      <div
        className={cn(
          "bg-muted flex aspect-square items-center justify-center rounded-2xl",
          className,
        )}
      >
        <p className="text-muted-foreground text-sm">Aucune image</p>
      </div>
    );
  }

  const slideVariants = prefersReducedMotion
    ? {
        enter: { opacity: 0 },
        center: { opacity: 1 },
        exit: { opacity: 0 },
      }
    : {
        enter: (dir: number) => ({
          x: dir > 0 ? "100%" : "-100%",
          opacity: 0,
        }),
        center: { x: 0, opacity: 1 },
        exit: (dir: number) => ({
          x: dir > 0 ? "-100%" : "100%",
          opacity: 0,
        }),
      };

  return (
    <>
      <div
        ref={containerRef}
        className={cn(
          "bg-muted relative overflow-hidden rounded-2xl",
          className,
        )}
      >
        <div className="relative aspect-square">
          <AnimatePresence initial={false} custom={direction} mode="popLayout">
            <motion.div
              key={currentIndex}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                x: { type: "spring", stiffness: 300, damping: 30 },
                opacity: { duration: 0.2 },
              }}
              drag={images.length > 1 ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.12}
              onDragEnd={handleDragEnd}
              className="absolute inset-0 cursor-grab active:cursor-grabbing"
            >
              <Image
                src={images[currentIndex].url}
                alt={images[currentIndex].alt}
                fill
                sizes="(max-width: 639px) 100vw, (max-width: 1023px) 60vw, 500px"
                className="pointer-events-none object-contain select-none"
                placeholder="blur"
                blurDataURL={BLUR_PLACEHOLDER}
                priority={currentIndex === 0}
              />
            </motion.div>
          </AnimatePresence>

          {/* Zoom button */}
          <button
            type="button"
            onClick={() => handleZoom(images[currentIndex])}
            className="absolute right-3 bottom-3 z-10 flex size-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
            aria-label="Voir en grand"
          >
            <ZoomIn className="size-4" />
          </button>
        </div>

        {/* Dot indicators */}
        {images.length > 1 && (
          <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setDirection(i > currentIndex ? 1 : -1);
                  setCurrentIndex(i);
                }}
                className={cn(
                  "size-2 rounded-full transition-all duration-200",
                  i === currentIndex
                    ? "w-5 bg-white"
                    : "bg-white/50 hover:bg-white/75",
                )}
                aria-label={`Image ${i + 1}`}
                aria-current={i === currentIndex ? "true" : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* Fullscreen zoom overlay */}
      <AnimatePresence>
        {zoomedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
            onClick={() => setZoomedImage(null)}
          >
            <button
              type="button"
              onClick={() => setZoomedImage(null)}
              className="absolute top-4 right-4 z-10 flex size-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
              aria-label="Fermer"
            >
              <X className="size-5" />
            </button>

            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="relative h-[85vh] w-[90vw] max-w-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              <Image
                src={zoomedImage.hdUrl || zoomedImage.url}
                alt={zoomedImage.alt}
                fill
                sizes="90vw"
                className="object-contain"
                quality={95}
                priority
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
