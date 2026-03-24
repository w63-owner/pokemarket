"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { Tag, ChevronRight, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { queryKeys } from "@/lib/query-keys";
import { fetchMyListings } from "@/lib/api/listings";
import { formatPrice, formatRelativeDate } from "@/lib/utils";
import type { Listing } from "@/types";

const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  DRAFT: { label: "Brouillon", variant: "outline" },
  ACTIVE: { label: "En vente", variant: "default" },
  LOCKED: { label: "Verrouillée", variant: "secondary" },
  RESERVED: { label: "Réservée", variant: "secondary" },
  SOLD: { label: "Vendue", variant: "destructive" },
};

function getStatusConfig(status: string) {
  return (
    STATUS_CONFIG[status] ?? { label: status, variant: "outline" as const }
  );
}

export default function MyListingsPage() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.listings.mine(),
    queryFn: () => fetchMyListings(),
  });

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="bg-primary/10 rounded-full p-2.5">
            <Tag className="text-primary size-6" />
          </div>
          <h1 className="font-heading text-2xl font-bold">Mes annonces</h1>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={<Tag className="size-6" />}
            title="Aucune annonce publiée"
            description="Vos annonces apparaîtront ici une fois que vous aurez mis une carte en vente."
            action={{ label: "Vendre une carte", href: "/sell" }}
          />
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="space-y-2"
          >
            {data.map((listing, index) => (
              <ListingRow key={listing.id} listing={listing} index={index} />
            ))}
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

function ListingRow({ listing, index }: { listing: Listing; index: number }) {
  const statusConfig = getStatusConfig(listing.status);
  const canEdit = listing.status === "ACTIVE" || listing.status === "DRAFT";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
    >
      <Link
        href={canEdit ? `/sell/edit/${listing.id}` : `/listing/${listing.id}`}
      >
        <Card className="hover:bg-muted/50 transition-colors">
          <CardContent className="flex items-center gap-3 p-3">
            <div className="bg-muted relative size-12 shrink-0 overflow-hidden rounded-lg">
              {listing.cover_image_url ? (
                <Image
                  src={listing.cover_image_url}
                  alt={listing.title}
                  fill
                  className="object-cover"
                  sizes="48px"
                />
              ) : (
                <div className="bg-muted flex size-full items-center justify-center">
                  <Tag className="text-muted-foreground size-5" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{listing.title}</p>
              <div className="mt-0.5 flex items-center gap-2">
                <Badge variant={statusConfig.variant} className="text-[10px]">
                  {statusConfig.label}
                </Badge>
                <span className="text-muted-foreground text-[11px]">
                  {formatRelativeDate(listing.created_at)}
                </span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="font-heading text-sm font-semibold">
                {formatPrice(listing.display_price)}
              </span>
              {canEdit ? (
                <Pencil className="text-muted-foreground size-4" />
              ) : (
                <ChevronRight className="text-muted-foreground size-4" />
              )}
            </div>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
}
