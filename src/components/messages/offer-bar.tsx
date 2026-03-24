"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { m, AnimatePresence } from "framer-motion";
import { Tag, X, Check, ShoppingCart, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPrice } from "@/lib/utils";
import { LIMITS } from "@/lib/constants";
import { queryKeys } from "@/lib/query-keys";
import { notifyUser } from "@/lib/api/push";
import {
  createOffer,
  acceptOffer,
  rejectOffer,
  cancelOffer,
} from "@/lib/api/offers";
import type { ConversationDetail } from "@/lib/api/conversations";
import type { Offer } from "@/types";
import type { User } from "@supabase/supabase-js";

interface OfferBarProps {
  conversation: ConversationDetail;
  activeOffer: Offer | null;
  currentUser: User;
}

export function OfferBar({
  conversation,
  activeOffer,
  currentUser,
}: OfferBarProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isBuyer = currentUser.id === conversation.buyer_id;
  const listing = conversation.listing;

  const minOffer =
    Math.ceil(listing.display_price * LIMITS.MIN_OFFER_PERCENT * 100) / 100;

  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.offers.activeByConversation(conversation.id),
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.conversations.detail(conversation.id),
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.conversations.messages(conversation.id),
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.listings.detail(listing.id),
    });
  }, [queryClient, conversation.id, listing.id]);

  const createMutation = useMutation({
    mutationFn: () => {
      const numAmount = parseFloat(amount);
      return createOffer(listing.id, numAmount, conversation.id);
    },
    onSuccess: () => {
      const numAmount = parseFloat(amount);
      setAmount("");
      setError(null);
      invalidateAll();
      toast.success("Offre envoyée !");
      notifyUser(
        conversation.seller_id,
        "Nouvelle offre",
        `Offre de ${numAmount.toFixed(2)} €`,
        `/messages/${conversation.id}`,
      );
    },
    onError: () => {
      toast.error("Impossible d'envoyer l'offre");
    },
  });

  const acceptMutation = useMutation({
    mutationFn: () => {
      if (!activeOffer) throw new Error("Aucune offre");
      return acceptOffer(
        activeOffer.id,
        listing.id,
        activeOffer.buyer_id,
        activeOffer.offer_amount,
        conversation.id,
      );
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Offre acceptée !");
      if (activeOffer) {
        notifyUser(
          activeOffer.buyer_id,
          "Offre acceptée",
          `Votre offre de ${activeOffer.offer_amount.toFixed(2)} € a été acceptée`,
          `/messages/${conversation.id}`,
        );
      }
    },
    onError: () => {
      toast.error("Impossible d'accepter l'offre");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () => {
      if (!activeOffer) throw new Error("Aucune offre");
      return rejectOffer(activeOffer.id, conversation.id);
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Offre refusée");
      if (activeOffer) {
        notifyUser(
          activeOffer.buyer_id,
          "Offre déclinée",
          `Votre offre de ${activeOffer.offer_amount.toFixed(2)} € a été déclinée`,
          `/messages/${conversation.id}`,
        );
      }
    },
    onError: () => {
      toast.error("Impossible de refuser l'offre");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => {
      if (!activeOffer) throw new Error("Aucune offre");
      return cancelOffer(activeOffer.id, conversation.id);
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Offre annulée");
    },
    onError: () => {
      toast.error("Impossible d'annuler l'offre");
    },
  });

  const isMutating =
    createMutation.isPending ||
    acceptMutation.isPending ||
    rejectMutation.isPending ||
    cancelMutation.isPending;

  const handleSubmitOffer = useCallback(() => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError("Montant invalide");
      return;
    }
    if (numAmount < minOffer) {
      setError(`Minimum ${formatPrice(minOffer)}`);
      return;
    }
    setError(null);
    createMutation.mutate();
  }, [amount, minOffer, createMutation]);

  const isLockedForBuyer =
    listing.status === "LOCKED" &&
    isBuyer &&
    activeOffer?.status === "ACCEPTED";

  if (
    listing.status === "SOLD" ||
    (listing.status === "LOCKED" && !isLockedForBuyer)
  ) {
    return null;
  }

  // ── Buyer views ──────────────────────────────────────────────────────
  if (isBuyer) {
    if (activeOffer?.status === "ACCEPTED") {
      const checkoutPrice = activeOffer.offer_amount;
      return (
        <OfferBarShell>
          <div className="flex items-center gap-2">
            <ShoppingCart className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm font-medium">
              Offre acceptée — {formatPrice(checkoutPrice)}
            </span>
          </div>
          <Button
            size="sm"
            className="shrink-0"
            onClick={() => router.push(`/checkout/${listing.id}`)}
          >
            Acheter à {formatPrice(checkoutPrice)}
          </Button>
        </OfferBarShell>
      );
    }

    if (activeOffer?.status === "PENDING") {
      return (
        <OfferBarShell>
          <div className="flex items-center gap-2">
            <Tag className="text-brand size-4 shrink-0" />
            <span className="text-sm font-medium">
              Offre de {formatPrice(activeOffer.offer_amount)} en attente
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => cancelMutation.mutate()}
            disabled={isMutating}
          >
            {cancelMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <X className="size-3.5" />
            )}
            <span className="ml-1">Annuler</span>
          </Button>
        </OfferBarShell>
      );
    }

    return (
      <OfferBarShell>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="relative flex-1">
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min={minOffer}
              placeholder={`Min. ${formatPrice(minOffer)}`}
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmitOffer();
              }}
              className="h-8 pr-8 text-sm"
              disabled={isMutating}
            />
            <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs">
              €
            </span>
          </div>
          <Button
            size="sm"
            className="shrink-0"
            onClick={handleSubmitOffer}
            disabled={isMutating || !amount}
          >
            {createMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              "Faire une offre"
            )}
          </Button>
        </div>
        <AnimatePresence>
          {error && (
            <m.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="text-destructive w-full text-xs"
            >
              {error}
            </m.p>
          )}
        </AnimatePresence>
      </OfferBarShell>
    );
  }

  // ── Seller views ─────────────────────────────────────────────────────
  if (activeOffer?.status === "ACCEPTED") {
    return (
      <OfferBarShell>
        <div className="flex items-center gap-2">
          <Check className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="text-sm font-medium">
            Offre acceptée — En attente du paiement
          </span>
        </div>
      </OfferBarShell>
    );
  }

  if (activeOffer?.status === "PENDING") {
    return (
      <OfferBarShell highlight>
        <div className="flex items-center gap-2">
          <Tag className="text-brand size-4 shrink-0" />
          <span className="text-sm font-medium">
            Offre de {formatPrice(activeOffer.offer_amount)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => acceptMutation.mutate()}
            disabled={isMutating}
          >
            {acceptMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            <span className="ml-1">Accepter</span>
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => rejectMutation.mutate()}
            disabled={isMutating}
          >
            {rejectMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <X className="size-3.5" />
            )}
            <span className="ml-1">Refuser</span>
          </Button>
        </div>
      </OfferBarShell>
    );
  }

  return null;
}

function OfferBarShell({
  children,
  highlight = false,
}: {
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <m.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className={`border-border flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5 ${
        highlight ? "bg-brand/5 dark:bg-brand/10" : "bg-muted/50"
      }`}
    >
      {children}
    </m.div>
  );
}
