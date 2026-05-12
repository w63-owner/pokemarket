"use client";

import { useState, type ReactElement } from "react";
import { Bookmark } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useCreateSavedSearch } from "@/hooks/use-saved-searches";
import { filtersToLabel, suggestSearchName } from "@/hooks/use-feed-filters";
import type { FeedFilters } from "@/lib/query-keys";

interface SaveSearchDialogProps {
  filters: FeedFilters;
  children?: ReactElement;
}

const defaultTrigger = (
  <Button variant="outline" size="sm">
    <Bookmark className="mr-1.5 h-3.5 w-3.5" />
    Sauvegarder
  </Button>
);

export function SaveSearchDialog({ filters, children }: SaveSearchDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const { mutate: save, isPending } = useCreateSavedSearch();

  function handleOpen(next: boolean) {
    if (next) {
      setName(suggestSearchName(filters));
    }
    setOpen(next);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    save(
      { name: trimmed, filters },
      {
        onSuccess: () => setOpen(false),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger render={children ?? defaultTrigger} />
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Sauvegarder cette recherche</DialogTitle>
            <DialogDescription>{filtersToLabel(filters)}</DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Label htmlFor="search-name">Nom</Label>
            <Input
              id="search-name"
              placeholder="Ex: Pikachu Rare pas cher"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              autoFocus
              className="mt-1.5"
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending || !name.trim()}>
              {isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
