"use client";

import { useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Tag,
  Check,
  X,
  Clock,
  Inbox,
  Send,
  Loader2,
  CreditCard,
  Ban,
} from "lucide-react";
import { toast } from "sonner";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import { useAuth } from "@/hooks/use-auth";
import { useRealtime } from "@/hooks/use-realtime";
import { queryKeys } from "@/lib/query-keys";
import { formatPrice, formatRelativeDate } from "@/lib/utils";
import {
  fetchReceivedOffers,
  fetchSentOffers,
  acceptOffer,
  rejectOffer,
  cancelOffer,
} from "@/lib/api/offers";
import type { OfferWithContext, SentOfferWithContext } from "@/types";

const STATUS_CONFIG = {
  PENDING: {
    label: "En attente",
    variant: "secondary" as const,
    icon: Clock,
  },
  ACCEPTED: {
    label: "Acceptée",
    variant: "default" as const,
    icon: Check,
  },
  REJECTED: {
    label: "Refusée",
    variant: "destructive" as const,
    icon: X,
  },
  CANCELLED: {
    label: "Annulée",
    variant: "outline" as const,
    icon: Ban,
  },
} as const;

function OfferStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG];
  if (!config) return null;

  const Icon = config.icon;
  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon className="size-3" />
      {config.label}
    </Badge>
  );
}

function OfferCardSkeleton() {
  return (
    <div className="bg-card ring-foreground/10 flex items-center gap-3 rounded-xl p-3 ring-1">
      <Skeleton className="size-14 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-5 w-16" />
      </div>
    </div>
  );
}

