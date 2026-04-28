"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { m } from "framer-motion";
import { Loader2, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { MobileHeader } from "@/components/layout/mobile-header";
import { ImageUploader } from "@/components/sell/image-uploader";
import { SellForm, type SellFormValues } from "@/components/sell/sell-form";
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
import { useUpdateListing } from "@/hooks/use-listings";
import { deleteListingAction } from "@/actions/listings";
import { createClient } from "@/lib/supabase/client";
import { toCardLanguageSelectValue } from "@/lib/constants";
import type { Listing } from "@/types";

export default function EditListingPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const updateListing = useUpdateListing();

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [images, setImages] = useState<{
    coverUrl: string | null;
    backUrl: string | null;
  }>({ coverUrl: null, backUrl: null });
  const [imagesInitialized, setImagesInitialized] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    async function fetchListing() {
      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/auth");
        return;
      }

      const { data, error } = await supabase
        .from("listings")
        .select("*")
        .eq("id", params.id)
        .eq("seller_id", user.id)
        .single();

      if (error || !data) {
        toast.error("Annonce introuvable ou accès refusé.");
        router.replace("/");
        return;
      }

      setListing(data as Listing);
      setImages({
        coverUrl: data.cover_image_url,
        backUrl: data.back_image_url,
      });
      setImagesInitialized(true);
      setLoading(false);
    }

    fetchListing();
  }, [params.id, router]);

  const handleImagesChange = useCallback(
    (next: { coverUrl: string | null; backUrl: string | null }) => {
      setImages(next);
    },
    [],
  );

  const handleFormSubmit = useCallback(
    (data: SellFormValues) => {
      if (!listing) return;

      if (!images.coverUrl || !images.backUrl) {
        toast.error("Veuillez ajouter les photos recto et verso.");
        return;
      }

      updateListing.mutate(
        {
          id: listing.id,
          title: data.title,
          price_seller: data.price_seller,
          condition: data.is_graded ? null : (data.condition ?? null),
          is_graded: data.is_graded,
          grading_company: data.is_graded
            ? (data.grading_company ?? null)
            : null,
          grade_note: data.is_graded ? (data.grade_note ?? null) : null,
          cover_image_url: images.coverUrl,
          back_image_url: images.backUrl,
          card_series: data.card_series ?? null,
          card_block: data.card_block ?? null,
          card_number: data.card_number ?? null,
          card_language: data.card_language ?? null,
          card_rarity: data.card_rarity ?? null,
          card_illustrator: data.card_illustrator ?? null,
        },
        {
          onSuccess: () => {
            toast.success("Annonce modifiée avec succès !");
            router.push(`/listing/${listing.id}`);
          },
        },
      );
    },
    [listing, images, updateListing, router],
  );

  const handleDelete = useCallback(async () => {
    if (!listing) return;
    setDeleteLoading(true);
    try {
      const result = await deleteListingAction(listing.id);
      if (!result.success) throw new Error(result.error);
      setDeleteOpen(false);
      toast.success("Annonce supprimée");
      router.push("/profile/listings");
    } catch {
      toast.error("Impossible de supprimer l'annonce. Réessayez.");
    } finally {
      setDeleteLoading(false);
    }
  }, [listing, router]);

  if (loading || !listing) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="text-muted-foreground size-8 animate-spin" />
      </div>
    );
  }

  const defaultValues: Partial<SellFormValues> = {
    title: listing.title,
    price_seller: listing.price_seller,
    condition: listing.condition ?? undefined,
    is_graded: listing.is_graded ?? false,
    grading_company: listing.grading_company ?? undefined,
    grade_note: listing.grade_note ?? undefined,
    card_series: listing.card_series ?? undefined,
    card_block: listing.card_block ?? undefined,
    card_number: listing.card_number ?? undefined,
    card_language:
      toCardLanguageSelectValue(listing.card_language) || undefined,
    card_rarity: listing.card_rarity ?? undefined,
    card_illustrator: listing.card_illustrator ?? undefined,
  };

  return (
    <>
      <MobileHeader
        title="Modifier l'annonce"
        fallbackUrl={`/listing/${listing.id}`}
      />
      <div className="mx-auto w-full max-w-lg px-4 pt-6 pb-24">
        <m.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <p className="text-muted-foreground text-sm">
            Modifiez les informations de votre annonce.
          </p>
        </m.div>

        <section className="mb-6">
          {imagesInitialized && (
            <ImageUploader
              onImagesChange={handleImagesChange}
              initialCoverUrl={listing.cover_image_url}
              initialBackUrl={listing.back_image_url}
            />
          )}
        </section>

        <div className="mb-4 flex items-center gap-2">
          <div className="bg-border h-px flex-1" />
          <span className="text-muted-foreground text-xs font-medium">
            Détails de l&apos;annonce
          </span>
          <div className="bg-border h-px flex-1" />
        </div>

        <SellForm
          defaultValues={defaultValues}
          onSubmit={handleFormSubmit}
          isLoading={updateListing.isPending}
          submitLabel="Enregistrer les modifications"
        />

        <Button
          type="button"
          variant="destructive"
          className="w-full"
          onClick={() => setDeleteOpen(true)}
          disabled={updateListing.isPending}
        >
          <Trash2 data-icon="inline-start" className="size-4" />
          Supprimer l&apos;annonce
        </Button>
      </div>

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
