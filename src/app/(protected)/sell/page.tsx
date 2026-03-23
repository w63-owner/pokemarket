"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ScanLine, Sparkles, ArrowRight } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ImageUploader } from "@/components/sell/image-uploader";
import { OcrResults } from "@/components/sell/ocr-results";
import { SellForm, type SellFormValues } from "@/components/sell/sell-form";
import { useCreateListing } from "@/hooks/use-listings";
import type { OcrCandidate, OcrResponse } from "@/types/api";

type OcrState = {
  isLoading: boolean;
  candidates: OcrCandidate[];
  selectedCardKey: string | null;
  selectedCandidate: OcrCandidate | null;
  hasRun: boolean;
};

const INITIAL_OCR: OcrState = {
  isLoading: false,
  candidates: [],
  selectedCardKey: null,
  selectedCandidate: null,
  hasRun: false,
};

export default function SellPage() {
  const router = useRouter();
  const createListing = useCreateListing();
  const formRef = useRef<HTMLDivElement>(null);

  const [images, setImages] = useState<{
    coverUrl: string | null;
    backUrl: string | null;
  }>({ coverUrl: null, backUrl: null });

  const [ocr, setOcr] = useState<OcrState>({ ...INITIAL_OCR });
  const [showForm, setShowForm] = useState(false);

  const hasCoverImage = !!images.coverUrl;

  const handleImagesChange = useCallback(
    (next: { coverUrl: string | null; backUrl: string | null }) => {
      setImages(next);

      if (!next.coverUrl && ocr.hasRun) {
        setOcr({ ...INITIAL_OCR });
        setShowForm(false);
      }
    },
    [ocr.hasRun],
  );

  const handleOcrScan = useCallback(async () => {
    if (!images.coverUrl) return;

    setOcr((prev) => ({
      ...prev,
      isLoading: true,
      hasRun: true,
      candidates: [],
    }));

    try {
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: images.coverUrl }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Erreur lors du scan");
      }

      const data: OcrResponse = await res.json();

      setOcr((prev) => ({
        ...prev,
        isLoading: false,
        candidates: data.candidates,
      }));

      if (data.candidates.length === 0) {
        toast.info(
          "Aucune carte identifiée. Remplissez le formulaire manuellement.",
        );
        setShowForm(true);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erreur lors du scan";
      toast.error(message);
      setOcr((prev) => ({ ...prev, isLoading: false }));
    }
  }, [images.coverUrl]);

  const handleCandidateSelect = useCallback(
    (cardKey: string | null) => {
      const candidate = cardKey
        ? (ocr.candidates.find((c) => c.card_key === cardKey) ?? null)
        : null;

      setOcr((prev) => ({
        ...prev,
        selectedCardKey: cardKey,
        selectedCandidate: candidate,
      }));
      setShowForm(true);

      requestAnimationFrame(() => {
        formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    },
    [ocr.candidates],
  );

  const handleSkipOcr = useCallback(() => {
    setShowForm(true);
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const handleFormSubmit = useCallback(
    (data: SellFormValues) => {
      if (!images.coverUrl || !images.backUrl) {
        toast.error("Veuillez ajouter les photos recto et verso.");
        return;
      }

      createListing.mutate(
        {
          title: data.title,
          price_seller: data.price_seller,
          condition: data.is_graded ? null : (data.condition ?? null),
          is_graded: data.is_graded,
          grading_company: data.is_graded
            ? (data.grading_company ?? null)
            : null,
          grade_note: data.is_graded ? (data.grade_note ?? null) : null,
          delivery_weight_class: data.delivery_weight_class,
          cover_image_url: images.coverUrl,
          back_image_url: images.backUrl,
          card_ref_id: ocr.selectedCandidate?.card_key ?? null,
          card_series: ocr.selectedCandidate?.set_id ?? null,
          card_block: ocr.selectedCandidate?.set_name ?? null,
        },
        {
          onSuccess: (listing) => {
            toast.success("Annonce publiée avec succès !");
            router.push(`/listing/${listing.id}`);
          },
        },
      );
    },
    [images, ocr.selectedCandidate, createListing, router],
  );

  const formDefaultValues: Partial<SellFormValues> | undefined =
    ocr.selectedCandidate ? { title: ocr.selectedCandidate.name } : undefined;

  return (
    <div className="mx-auto w-full max-w-lg px-4 pt-6 pb-24">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="font-display text-foreground text-xl font-bold">
          Vendre une carte
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Ajoutez vos photos, identifiez la carte et fixez votre prix.
        </p>
      </motion.div>

      {/* Step 1: Image upload */}
      <section className="mb-6">
        <ImageUploader onImagesChange={handleImagesChange} />
      </section>

      {/* Step 2: OCR trigger */}
      <AnimatePresence mode="wait">
        {hasCoverImage && !ocr.hasRun && (
          <motion.section
            key="ocr-trigger"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="mb-6 space-y-3"
          >
            <Button
              onClick={handleOcrScan}
              className="w-full gap-2"
              disabled={ocr.isLoading}
            >
              <Sparkles className="size-4" />
              Scanner la carte avec l&apos;IA
            </Button>
            <button
              type="button"
              onClick={handleSkipOcr}
              className="text-muted-foreground hover:text-foreground flex w-full items-center justify-center gap-1 text-xs transition-colors"
            >
              Passer le scan <ArrowRight className="size-3" />
            </button>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Step 3: OCR results */}
      <AnimatePresence mode="wait">
        {ocr.hasRun && (ocr.isLoading || ocr.candidates.length > 0) && (
          <motion.section
            key="ocr-results"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="mb-6"
          >
            <OcrResults
              candidates={ocr.candidates}
              isLoading={ocr.isLoading}
              onSelect={handleCandidateSelect}
            />
          </motion.section>
        )}
      </AnimatePresence>

      {/* Scan button when OCR produced no results */}
      <AnimatePresence mode="wait">
        {ocr.hasRun &&
          !ocr.isLoading &&
          ocr.candidates.length > 0 &&
          !showForm && (
            <motion.div
              key="confirm-hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mb-6"
            >
              <div className="text-muted-foreground flex items-center gap-2 text-xs">
                <ScanLine className="size-3.5" />
                <span>Sélectionnez un résultat pour continuer</span>
              </div>
            </motion.div>
          )}
      </AnimatePresence>

      {/* Step 4: Sell form */}
      <AnimatePresence mode="wait">
        {showForm && (
          <motion.section
            key="sell-form"
            ref={formRef}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            <div className="mb-4 flex items-center gap-2">
              <div className="bg-border h-px flex-1" />
              <span className="text-muted-foreground text-xs font-medium">
                Détails de l&apos;annonce
              </span>
              <div className="bg-border h-px flex-1" />
            </div>

            <SellForm
              key={ocr.selectedCardKey ?? "manual"}
              defaultValues={formDefaultValues}
              onSubmit={handleFormSubmit}
              isLoading={createListing.isPending}
            />
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