function ReceivedOfferCard({
  offer,
  index,
}: {
  offer: OfferWithContext;
  index: number;
}) {
  const queryClient = useQueryClient();

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.offers.received() });
    queryClient.invalidateQueries({ queryKey: queryKeys.offers.sent() });
    queryClient.invalidateQueries({
      queryKey: queryKeys.listings.detail(offer.listing_id),
    });
  }, [queryClient, offer.listing_id]);

  const acceptMut = useMutation({
    mutationFn: () =>
      acceptOffer(
        offer.id,
        offer.listing_id,
        offer.buyer_id,
        offer.offer_amount,
        offer.conversation_id!,
      ),
    onSuccess: () => {
      toast.success("Offre acceptée !");
      invalidateAll();
    },
    onError: () => toast.error("Impossible d'accepter l'offre"),
  });

  const rejectMut = useMutation({
    mutationFn: () => rejectOffer(offer.id, offer.conversation_id!),
    onSuccess: () => {
      toast.success("Offre refusée");
      invalidateAll();
    },
    onError: () => toast.error("Impossible de refuser l'offre"),
  });

  const isMutating = acceptMut.isPending || rejectMut.isPending;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25 }}
      className="bg-card ring-foreground/10 flex gap-3 rounded-xl p-3 ring-1"
    >
      <Link
        href={`/listing/${offer.listing_id}`}
        className="bg-muted relative size-16 shrink-0 overflow-hidden rounded-lg"
      >
        {offer.listing.cover_image_url ? (
          <Image
            src={offer.listing.cover_image_url}
            alt={offer.listing.title}
            fill
            className="object-cover"
            sizes="64px"
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <Tag className="text-muted-foreground size-5" />
          </div>
        )}
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {formatPrice(offer.offer_amount)}
            </p>
            <p className="text-muted-foreground truncate text-xs">
              {offer.listing.title}
            </p>
          </div>
          <OfferStatusBadge status={offer.status} />
        </div>

        <div className="mt-1.5 flex items-center gap-1.5">
          <Avatar className="size-4">
            {offer.buyer.avatar_url ? (
              <AvatarImage src={offer.buyer.avatar_url} />
            ) : null}
            <AvatarFallback className="text-[8px]">
              {offer.buyer.username.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="text-muted-foreground truncate text-xs">
            {offer.buyer.username}
          </span>
          <span className="text-muted-foreground ml-auto shrink-0 text-[11px]">
            {formatRelativeDate(offer.created_at)}
          </span>
        </div>

        <AnimatePresence>
          {offer.status === "PENDING" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-2 flex items-center gap-2"
            >
              <Button
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => acceptMut.mutate()}
                disabled={isMutating}
              >
                {acceptMut.isPending ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Check className="size-3" />
                )}
                Accepter
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => rejectMut.mutate()}
                disabled={isMutating}
              >
                {rejectMut.isPending ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <X className="size-3" />
                )}
                Refuser
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function SentOfferCard({
  offer,
  index,
}: {
  offer: SentOfferWithContext;
  index: number;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const cancelMut = useMutation({
    mutationFn: () => cancelOffer(offer.id, offer.conversation_id!),
    onSuccess: () => {
      toast.success("Offre annulée");
      queryClient.invalidateQueries({ queryKey: queryKeys.offers.sent() });
      queryClient.invalidateQueries({ queryKey: queryKeys.offers.received() });
    },
    onError: () => toast.error("Impossible d'annuler l'offre"),
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25 }}
      className="bg-card ring-foreground/10 flex gap-3 rounded-xl p-3 ring-1"
    >
      <Link
        href={`/listing/${offer.listing_id}`}
        className="bg-muted relative size-16 shrink-0 overflow-hidden rounded-lg"
      >
        {offer.listing.cover_image_url ? (
          <Image
            src={offer.listing.cover_image_url}
            alt={offer.listing.title}
            fill
            className="object-cover"
            sizes="64px"
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <Tag className="text-muted-foreground size-5" />
          </div>
        )}
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {formatPrice(offer.offer_amount)}
            </p>
            <p className="text-muted-foreground truncate text-xs">
              {offer.listing.title}
            </p>
          </div>
          <OfferStatusBadge status={offer.status} />
        </div>

        <div className="mt-1.5 flex items-center gap-1.5">
          <Avatar className="size-4">
            {offer.listing.seller.avatar_url ? (
              <AvatarImage src={offer.listing.seller.avatar_url} />
            ) : null}
            <AvatarFallback className="text-[8px]">
              {offer.listing.seller.username.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="text-muted-foreground truncate text-xs">
            {offer.listing.seller.username}
          </span>
          <span className="text-muted-foreground ml-auto shrink-0 text-[11px]">
            {formatRelativeDate(offer.created_at)}
          </span>
        </div>

        <AnimatePresence>
          {offer.status === "PENDING" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-2"
            >
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => cancelMut.mutate()}
                disabled={cancelMut.isPending}
              >
                {cancelMut.isPending ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <X className="size-3" />
                )}
                Annuler
              </Button>
            </motion.div>
          )}
          {offer.status === "ACCEPTED" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-2"
            >
              <Button
                size="sm"
                className="h-8 w-full gap-1.5"
                onClick={() => router.push(`/checkout/${offer.listing_id}`)}
              >
                <CreditCard className="size-3.5" />
                Payer {formatPrice(offer.offer_amount)}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default function OffersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: received,
    isLoading: loadingReceived,
    error: errorReceived,
  } = useQuery({
    queryKey: queryKeys.offers.received(),
    queryFn: fetchReceivedOffers,
    enabled: !!user,
  });

  const {
    data: sent,
    isLoading: loadingSent,
    error: errorSent,
  } = useQuery({
    queryKey: queryKeys.offers.sent(),
    queryFn: fetchSentOffers,
    enabled: !!user,
  });

  const invalidateOffers = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.offers.received() });
    queryClient.invalidateQueries({ queryKey: queryKeys.offers.sent() });
  }, [queryClient]);

  useRealtime({
    channelName: `offers-dashboard-${user?.id ?? "anon"}`,
    table: "offers",
    event: "*",
    onInsert: invalidateOffers,
    onUpdate: invalidateOffers,
    enabled: !!user,
  });

  const pendingReceivedCount = received?.filter(
    (o) => o.status === "PENDING",
  ).length;

  const pendingSentCount = sent?.filter((o) => o.status === "PENDING").length;

  return (
    <div className="mx-auto w-full max-w-2xl pb-24">
      <header className="border-border bg-background/80 sticky top-0 z-10 border-b px-4 py-3 backdrop-blur-md">
        <h1 className="font-display text-lg font-bold">Mes offres</h1>
      </header>

      <div className="px-4 pt-4">
        <Tabs defaultValue="received">
          <TabsList className="w-full">
            <TabsTrigger value="received" className="flex-1 gap-1.5">
              <Inbox className="size-4" />
              Reçues
              {!!pendingReceivedCount && pendingReceivedCount > 0 && (
                <span className="bg-brand text-brand-foreground flex size-4.5 items-center justify-center rounded-full text-[10px] font-bold">
                  {pendingReceivedCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="sent" className="flex-1 gap-1.5">
              <Send className="size-4" />
              Envoyées
              {!!pendingSentCount && pendingSentCount > 0 && (
                <span className="bg-brand text-brand-foreground flex size-4.5 items-center justify-center rounded-full text-[10px] font-bold">
                  {pendingSentCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="received" className="mt-4 space-y-3">
            {loadingReceived ? (
              Array.from({ length: 3 }).map((_, i) => (
                <OfferCardSkeleton key={i} />
              ))
            ) : errorReceived ? (
              <EmptyState
                icon={<Inbox className="size-6" />}
                title="Erreur de chargement"
                description="Impossible de charger vos offres reçues."
                action={{ label: "Réessayer", onClick: invalidateOffers }}
              />
            ) : received && received.length > 0 ? (
              received.map((offer, i) => (
                <ReceivedOfferCard key={offer.id} offer={offer} index={i} />
              ))
            ) : (
              <EmptyState
                icon={<Inbox className="size-6" />}
                title="Aucune offre reçue"
                description="Les offres faites sur vos annonces apparaîtront ici."
              />
            )}
          </TabsContent>

          <TabsContent value="sent" className="mt-4 space-y-3">
            {loadingSent ? (
              Array.from({ length: 3 }).map((_, i) => (
                <OfferCardSkeleton key={i} />
              ))
            ) : errorSent ? (
              <EmptyState
                icon={<Send className="size-6" />}
                title="Erreur de chargement"
                description="Impossible de charger vos offres envoyées."
                action={{ label: "Réessayer", onClick: invalidateOffers }}
              />
            ) : sent && sent.length > 0 ? (
              sent.map((offer, i) => (
                <SentOfferCard key={offer.id} offer={offer} index={i} />
              ))
            ) : (
              <EmptyState
                icon={<Send className="size-6" />}
                title="Aucune offre envoyée"
                description="Parcourez les annonces et faites des offres aux vendeurs !"
                action={{ label: "Explorer le marché", href: "/" }}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
