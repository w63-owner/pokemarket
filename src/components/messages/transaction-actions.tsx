"use client";

import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Package, CheckCircle2, Loader2, Truck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { StarRating } from "@/components/shared/star-rating";
import { queryKeys } from "@/lib/query-keys";
import { shipOrder, confirmReception } from "@/lib/api/transactions";
import type { Transaction } from "@/types";
import type { User } from "@supabase/supabase-js";

interface TransactionActionsProps {
  transaction: Transaction;
  conversationId: string;
  listingId: string;
  currentUser: User;
  sellerId: string;
  buyerId: string;
}

export function TransactionActions({
  transaction,
  conversationId,
  listingId,
  currentUser,
  sellerId,
  buyerId,
}: TransactionActionsProps) {
  const isSeller = currentUser.id === sellerId;
  const isBuyer = currentUser.id === buyerId;

  if (transaction.status === "PAID" && isSeller) {
    return (
      <ShipOrderBar
        transactionId={transaction.id}
        conversationId={conversationId}
        listingId={listingId}
      />
    );
  }

  if (transaction.status === "SHIPPED" && isBuyer) {
    return (
      <ConfirmReceptionBar
        transactionId={transaction.id}
        conversationId={conversationId}
        listingId={listingId}
      />
    );
  }

  if (transaction.status === "SHIPPED" && isSeller) {
    return (
      <StatusBar
        icon={<Truck className="size-4 text-amber-600 dark:text-amber-400" />}
        label="En attente de la confirmation de réception"
      />
    );
  }

  if (transaction.status === "COMPLETED") {
    return (
      <StatusBar
        icon={
          <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
        }
        label="Transaction finalisée"
      />
    );
  }

  return null;
}

function StatusBar({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="border-border bg-muted/50 flex items-center gap-2 border-b px-3 py-2.5"
    >
      {icon}
      <span className="text-muted-foreground text-sm font-medium">{label}</span>
    </motion.div>
  );
}

function ShipOrderBar({
  transactionId,
  conversationId,
  listingId,
}: {
  transactionId: string;
  conversationId: string;
  listingId: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      shipOrder(
        transactionId,
        trackingNumber.trim(),
        trackingUrl.trim() || null,
        conversationId,
      ),
    onSuccess: () => {
      setOpen(false);
      setTrackingNumber("");
      setTrackingUrl("");
      toast.success("Colis marqué comme expédié !");
      queryClient.invalidateQueries({
        queryKey: queryKeys.transactions.byListing(listingId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.messages(conversationId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.detail(conversationId),
      });
    },
    onError: () => {
      toast.error("Impossible de mettre à jour l'expédition");
    },
  });

  const canSubmit = trackingNumber.trim().length > 0 && !mutation.isPending;

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    mutation.mutate();
  }, [canSubmit, mutation]);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="border-border flex items-center justify-between gap-2 border-b bg-blue-50/80 px-3 py-2.5 dark:bg-blue-950/30"
      >
        <div className="flex items-center gap-2">
          <Package className="size-4 text-blue-600 dark:text-blue-400" />
          <span className="text-sm font-medium">Paiement reçu</span>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Truck className="mr-1 size-3.5" />
          Expédier
        </Button>
      </motion.div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Expédier le colis</SheetTitle>
            <SheetDescription>
              Renseignez les informations de suivi pour informer
              l&apos;acheteur.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 px-4">
            <div className="space-y-2">
              <Label htmlFor="tracking-number">
                Numéro de suivi <span className="text-destructive">*</span>
              </Label>
              <Input
                id="tracking-number"
                placeholder="Ex : 1Z999AA10123456784"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmit();
                }}
                disabled={mutation.isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tracking-url">URL de suivi (optionnel)</Label>
              <Input
                id="tracking-url"
                type="url"
                placeholder="https://..."
                value={trackingUrl}
                onChange={(e) => setTrackingUrl(e.target.value)}
                disabled={mutation.isPending}
              />
            </div>
          </div>

          <SheetFooter>
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full"
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Envoi en cours…
                </>
              ) : (
                <>
                  <Package className="mr-2 size-4" />
                  Confirmer l&apos;expédition
                </>
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

function ConfirmReceptionBar({
  transactionId,
  conversationId,
  listingId,
}: {
  transactionId: string;
  conversationId: string;
  listingId: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      confirmReception(
        transactionId,
        rating,
        comment.trim() || null,
        conversationId,
      ),
    onSuccess: () => {
      setOpen(false);
      setRating(0);
      setComment("");
      toast.success("Réception confirmée ! Merci pour votre avis.");
      queryClient.invalidateQueries({
        queryKey: queryKeys.transactions.byListing(listingId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.messages(conversationId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.detail(conversationId),
      });
    },
    onError: () => {
      toast.error("Impossible de confirmer la réception");
    },
  });

  const canSubmit = rating >= 1 && rating <= 5 && !mutation.isPending;

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    mutation.mutate();
  }, [canSubmit, mutation]);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="border-border flex items-center justify-between gap-2 border-b bg-amber-50/80 px-3 py-2.5 dark:bg-amber-950/30"
      >
        <div className="flex items-center gap-2">
          <Truck className="size-4 text-amber-600 dark:text-amber-400" />
          <span className="text-sm font-medium">Colis en route</span>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <CheckCircle2 className="mr-1 size-3.5" />
          Confirmer la réception
        </Button>
      </motion.div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Confirmer la réception</SheetTitle>
            <SheetDescription>
              Notez le vendeur pour finaliser la transaction.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-5 px-4">
            <div className="space-y-2">
              <Label>
                Votre note <span className="text-destructive">*</span>
              </Label>
              <StarRating
                rating={rating}
                size="lg"
                interactive
                onChange={setRating}
                className="py-1"
              />
              {rating === 0 && (
                <p className="text-muted-foreground text-xs">
                  Touchez une étoile pour noter
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="review-comment">Commentaire (optionnel)</Label>
              <Textarea
                id="review-comment"
                placeholder="Partagez votre expérience…"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                disabled={mutation.isPending}
              />
            </div>
          </div>

          <SheetFooter>
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full"
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Envoi en cours…
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 size-4" />
                  Confirmer et noter
                </>
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
