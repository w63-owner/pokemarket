"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ShoppingCart,
  MessageCircle,
  Pencil,
  Trash2,
  AlertTriangle,
  Loader2,
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
import { deleteListing } from "@/lib/api/listings";

interface ListingActionsProps {
  listingId: string;
  mode: "buyer" | "seller";
  currentPrice?: number;
  onDelete?: () => void;
  className?: string;
}

export function ListingActions({
  listingId,
  mode,
  currentPrice,
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
      await deleteListing(listingId);
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
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 30, delay: 0.1 }}
        className={cn(
          "border-border bg-background/95 fixed right-0 bottom-0 left-0 z-40 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:sticky sm:bottom-0 sm:rounded-xl sm:border sm:shadow-lg",
          className,
        )}
      >
        {mode === "buyer" ? (
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
                <MessageCircle data-icon="inline-start" className="size-4" />
              )}
              Contacter
            </Button>
            <Button size="lg" className="flex-[2]" onClick={handleBuy}>
              <ShoppingCart data-icon="inline-start" className="size-4" />
              Acheter
              {currentPrice != null ? ` · ${formatPrice(currentPrice)}` : ""}
            </Button>
          </div>
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
      </motion.div>

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
