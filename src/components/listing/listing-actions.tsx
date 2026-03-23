"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ShoppingCart,
  MessageCircle,
  Pencil,
  Trash2,
  AlertTriangle,
} from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/utils";

interface ListingActionsProps {
  mode: "buyer" | "seller";
  currentPrice?: number;
  onBuy?: () => void;
  onContact?: () => void;
  onEditPrice?: (newPrice: number) => void;
  onDelete?: () => void;
  className?: string;
}

export function ListingActions({
  mode,
  currentPrice,
  onBuy,
  onContact,
  onEditPrice,
  onDelete,
  className,
}: ListingActionsProps) {
  const [editPriceOpen, setEditPriceOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newPrice, setNewPrice] = useState(currentPrice?.toString() ?? "");

  const handleEditPriceSubmit = () => {
    const parsed = parseFloat(newPrice);
    if (!isNaN(parsed) && parsed > 0) {
      onEditPrice?.(parsed);
      setEditPriceOpen(false);
    }
  };

  const handleDelete = () => {
    onDelete?.();
    setDeleteOpen(false);
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
              onClick={onContact}
            >
              <MessageCircle data-icon="inline-start" className="size-4" />
              Contacter
            </Button>
            <Button size="lg" className="flex-[2]" onClick={onBuy}>
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
              onClick={() => {
                setNewPrice(currentPrice?.toString() ?? "");
                setEditPriceOpen(true);
              }}
            >
              <Pencil data-icon="inline-start" className="size-4" />
              Modifier le prix
            </Button>
          </div>
        )}
      </motion.div>

      {/* Edit price dialog */}
      <Dialog open={editPriceOpen} onOpenChange={setEditPriceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le prix</DialogTitle>
            <DialogDescription>
              Entrez le nouveau prix de vente pour votre annonce.
              {currentPrice != null && (
                <>
                  {" "}
                  Prix actuel : <strong>{formatPrice(currentPrice)}</strong>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="new-price">Nouveau prix (€)</Label>
            <Input
              id="new-price"
              type="number"
              min="0.01"
              step="0.01"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleEditPriceSubmit()}
              placeholder="0,00"
            />
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Annuler
            </DialogClose>
            <Button
              onClick={handleEditPriceSubmit}
              disabled={!newPrice || parseFloat(newPrice) <= 0}
            >
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
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
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="size-4" />
              Supprimer définitivement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
