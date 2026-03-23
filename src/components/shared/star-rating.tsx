"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  rating: number;
  maxRating?: number;
  size?: "sm" | "md" | "lg";
  interactive?: boolean;
  onChange?: (rating: number) => void;
  className?: string;
}

const sizeMap = {
  sm: "size-3.5",
  md: "size-4",
  lg: "size-5",
};

export function StarRating({
  rating,
  maxRating = 5,
  size = "md",
  interactive = false,
  onChange,
  className,
}: StarRatingProps) {
  const iconSize = sizeMap[size];

  return (
    <div
      className={cn("inline-flex items-center gap-0.5", className)}
      role={interactive ? "radiogroup" : "img"}
      aria-label={
        interactive ? "Donner une note" : `Note : ${rating} sur ${maxRating}`
      }
    >
      {Array.from({ length: maxRating }, (_, i) => {
        const starIndex = i + 1;
        const fill = Math.min(Math.max(rating - i, 0), 1);

        return (
          <button
            key={starIndex}
            type="button"
            disabled={!interactive}
            onClick={() => interactive && onChange?.(starIndex)}
            className={cn(
              "relative shrink-0 p-0",
              interactive
                ? "cursor-pointer transition-transform hover:scale-110 active:scale-95"
                : "cursor-default",
            )}
            aria-label={
              interactive
                ? `${starIndex} étoile${starIndex > 1 ? "s" : ""}`
                : undefined
            }
            tabIndex={interactive ? 0 : -1}
          >
            <Star
              className={cn(iconSize, "text-muted-foreground/30")}
              strokeWidth={1.5}
            />

            <div
              className="absolute inset-0 overflow-hidden"
              style={{ width: `${fill * 100}%` }}
            >
              <Star
                className={cn(iconSize, "fill-brand-accent text-brand-accent")}
                strokeWidth={1.5}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}
