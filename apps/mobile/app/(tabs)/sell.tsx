import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, Pressable, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AnimatePresence, MotiView } from "moti";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  PlusCircle,
  ScanLine,
  Sparkles,
  Trash2,
  X,
} from "lucide-react-native";
import {
  FEATURE_FLAGS,
  toCardLanguageSelectValue,
  type OcrCandidate,
  type OcrParsed,
  type OcrResponse,
} from "@deckdealr/shared";

import { TabHeader } from "@/components/layout";
import {
  ImageUploader,
  OcrResults,
  SellForm,
  SellStepIndicator,
  type SellFormValues,
  type SellStep,
} from "@/components/sell";
import { AuthRequired } from "@/components/shared";
import { FeatureGate } from "@/components/feature-flags/feature-gate";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormScrollView } from "@/components/ui/form-scroll-view";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/use-auth";
import { useCreateListing } from "@/hooks/use-listings";
import { useSellDraft } from "@/hooks/use-sell-draft";
import { ApiError } from "@/lib/api/client";
import {
  removeListingImage,
  type UploadedListingImage,
} from "@/lib/api/listings";
import { runOcrScan } from "@/lib/api/ocr";
import { duration } from "@/lib/motion";
import { useThemeColor } from "@/lib/theme-colors";

type OcrState = {
  isLoading: boolean;
  parsed: OcrParsed | null;
  candidates: OcrCandidate[];
  selectedCardKey: string | null;
  selectedCandidate: OcrCandidate | null;
  hasRun: boolean;
};

type ListingImages = {
  cover: UploadedListingImage | null;
  back: UploadedListingImage | null;
};

const INITIAL_IMAGES: ListingImages = { cover: null, back: null };

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

