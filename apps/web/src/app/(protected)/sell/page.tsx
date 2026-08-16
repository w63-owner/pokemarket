"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, m } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Loader2,
  ScanLine,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ImageUploader,
  type UploadedListingImages,
} from "@/components/sell/image-uploader";
import { OcrResults } from "@/components/sell/ocr-results";
import { SellForm, type SellFormValues } from "@/components/sell/sell-form";
import { useCreateListing } from "@/hooks/use-listings";
import { toCardLanguageSelectValue } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { OcrCandidate, OcrParsed, OcrResponse } from "@/types/api";

type SellStep = 0 | 1 | 2;

type OcrState = {
  isLoading: boolean;
  parsed: OcrParsed | null;
  candidates: OcrCandidate[];
  selectedCardKey: string | null;
  selectedCandidate: OcrCandidate | null;
  hasRun: boolean;
};

const STEPS = ["Photos", "Identification", "Détails"] as const;

const INITIAL_IMAGES: UploadedListingImages = {
  coverUrl: null,
  backUrl: null,
  coverStoragePath: null,
  backStoragePath: null,
};

const INITIAL_OCR: OcrState = {
  isLoading: false,
  parsed: null,
  candidates: [],
  selectedCardKey: null,
  selectedCandidate: null,
  hasRun: false,
};

function candidateDefaults(
  candidate: OcrCandidate | null,
  parsed: OcrParsed | null,
): Partial<SellFormValues> {
  if (candidate) {
    return {
      title: candidate.name,
      card_series: candidate.set_name ?? undefined,
      card_block: candidate.series_name ?? undefined,
      card_number:
        candidate.local_id && candidate.set_official_count
          ? `${candidate.local_id}/${candidate.set_official_count}`
          : (candidate.local_id ?? undefined),
      card_language: toCardLanguageSelectValue(candidate.language) || undefined,
      card_rarity: candidate.rarity ?? undefined,
      card_illustrator: candidate.illustrator ?? undefined,
    };
  }

  if (parsed?.name) {
    return {
      title: parsed.name,
      card_number: parsed.card_number ?? undefined,
      card_language: toCardLanguageSelectValue(parsed.language) || undefined,
    };
  }

  return {};
}

