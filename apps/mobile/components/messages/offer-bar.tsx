import { useCallback, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { router } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { LIMITS, formatPrice, queryKeys, type Offer } from "@pokemarket/shared";
import { Check, ShoppingCart, Tag } from "lucide-react-native";

import { Button, Input, Sheet, Text, toast } from "@/components/ui";
import {
  acceptOffer,
  cancelOffer,
  createOffer,
  rejectOffer,
} from "@/lib/api/offers";
import type { ConversationDetail } from "@/lib/api/conversations";

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
  const queryClient = useQueryClient();
  const isBuyer = currentUser.id === conversation.buyer_id;
  const listing = conversation.listing;

  const minOffer =
    Math.ceil(listing.display_price * LIMITS.MIN_OFFER_PERCENT * 100) / 100;

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
    },
    onError: () => toast.error("Impossible d'accepter l'offre"),
  });

  const rejectMutation = useMutation({
    mutationFn: () => {
      if (!activeOffer) throw new Error("Aucune offre");
      return rejectOffer(activeOffer.id, conversation.id);
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Offre refusée");
    },
    onError: () => toast.error("Impossible de refuser l'offre"),
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
    onError: () => toast.error("Impossible d'annuler l'offre"),
  });

  const isMutating =
    acceptMutation.isPending ||
    rejectMutation.isPending ||
    cancelMutation.isPending;

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
      return (
        <BarShell>
          <View className="flex-row items-center gap-2">
            <ShoppingCart size={14} color="#16a34a" />
            <Text className="text-sm font-medium">
              Offre acceptée — {formatPrice(activeOffer.offer_amount)}
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onPress={() => cancelMutation.mutate()}
              disabled={isMutating}
              loading={cancelMutation.isPending}
            >
              Annuler
            </Button>
            <Button
              size="sm"
              onPress={() => router.push(`/checkout/${listing.id}`)}
            >
              {`Acheter ${formatPrice(activeOffer.offer_amount)}`}
            </Button>
          </View>
        </BarShell>
      );
    }

    if (activeOffer?.status === "PENDING") {
      return (
        <BarShell>
          <View className="flex-row items-center gap-2">
            <Tag size={14} color="#E63946" />
            <Text className="text-sm font-medium">
              Offre de {formatPrice(activeOffer.offer_amount)} en attente
            </Text>
          </View>
          <Button
            variant="outline"
            size="sm"
            onPress={() => cancelMutation.mutate()}
            disabled={isMutating}
            loading={cancelMutation.isPending}
          >
            Annuler
          </Button>
        </BarShell>
      );
    }

    return (
      <BuyerOfferEntry
        listingId={listing.id}
        conversationId={conversation.id}
        minOffer={minOffer}
        onSent={invalidateAll}
      />
    );
  }

  // ── Seller views ─────────────────────────────────────────────────────
  if (activeOffer?.status === "ACCEPTED") {
    return (
      <BarShell>
        <View className="flex-row items-center gap-2">
          <Check size={14} color="#16a34a" />
          <Text className="text-sm font-medium">
            Offre acceptée — En attente du paiement
          </Text>
        </View>
      </BarShell>
    );
  }

  if (activeOffer?.status === "PENDING") {
    return (
      <BarShell highlight>
        <View className="flex-row items-center gap-2">
          <Tag size={14} color="#E63946" />
          <Text className="text-sm font-medium">
            Offre de {formatPrice(activeOffer.offer_amount)}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Button
            size="sm"
            onPress={() => acceptMutation.mutate()}
            disabled={isMutating}
            loading={acceptMutation.isPending}
          >
            Accepter
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onPress={() => rejectMutation.mutate()}
            disabled={isMutating}
            loading={rejectMutation.isPending}
          >
            Refuser
          </Button>
        </View>
      </BarShell>
    );
  }

  return null;
}

interface BuyerOfferEntryProps {
  listingId: string;
  conversationId: string;
  minOffer: number;
  onSent: () => void;
}

function BuyerOfferEntry({
  listingId,
  conversationId,
  minOffer,
  onSent,
}: BuyerOfferEntryProps) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () => {
      const num = parseFloat(amount.replace(",", "."));
      return createOffer(listingId, num, conversationId);
    },
    onSuccess: () => {
      setOpen(false);
      setAmount("");
      setError(null);
      onSent();
      toast.success("Offre envoyée !");
    },
    onError: () => toast.error("Impossible d'envoyer l'offre"),
  });

  const handleSubmit = useCallback(() => {
    const num = parseFloat(amount.replace(",", "."));
    if (isNaN(num) || num <= 0) {
      setError("Montant invalide");
      return;
    }
    if (num < minOffer) {
      setError(`Minimum ${formatPrice(minOffer)}`);
      return;
    }
    setError(null);
    createMutation.mutate();
  }, [amount, createMutation, minOffer]);

  return (
    <>
      <BarShell>
        <View className="flex-row items-center gap-2">
          <Tag size={14} color="#E63946" />
          <Text className="text-sm font-medium">
            Min. {formatPrice(minOffer)}
          </Text>
        </View>
        <Button size="sm" onPress={() => setOpen(true)}>
          Faire une offre
        </Button>
      </BarShell>

      <Sheet open={open} onOpenChange={setOpen}>
        <View className="gap-4 pb-2">
          <Text variant="h4">Faire une offre</Text>
          <Text variant="muted">
            Le vendeur recevra une notification et pourra accepter ou refuser
            votre offre.
          </Text>

          <View className="gap-2">
            <Text variant="small" className="font-medium">
              Montant en euros
            </Text>
            <Input
              value={amount}
              onChangeText={(v) => {
                setAmount(v);
                setError(null);
              }}
              keyboardType="decimal-pad"
              placeholder={`Min. ${formatPrice(minOffer)}`}
              autoFocus
              error={!!error}
            />
            {error ? (
              <Text variant="small" className="text-destructive">
                {error}
              </Text>
            ) : null}
          </View>

          <View className="mt-2 flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onPress={() => setOpen(false)}
              disabled={createMutation.isPending}
            >
              Annuler
            </Button>
            <Button
              className="flex-1"
              onPress={handleSubmit}
              disabled={!amount || createMutation.isPending}
            >
              {createMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                "Envoyer"
              )}
            </Button>
          </View>
        </View>
      </Sheet>
    </>
  );
}

function BarShell({
  children,
  highlight,
}: {
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <View
      className={`flex-row items-center justify-between gap-2 border-b border-border px-3 py-2.5 ${
        highlight ? "bg-primary/5" : "bg-muted/40"
      }`}
    >
      {children}
    </View>
  );
}