function SellContent() {
  const { user, loading: authLoading } = useAuth();
  const createListing = useCreateListing();
  const primary = useThemeColor("primary");
  const primaryForeground = useThemeColor("primaryForeground");
  const mutedForeground = useThemeColor("mutedForeground");
  const destructiveForeground = useThemeColor("destructiveForeground");
  const {
    draft,
    hydrated,
    update: updateDraft,
    clear: clearDraft,
  } = useSellDraft();

  const [step, setStep] = useState<SellStep>(1);
  const [direction, setDirection] = useState(1);
  const [images, setImages] = useState<ListingImages>(INITIAL_IMAGES);
  const [ocr, setOcr] = useState<OcrState>(INITIAL_OCR);
  const [identificationConfirmed, setIdentificationConfirmed] = useState(false);
  const [formDraft, setFormDraft] = useState<Partial<SellFormValues>>({});
  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const hasRestoredDraft = useRef(false);

  useEffect(() => {
    if (!hydrated || hasRestoredDraft.current) return;
    hasRestoredDraft.current = true;
    if (!draft) return;

    const restoredImages = {
      cover: draft.cover ?? null,
      back: draft.back ?? null,
    };
    const hasBothRestored = Boolean(
      restoredImages.cover && restoredImages.back,
    );
    const restoredIdentification = Boolean(draft.identificationConfirmed);
    const restoredStep =
      draft.step === 3 && hasBothRestored && restoredIdentification
        ? 3
        : draft.step === 2 && hasBothRestored
          ? 2
          : 1;

    setImages(restoredImages);
    setFormDraft((draft.form ?? {}) as Partial<SellFormValues>);
    setIdentificationConfirmed(restoredIdentification);
    setStep(restoredStep);
    if (draft.ocr) {
      setOcr({
        ...INITIAL_OCR,
        hasRun: true,
        selectedCardKey: draft.ocr.selectedCardKey,
        parsed: {
          name: draft.ocr.parsedName,
          card_number: draft.ocr.parsedCardNumber,
          language: draft.ocr.parsedLanguage,
        },
      });
    }
  }, [draft, hydrated]);

  const hasBothImages = Boolean(images.cover && images.back);
  const hasDraft = Boolean(
    images.cover || images.back || Object.keys(formDraft).length > 0,
  );

  const goToStep = useCallback(
    (nextStep: SellStep) => {
      if (nextStep === 2 && !hasBothImages) return;
      if (nextStep === 3 && !identificationConfirmed) return;
      setDirection(nextStep > step ? 1 : -1);
      setStep(nextStep);
      updateDraft({ step: nextStep });
    },
    [hasBothImages, identificationConfirmed, step, updateDraft],
  );

  const requestExit = useCallback(() => {
    if (hasDraft) {
      setExitDialogOpen(true);
      return;
    }
    router.replace("/");
  }, [hasDraft]);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        () => {
          if (step > 1) {
            goToStep((step - 1) as SellStep);
          } else {
            requestExit();
          }
          return true;
        },
      );
      return () => subscription.remove();
    }, [goToStep, requestExit, step]),
  );

  const handleImagesChange = useCallback(
    (next: ListingImages) => {
      const identityChanged =
        images.cover?.storagePath !== next.cover?.storagePath ||
        images.back?.storagePath !== next.back?.storagePath;

      setImages(next);
      updateDraft({ cover: next.cover, back: next.back });

      if (identityChanged && ocr.hasRun) {
        setOcr(INITIAL_OCR);
        setIdentificationConfirmed(false);
        setFormDraft({});
        updateDraft({
          identificationConfirmed: false,
          form: null,
          ocr: null,
          step: 1,
        });
      }
    },
    [
      images.back?.storagePath,
      images.cover?.storagePath,
      ocr.hasRun,
      updateDraft,
    ],
  );

  const handleOcrScan = useCallback(async () => {
    if (!images.cover) return;

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
      const data: OcrResponse = await runOcrScan(images.cover.publicUrl);
      setOcr((previous) => ({
        ...previous,
        isLoading: false,
        parsed: data.parsed,
        candidates: data.candidates,
      }));

      if (data.candidates.length === 0) {
        const defaults = candidateDefaults(null, data.parsed);
        setIdentificationConfirmed(true);
        setFormDraft((previous) => ({ ...previous, ...defaults }));
        updateDraft({
          identificationConfirmed: true,
          form: { ...formDraft, ...defaults },
          ocr: {
            selectedCardKey: null,
            parsedName: data.parsed.name,
            parsedCardNumber: data.parsed.card_number,
            parsedLanguage: data.parsed.language,
          },
        });
        toast.info(
          data.parsed.name
            ? "Informations partielles détectées"
            : "Identification manuelle",
          "Vous pourrez vérifier et compléter les champs à l’étape suivante.",
        );
      }
    } catch (error) {
      setOcr((previous) => ({ ...previous, isLoading: false }));
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Erreur lors du scan";
      toast.error("Échec du scan", message);
    }
  }, [formDraft, images.cover, updateDraft]);

  const handleContinue = useCallback(() => {
    if (step === 1) {
      goToStep(2);
      void handleOcrScan();
      return;
    }

    goToStep((step + 1) as SellStep);
  }, [goToStep, handleOcrScan, step]);

  const handleCandidateSelect = useCallback(
    (cardKey: string | null) => {
      const candidate = cardKey
        ? (ocr.candidates.find((item) => item.card_key === cardKey) ?? null)
        : null;
      const defaults = candidateDefaults(candidate, ocr.parsed);

      setOcr((previous) => ({
        ...previous,
        selectedCardKey: cardKey,
        selectedCandidate: candidate,
      }));
      setIdentificationConfirmed(true);
      setFormDraft((previous) => ({ ...previous, ...defaults }));
      updateDraft({
        identificationConfirmed: true,
        form: { ...formDraft, ...defaults },
        ocr: {
          selectedCardKey: cardKey,
          parsedName: ocr.parsed?.name ?? null,
          parsedCardNumber: ocr.parsed?.card_number ?? null,
          parsedLanguage: ocr.parsed?.language ?? null,
        },
      });
    },
    [formDraft, ocr.candidates, ocr.parsed, updateDraft],
  );

  const handleManualIdentification = useCallback(() => {
    setOcr((previous) => ({
      ...previous,
      selectedCardKey: null,
      selectedCandidate: null,
    }));
    setIdentificationConfirmed(true);
    updateDraft({
      identificationConfirmed: true,
      ocr: {
        selectedCardKey: null,
        parsedName: ocr.parsed?.name ?? null,
        parsedCardNumber: ocr.parsed?.card_number ?? null,
        parsedLanguage: ocr.parsed?.language ?? null,
      },
    });
  }, [ocr.parsed, updateDraft]);

  const handleFormValuesChange = useCallback(
    (values: Partial<SellFormValues>) => {
      setFormDraft(values);
      updateDraft({ form: values });
    },
    [updateDraft],
  );

  const handleSubmit = useCallback(
    (data: SellFormValues) => {
      if (!images.cover || !images.back) {
        toast.error("Photos manquantes", "Recto et verso obligatoires");
        return;
      }

      createListing.mutate(
        {
          title: data.title,
          description: data.description || null,
          price_seller: data.price_seller,
          condition: data.is_graded ? null : (data.condition ?? null),
          is_graded: data.is_graded,
          grading_company: data.is_graded
            ? (data.grading_company ?? null)
            : null,
          grade_note: data.is_graded ? (data.grade_note ?? null) : null,
          delivery_weight_class: "S",
          cover_image_url: images.cover.publicUrl,
          back_image_url: images.back.publicUrl,
          card_ref_id: ocr.selectedCardKey,
          card_series: data.card_series ?? null,
          card_block: data.card_block ?? null,
          card_number: data.card_number ?? null,
          card_language: data.card_language ?? null,
          card_rarity: data.card_rarity ?? null,
          card_illustrator: data.card_illustrator ?? null,
        },
        {
          onSuccess: (listing) => {
            toast.success("Annonce publiée !");
            setImages(INITIAL_IMAGES);
            setOcr(INITIAL_OCR);
            setFormDraft({});
            setIdentificationConfirmed(false);
            setStep(1);
            void clearDraft();
            router.replace(`/listing/${listing.id}`);
          },
        },
      );
    },
    [clearDraft, createListing, images.back, images.cover, ocr.selectedCardKey],
  );

  const discardDraft = useCallback(async () => {
    setIsDiscarding(true);
    try {
      const paths = [
        images.cover?.storagePath,
        images.back?.storagePath,
      ].filter((path): path is string => Boolean(path));
      await Promise.all(paths.map(removeListingImage));
      await clearDraft();
      setImages(INITIAL_IMAGES);
      setOcr(INITIAL_OCR);
      setFormDraft({});
      setIdentificationConfirmed(false);
      setStep(1);
      setExitDialogOpen(false);
      router.replace("/");
    } catch {
      toast.error(
        "Suppression impossible",
        "Veuillez réessayer avant de quitter.",
      );
    } finally {
      setIsDiscarding(false);
    }
  }, [clearDraft, images.back?.storagePath, images.cover?.storagePath]);

  const formDefaultValues = useMemo(
    () => ({
      ...candidateDefaults(ocr.selectedCandidate, ocr.parsed),
      ...formDraft,
    }),
    [formDraft, ocr.parsed, ocr.selectedCandidate],
  );

  if (!authLoading && !user) {
    return (
      <View className="flex-1 bg-background">
        <TabHeader
          title="Vendre une carte"
          right={
            <Pressable
              onPress={() => router.replace("/")}
              accessibilityRole="button"
              accessibilityLabel="Quitter la création"
              hitSlop={8}
              className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
            >
              <X size={22} color={mutedForeground} />
            </Pressable>
          }
        />
        <SafeAreaView className="flex-1" edges={["bottom"]}>
          <AuthRequired
            icon={<PlusCircle size={28} color={mutedForeground} />}
            title="Connecte-toi pour vendre"
            description="Crée ou connecte-toi à ton compte pour publier ta première annonce."
          />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <TabHeader
        title="Vendre une carte"
        subtitle={`Étape ${step} sur 3`}
        right={
          <Pressable
            onPress={requestExit}
            accessibilityRole="button"
            accessibilityLabel="Quitter la création"
            hitSlop={8}
            className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
          >
            <X size={22} color={mutedForeground} />
          </Pressable>
        }
      />
      <SellStepIndicator current={step} />

      <FormScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      >
        <AnimatePresence exitBeforeEnter>
          <MotiView
            key={`sell-step-${step}`}
            from={{ opacity: 0, translateX: direction * 20 }}
            animate={{ opacity: 1, translateX: 0 }}
            exit={{ opacity: 0, translateX: direction * -20 }}
            transition={{ type: "timing", duration: duration.fast }}
          >
            {step === 1 ? (
              <View className="gap-6">
                <View>
                  <Text variant="h3">Photographiez votre carte</Text>
                  <Text variant="muted" className="mt-1">
                    Ajoutez un recto et un verso nets, sans reflet.
                  </Text>
                </View>
                <ImageUploader
                  key={`${images.cover?.storagePath ?? "none"}-${images.back?.storagePath ?? "none"}`}
                  initialCover={images.cover}
                  initialBack={images.back}
                  onImagesChange={handleImagesChange}
                />
              </View>
            ) : null}

            {step === 2 ? (
              <View className="gap-6">
                <View>
                  <Text variant="h3">Identifiez la carte</Text>
                  <Text variant="muted" className="mt-1">
                    L&apos;IA peut retrouver automatiquement la série, le numéro
                    et la rareté.
                  </Text>
                </View>

                {!ocr.hasRun ? (
                  <View className="gap-3">
                    <Button
                      onPress={handleOcrScan}
                      leftIcon={
                        <Sparkles size={16} color={primaryForeground} />
                      }
                    >
                      Scanner la carte avec l&apos;IA
                    </Button>
                    <Button
                      onPress={handleManualIdentification}
                      variant="ghost"
                    >
                      Saisir les informations manuellement
                    </Button>
                  </View>
                ) : (
                  <View className="gap-4">
                    <OcrResults
                      candidates={ocr.candidates}
                      isLoading={ocr.isLoading}
                      selectedCardKey={ocr.selectedCardKey}
                      manualSelected={
                        identificationConfirmed && ocr.selectedCardKey === null
                      }
                      onSelect={handleCandidateSelect}
                    />

                    {!ocr.isLoading && ocr.candidates.length === 0 ? (
                      <View className="gap-4 rounded-2xl border border-border bg-card p-4">
                        <View className="flex-row items-start gap-3">
                          <ScanLine size={20} color={primary} />
                          <View className="flex-1">
                            <Text className="font-semibold">
                              {ocr.parsed?.name
                                ? "Informations partielles détectées"
                                : "Identification manuelle"}
                            </Text>
                            <Text variant="muted" className="mt-1">
                              Vous pourrez vérifier et compléter les champs à
                              l&apos;étape suivante.
                            </Text>
                          </View>
                        </View>
                        <Button onPress={handleOcrScan} variant="outline">
                          Relancer l&apos;analyse
                        </Button>
                      </View>
                    ) : null}
                  </View>
                )}
              </View>
            ) : null}

            {step === 3 ? (
              <View className="gap-5">
                <Pressable
                  onPress={() => goToStep(2)}
                  hitSlop={8}
                  className="flex-row items-center gap-1"
                >
                  <ArrowLeft size={16} color={mutedForeground} />
                  <Text variant="muted">Modifier l&apos;identification</Text>
                </Pressable>
                <View>
                  <Text variant="h3">Finalisez l&apos;annonce</Text>
                  <Text variant="muted" className="mt-1">
                    Vérifiez les informations, l&apos;état et votre prix
                    vendeur.
                  </Text>
                </View>
                <SellForm
                  key={ocr.selectedCardKey ?? "manual"}
                  cardKey={ocr.selectedCardKey}
                  defaultValues={formDefaultValues}
                  onValuesChange={handleFormValuesChange}
                  onSubmit={handleSubmit}
                  isLoading={createListing.isPending}
                />
              </View>
            ) : null}
          </MotiView>
        </AnimatePresence>
      </FormScrollView>

      {step < 3 ? (
        <SafeAreaView
          edges={["bottom"]}
          className="border-t border-border bg-background"
        >
          <View className="flex-row gap-3 px-4 py-3">
            {step > 1 ? (
              <Button
                variant="outline"
                className="flex-1"
                onPress={() => goToStep((step - 1) as SellStep)}
                leftIcon={<ArrowLeft size={16} color={mutedForeground} />}
              >
                Retour
              </Button>
            ) : null}
            <Button
              className="flex-1"
              disabled={
                (step === 1 && !hasBothImages) ||
                (step === 2 && !identificationConfirmed) ||
                ocr.isLoading
              }
              onPress={handleContinue}
              rightIcon={<ArrowRight size={16} color={primaryForeground} />}
            >
              Continuer
            </Button>
          </View>
        </SafeAreaView>
      ) : null}

      <Dialog open={exitDialogOpen} onOpenChange={setExitDialogOpen}>
        <DialogHeader>
          <View className="mb-2 flex-row items-center gap-2">
            <AlertTriangle size={20} color={primary} />
            <DialogTitle>Interrompre la création ?</DialogTitle>
          </View>
          <DialogDescription>
            Toutes les informations et les photos ajoutées seront supprimées.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            className="flex-1"
            disabled={isDiscarding}
            onPress={() => setExitDialogOpen(false)}
          >
            Continuer
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            loading={isDiscarding}
            disabled={isDiscarding}
            onPress={discardDraft}
            leftIcon={<Trash2 size={16} color={destructiveForeground} />}
          >
            Supprimer
          </Button>
        </DialogFooter>
      </Dialog>
    </View>
  );
}

export default function SellScreen() {
  return (
    <FeatureGate flag={FEATURE_FLAGS.SELLING} name="La mise en vente">
      <SellContent />
    </FeatureGate>
  );
}