export default function SellPage() {
  const router = useRouter();
  const createListing = useCreateListing();
  const allowNavigationRef = useRef(false);

  const [step, setStep] = useState<SellStep>(0);
  const [direction, setDirection] = useState(1);
  const [images, setImages] = useState<UploadedListingImages>(INITIAL_IMAGES);
  const [ocr, setOcr] = useState<OcrState>(INITIAL_OCR);
  const [identificationConfirmed, setIdentificationConfirmed] = useState(false);
  const [formDraft, setFormDraft] = useState<Partial<SellFormValues>>({});
  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);

  const hasBothImages = Boolean(images.coverUrl && images.backUrl);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (allowNavigationRef.current) return;
      event.preventDefault();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const goToStep = useCallback(
    (nextStep: SellStep) => {
      if (nextStep === 1 && !hasBothImages) return;
      if (nextStep === 2 && !identificationConfirmed) return;
      setDirection(nextStep > step ? 1 : -1);
      setStep(nextStep);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [hasBothImages, identificationConfirmed, step],
  );

  const handleImagesChange = useCallback(
    (next: UploadedListingImages) => {
      const identityChanged =
        images.coverUrl !== next.coverUrl || images.backUrl !== next.backUrl;

      setImages(next);

      if (identityChanged && ocr.hasRun) {
        setOcr(INITIAL_OCR);
        setIdentificationConfirmed(false);
        setFormDraft({});
      }
    },
    [images.backUrl, images.coverUrl, ocr.hasRun],
  );

  const handleOcrScan = useCallback(async () => {
    if (!images.coverUrl) return;

    setIdentificationConfirmed(false);
    setOcr((previous) => ({
      ...previous,
      isLoading: true,
      hasRun: true,
      candidates: [],
      selectedCardKey: null,
      selectedCandidate: null,
    }));

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 55_000);

      let response: Response;
      try {
        response = await fetch("/api/ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_url: images.coverUrl }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Erreur lors du scan");
      }

      const data: OcrResponse = await response.json();
      setOcr((previous) => ({
        ...previous,
        isLoading: false,
        parsed: data.parsed,
        candidates: data.candidates,
      }));

      if (data.candidates.length === 0) {
        setIdentificationConfirmed(true);
        setFormDraft(candidateDefaults(null, data.parsed));
        toast.info(
          data.parsed.name
            ? "Les informations détectées ont été préremplies."
            : "Aucune carte identifiée. Vous pourrez saisir les informations manuellement.",
        );
      }
    } catch (error) {
      const isAbort =
        error instanceof DOMException && error.name === "AbortError";
      toast.error(
        isAbort
          ? "L’analyse a pris trop de temps. Réessayez avec une image plus petite."
          : error instanceof Error
            ? error.message
            : "Erreur lors du scan",
      );
      setOcr((previous) => ({ ...previous, isLoading: false }));
    }
  }, [images.coverUrl]);

  const handleCandidateSelect = useCallback(
    (cardKey: string | null) => {
      const candidate = cardKey
        ? (ocr.candidates.find((item) => item.card_key === cardKey) ?? null)
        : null;

      setOcr((previous) => ({
        ...previous,
        selectedCardKey: cardKey,
        selectedCandidate: candidate,
      }));
      setIdentificationConfirmed(true);
      setFormDraft((previous) => ({
        ...previous,
        ...candidateDefaults(candidate, ocr.parsed),
      }));
    },
    [ocr.candidates, ocr.parsed],
  );

  const handleManualIdentification = useCallback(() => {
    setOcr((previous) => ({
      ...previous,
      selectedCardKey: null,
      selectedCandidate: null,
    }));
    setIdentificationConfirmed(true);
  }, []);

  const handleFormSubmit = useCallback(
    (data: SellFormValues) => {
      if (!images.coverUrl || !images.backUrl) {
        toast.error("Veuillez ajouter les photos recto et verso.");
        goToStep(0);
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
          delivery_weight_class: "S",
          cover_image_url: images.coverUrl,
          back_image_url: images.backUrl,
          card_ref_id: ocr.selectedCandidate?.card_key ?? null,
          card_series: data.card_series ?? null,
          card_block: data.card_block ?? null,
          card_number: data.card_number ?? null,
          card_language: data.card_language ?? null,
          card_rarity: data.card_rarity ?? null,
          card_illustrator: data.card_illustrator ?? null,
        },
        {
          onSuccess: (listing) => {
            allowNavigationRef.current = true;
            toast.success("Annonce publiée avec succès !");
            router.replace(`/listing/${listing.id}`);
          },
        },
      );
    },
    [createListing, goToStep, images, ocr.selectedCandidate, router],
  );

  const discardDraft = useCallback(async () => {
    setIsDiscarding(true);
    const storagePaths = [
      images.coverStoragePath,
      images.backStoragePath,
    ].filter((path): path is string => Boolean(path));

    if (storagePaths.length > 0) {
      const supabase = createClient();
      const { error } = await supabase.storage
        .from("listing-images")
        .remove(storagePaths);

      if (error) {
        toast.error(
          "Impossible de supprimer les photos du brouillon. Veuillez réessayer.",
        );
        setIsDiscarding(false);
        return;
      }
    }

    setImages(INITIAL_IMAGES);
    setOcr(INITIAL_OCR);
    setFormDraft({});
    setIdentificationConfirmed(false);
    allowNavigationRef.current = true;
    router.replace("/");
  }, [images.backStoragePath, images.coverStoragePath, router]);

  const formDefaultValues = useMemo(
    () => ({
      ...candidateDefaults(ocr.selectedCandidate, ocr.parsed),
      ...formDraft,
    }),
    [formDraft, ocr.parsed, ocr.selectedCandidate],
  );

  return (
    <div className="bg-background fixed inset-0 z-40 flex min-h-dvh flex-col overflow-hidden">
      <header className="border-border bg-background/95 shrink-0 border-b pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-3">
          <button
            type="button"
            onClick={() => setExitDialogOpen(true)}
            className="hover:bg-muted flex size-11 items-center justify-center rounded-full transition-colors"
            aria-label="Quitter la création de l’annonce"
          >
            <X className="size-5" />
          </button>
          <div className="text-center">
            <h1 className="font-heading text-sm font-semibold">
              Créer une annonce
            </h1>
            <p className="text-muted-foreground text-xs">
              Étape {step + 1} sur {STEPS.length}
            </p>
          </div>
          <div className="size-11" aria-hidden="true" />
        </div>

        <nav
          aria-label="Étapes de création"
          className="mx-auto grid w-full max-w-3xl grid-cols-3 gap-2 px-4 pb-3"
        >
          {STEPS.map((label, index) => {
            const target = index as SellStep;
            const enabled =
              target === 0 ||
              (target === 1 && hasBothImages) ||
              (target === 2 && identificationConfirmed);

            return (
              <button
                key={label}
                type="button"
                disabled={!enabled}
                onClick={() => goToStep(target)}
                className="group space-y-1.5 text-left disabled:cursor-not-allowed"
                aria-current={step === target ? "step" : undefined}
              >
                <span
                  className={cn(
                    "block h-1 rounded-full transition-colors",
                    index <= step && enabled ? "bg-brand" : "bg-muted",
                  )}
                />
                <span
                  className={cn(
                    "block truncate text-[11px] font-medium transition-colors sm:text-xs",
                    step === target
                      ? "text-foreground"
                      : "text-muted-foreground",
                    !enabled && "opacity-45",
                  )}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </nav>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-lg px-4 py-6 pb-[calc(6rem+env(safe-area-inset-bottom))]">
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <m.section
              key={step}
              custom={direction}
              initial={{ opacity: 0, x: direction * 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -24 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {step === 0 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="font-heading text-xl font-bold">
                      Photographiez votre carte
                    </h2>
                    <p className="text-muted-foreground mt-1 text-sm">
                      Ajoutez un recto et un verso nets, sans reflet.
                    </p>
                  </div>
                  <ImageUploader
                    initialCoverUrl={images.coverUrl}
                    initialBackUrl={images.backUrl}
                    initialCoverStoragePath={images.coverStoragePath}
                    initialBackStoragePath={images.backStoragePath}
                    onImagesChange={handleImagesChange}
                  />
                </div>
              )}

              {step === 1 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="font-heading text-xl font-bold">
                      Identifiez la carte
                    </h2>
                    <p className="text-muted-foreground mt-1 text-sm">
                      L’IA peut retrouver automatiquement la série, le numéro et
                      la rareté.
                    </p>
                  </div>

                  {!ocr.hasRun && (
                    <div className="space-y-3">
                      <Button
                        type="button"
                        className="w-full gap-2"
                        onClick={handleOcrScan}
                      >
                        <Sparkles className="size-4" />
                        Scanner la carte avec l’IA
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full"
                        onClick={handleManualIdentification}
                      >
                        Saisir les informations manuellement
                      </Button>
                    </div>
                  )}

                  {ocr.hasRun && (
                    <>
                      <OcrResults
                        candidates={ocr.candidates}
                        isLoading={ocr.isLoading}
                        selectedCardKey={ocr.selectedCardKey}
                        manualSelected={
                          identificationConfirmed &&
                          ocr.selectedCardKey === null
                        }
                        onSelect={handleCandidateSelect}
                      />

                      {!ocr.isLoading && ocr.candidates.length === 0 && (
                        <div className="border-border bg-card space-y-4 rounded-xl border p-4">
                          <div className="flex items-start gap-3">
                            <ScanLine className="text-brand mt-0.5 size-5 shrink-0" />
                            <div>
                              <p className="font-medium">
                                {ocr.parsed?.name
                                  ? "Informations partielles détectées"
                                  : "Identification manuelle"}
                              </p>
                              <p className="text-muted-foreground mt-1 text-sm">
                                Vous pourrez vérifier et compléter les champs à
                                l’étape suivante.
                              </p>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full"
                            onClick={handleOcrScan}
                          >
                            Relancer l’analyse
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {step === 2 && (
                <div className="space-y-5">
                  <div>
                    <button
                      type="button"
                      onClick={() => goToStep(1)}
                      className="text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1 text-sm transition-colors"
                    >
                      <ArrowLeft className="size-4" />
                      Modifier l’identification
                    </button>
                    <h2 className="font-heading text-xl font-bold">
                      Finalisez l’annonce
                    </h2>
                    <p className="text-muted-foreground mt-1 text-sm">
                      Vérifiez les informations, l’état et votre prix vendeur.
                    </p>
                  </div>

                  <SellForm
                    key={ocr.selectedCardKey ?? "manual"}
                    cardKey={ocr.selectedCardKey}
                    defaultValues={formDefaultValues}
                    onValuesChange={setFormDraft}
                    onSubmit={handleFormSubmit}
                    isLoading={createListing.isPending}
                  />
                </div>
              )}
            </m.section>
          </AnimatePresence>
        </div>
      </main>

      {step < 2 && (
        <footer className="border-border bg-background/95 shrink-0 border-t px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-lg gap-3">
            {step > 0 && (
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => goToStep((step - 1) as SellStep)}
              >
                <ArrowLeft className="size-4" />
                Retour
              </Button>
            )}
            <Button
              type="button"
              className="flex-1"
              disabled={
                (step === 0 && !hasBothImages) ||
                (step === 1 && !identificationConfirmed) ||
                ocr.isLoading
              }
              onClick={() => goToStep((step + 1) as SellStep)}
            >
              Continuer
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </footer>
      )}

      <Dialog open={exitDialogOpen} onOpenChange={setExitDialogOpen}>
        <DialogContent showCloseButton={!isDiscarding}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="text-destructive size-5" />
              Interrompre la création ?
            </DialogTitle>
            <DialogDescription>
              Voulez-vous interrompre la création de votre annonce ? Toutes les
              informations et les photos ajoutées seront supprimées.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isDiscarding}
              onClick={() => setExitDialogOpen(false)}
            >
              Continuer mon annonce
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isDiscarding}
              onClick={discardDraft}
            >
              {isDiscarding ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              {isDiscarding ? "Suppression…" : "Quitter et supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
