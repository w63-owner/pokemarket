import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export {
  formatPrice,
  formatRelativeDate,
  formatDate,
  truncate,
} from "@pokemarket/shared";
