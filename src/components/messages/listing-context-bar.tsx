import Link from "next/link";
import Image from "next/image";
import { ChevronRight } from "lucide-react";
import { formatPrice } from "@/lib/utils";

interface ListingContextBarProps {
  listing: {
    id: string;
    title: string;
    cover_image_url: string | null;
    display_price: number;
    status: string;
  };
}

export function ListingContextBar({ listing }: ListingContextBarProps) {
  return (
    <Link
      href={`/listing/${listing.id}`}
      className="bg-card border-border hover:bg-muted/50 flex items-center gap-2.5 border-b px-3 py-2 transition-colors"
    >
      <div className="border-border size-8 shrink-0 overflow-hidden rounded-sm border">
        {listing.cover_image_url ? (
          <Image
            src={listing.cover_image_url}
            alt={listing.title}
            width={32}
            height={32}
            className="size-full object-cover"
          />
        ) : (
          <div className="bg-muted size-full" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-foreground truncate text-xs font-medium">
          {listing.title}
        </p>
        <p className="text-brand text-xs font-semibold">
          {formatPrice(listing.display_price)}
        </p>
      </div>

      <ChevronRight className="text-muted-foreground size-4 shrink-0" />
    </Link>
  );
}
