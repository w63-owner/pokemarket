"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { MobileHeader } from "@/components/layout/mobile-header";
import { ImageUploader } from "@/components/sell/image-uploader";
import { SellForm, type SellFormValues } from "@/components/sell/sell-form";
import { useUpdateListing } from "@/hooks/use-listings";
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
    is_graded: listing.is_graded,
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
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <p className="text-muted-foreground text-sm">
            Modifiez les informations de votre annonce.
          </p>
        </motion.div>

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
      </div>
    </>
  );
}
