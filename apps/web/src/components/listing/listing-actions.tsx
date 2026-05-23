"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { m } from "framer-motion";
import {
  ShoppingCart,
  MessageCircle,
  Pencil,
  Trash2,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/utils";
import { fetchOrCreateConversation } from "@/lib/api/conversations";
import { deleteListingAction } from "@/actions/listings";

type ListingViewerStatus = "ACTIVE" | "LOCKED" | "RESERVED" | "SOLD" | "DRAFT";

interface ListingActionsProps {
  listingId: string;
  mode: "buyer" | "seller";
  currentPrice?: number;
  listingStatus?: ListingViewerStatus;
  isReservedForViewer?: boolean;
  reservedPrice?: number | null;
  onDelete?: () => void;
  className?: string;
}

export function ListingActions({
  listingId,
  mode,
  currentPrice,
  listingStatus = "ACTIVE",
  isReservedForViewer = false,
  reservedPrice = null,
  onDelete,
  className,
}: ListingActionsProps) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [contactLoading, setContactLoading] = useState(false);

  const handleContact = async () => {
    setContactLoading(true);
    try {
      const conversationId = await fetchOrCreateConversation(listingId);
      router.push(`/messages/${conversationId}`);
    } catch {
      toast.error("Connectez-vous pour contacter le vendeur");
      router.push("/auth");
    } finally {
      setContactLoading(false);
    }
  };

  const handleBuy = () => {
    router.push(`/checkout/${listingId}`);
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      const result = await deleteListingAction(listingId);
      if (!result.success) throw new Error(result.error);
      onDelete?.();
      setDeleteOpen(false);
      toast.success("Annonce supprimée");
      router.push("/");
    } catch {
      toast.error("Impossible de supprimer l'annonce. Réessayez.");
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <>
      <m.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 30, delay: 0.1 }}
        className={cn(
          "border-border bg-background/95 fixed right-0 bottom-0 left-0 z-40 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:sticky sm:bottom-0 sm:rounded-xl sm:border sm:shadow-lg",
          className,
        )}
      >
        {mode === "buyer" ? (
          (() => {
            // ── SOLD: hide everything except a clear status pill ─────────
            if (listingStatus === "SOLD") {
              return (
                <div className="flex h-11 items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 text-sm font-medium text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400">
                  <CheckCircle2 className="size-4" />
                  Annonce vendue
                </div>
              );
            }

            // ── RESERVED for someone else: contact only, no Buy button ───
            if (
              (listingStatus === "RESERVED" || listingStatus === "LOCKED") &&
              !isReservedForViewer
            ) {
              return (
                <div className="space-y-2">
                  <div className="flex h-9 items-center justify-center gap-2 rounded-md border border-amber-200 bg-amber-50 text-xs font-medium text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-400">
                    <Lock className="size-3.5" />
                    {listingStatus === "LOCKED"
                      ? "Paiement en cours par un autre acheteur"
                      : "Réservée à un autre acheteur"}
                  </div>
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full"
                    onClick={handleContact}
                    disabled={contactLoading}
                  >
                    {contactLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <MessageCircle className="size-4" />
                    )}
                    Contacter le vendeur
                  </Button>
                </div>
              );
            }

            // ── RESERVED for the current viewer: Buy at the reserved price ─
            const buyPrice =
              isReservedForViewer && reservedPrice != null
                ? reservedPrice
                : (currentPrice ?? 0);

            return (
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="lg"
                  className="flex-1"
                  onClick={handleContact}
                  disabled={contactLoading}
                >
                  {contactLoading ? (
                    <Loader2
                      data-icon="inline-start"
                      className="size-4 animate-spin"
                    />
                  ) : (
                    <MessageCircle
                      data-icon="inline-start"
                      className="size-4"
                    />
                  )}
                  Contacter
                </Button>
                <Button size="lg" className="flex-[2]" onClick={handleBuy}>
                  <ShoppingCart data-icon="inline-start" className="size-4" />
                  Acheter · {formatPrice(buyPrice)}
                </Button>
              </div>
            );
          })()
        ) : (
          <div className="flex gap-3">
            <Button
              variant="destructive"
              size="lg"
              className="flex-1"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 data-icon="inline-start" className="size-4" />
              Supprimer
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="flex-[2]"
              onClick={() => router.push(`/sell/edit/${listingId}`)}
            >
              <Pencil data-icon="inline-start" className="size-4" />
              Modifier l&apos;annonce
            </Button>
          </div>
        )}
      </m.div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="text-destructive size-5" />
              Supprimer l&apos;annonce
            </DialogTitle>
            <DialogDescription>
              Cette action est irréversible. Votre annonce sera définitivement
              supprimée et ne pourra pas être récupérée.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Annuler
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteLoading}
            >
              {deleteLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              {deleteLoading ? "Suppression…" : "Supprimer définitivement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
