"use client";

import { useState, useCallback, useRef } from "react";
import Image from "next/image";
import {
  m,
  AnimatePresence,
  useReducedMotion,
  type PanInfo,
} from "framer-motion";
import { X, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

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
          "bg-muted flex aspect-[63/88] items-center justify-center rounded-2xl",
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
        <div className="relative aspect-[63/88]">
          <AnimatePresence initial={false} custom={direction} mode="popLayout">
            <m.div
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
            </m.div>
          </AnimatePresence>

          {/* Zoom button */}
          <button
            type="button"
            onClick={() => handleZoom(images[currentIndex])}
            className="absolute right-3 bottom-3 z-10 flex size-11 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-black/70 focus-visible:ring-3 focus-visible:ring-white/70 focus-visible:outline-none"
            aria-label="Voir en grand"
          >
            <ZoomIn className="size-5" aria-hidden="true" />
          </button>
        </div>

        {/* Dot indicators */}
        {images.length > 1 && (
          <div className="absolute bottom-1 left-1/2 z-10 flex -translate-x-1/2">
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setDirection(i > currentIndex ? 1 : -1);
                  setCurrentIndex(i);
                }}
                className={cn(
                  "group flex size-11 items-center justify-center rounded-full focus-visible:ring-3 focus-visible:ring-white/70 focus-visible:outline-none",
                )}
                aria-label={`Afficher l’image ${i + 1} sur ${images.length}`}
                aria-pressed={i === currentIndex}
              >
                <span
                  className={cn(
                    "h-2 rounded-full shadow-sm transition-all duration-200",
                    i === currentIndex
                      ? "w-5 bg-white"
                      : "w-2 bg-white/55 group-hover:bg-white/80",
                  )}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={zoomedImage !== null}
        onOpenChange={(open) => {
          if (!open) setZoomedImage(null);
        }}
      >
        {zoomedImage && (
          <DialogContent
            showCloseButton={false}
            className="h-dvh w-screen max-w-none place-items-center rounded-none border-0 bg-black/95 p-4 ring-0 sm:max-w-none"
          >
            <DialogTitle className="sr-only">Aperçu de l’image</DialogTitle>
            <DialogDescription className="sr-only">
              Image agrandie. Appuyez sur Échap ou utilisez le bouton fermer
              pour revenir à l’annonce.
            </DialogDescription>
            <DialogClose
              render={
                <button
                  type="button"
                  className="absolute top-4 right-4 z-10 flex size-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20 focus-visible:ring-3 focus-visible:ring-white/70 focus-visible:outline-none"
                  aria-label="Fermer l’aperçu"
                />
              }
            >
              <X className="size-5" aria-hidden="true" />
            </DialogClose>

            <m.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="relative h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-4xl"
            >
              <Image
                src={zoomedImage.hdUrl || zoomedImage.url}
                alt={zoomedImage.alt}
                fill
                sizes="100vw"
                className="object-contain"
                quality={95}
                priority
              />
            </m.div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
