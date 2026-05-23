import { useCallback, useEffect, useState } from "react";
import { ScrollView, View, KeyboardAvoidingView, Platform } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowRight, ScanLine, Sparkles } from "lucide-react-native";
import { MotiView, AnimatePresence } from "moti";
import {
  toCardLanguageSelectValue,
  type OcrCandidate,
  type OcrParsed,
  type OcrResponse,
} from "@pokemarket/shared";
import { useAuth } from "@/hooks/use-auth";
import { useCreateListing } from "@/hooks/use-listings";
import { useSellDraft } from "@/hooks/use-sell-draft";
import {
  ImageUploader,
  OcrResults,
  SellForm,
  type SellFormValues,
} from "@/components/sell";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/client";
import { runOcrScan } from "@/lib/api/ocr";
import type { UploadedListingImage } from "@/lib/api/listings";
import { useThemeColor } from "@/lib/theme-colors";
import { duration } from "@/lib/motion";

type OcrState = {
  isLoading: boolean;
  parsed: OcrParsed | null;
  candidates: OcrCandidate[];
  selectedCardKey: string | null;
  selectedCandidate: OcrCandidate | null;
  hasRun: boolean;
};

const INITIAL_OCR: OcrState = {
  isLoading: false,
  parsed: null,
  candidates: [],
  selectedCardKey: null,
  selectedCandidate: null,
  hasRun: false,
};

export default function SellScreen() {
  const { user, loading: authLoading } = useAuth();
  const createListing = useCreateListing();
  const primaryForeground = useThemeColor("primaryForeground");
  const mutedForeground = useThemeColor("mutedForeground");
  const {
    draft,
    hydrated,
    update: updateDraft,
    clear: clearDraft,
  } = useSellDraft();

  const [images, setImages] = useState<{
    cover: UploadedListingImage | null;
    back: UploadedListingImage | null;
  }>({ cover: null, back: null });
  const [ocr, setOcr] = useState<OcrState>(INITIAL_OCR);
  const [showForm, setShowForm] = useState(false);

  // Restore previously persisted draft (cover/back images) once on hydration.
  // We don't restore form fields here — RHF is the source of truth and the
  // wizard reopens on the photo step anyway.
  useEffect(() => {
    if (!hydrated || !draft) return;
    if (draft.cover || draft.back) {
      setImages({
        cover: draft.cover ?? null,
        back: draft.back ?? null,
      });
    }
  }, [hydrated, draft]);

  const hasBothImages = !!images.cover && !!images.back;

  const handleImagesChange = useCallback(
    (next: {
      cover: UploadedListingImage | null;
      back: UploadedListingImage | null;
    }) => {
      setImages(next);
      updateDraft({ cover: next.cover, back: next.back });
      if ((!next.cover || !next.back) && ocr.hasRun) {
        setOcr(INITIAL_OCR);
        setShowForm(false);
      }
    },
    [ocr.hasRun, updateDraft],
  );

  const handleOcrScan = useCallback(async () => {
    if (!images.cover) return;
    setOcr((prev) => ({
      ...prev,
      isLoading: true,
      hasRun: true,
      candidates: [],
    }));

    try {
      const data: OcrResponse = await runOcrScan(images.cover.publicUrl);
      setOcr((prev) => ({
        ...prev,
        isLoading: false,
        parsed: data.parsed,
        candidates: data.candidates,
      }));

      if (data.candidates.length === 0) {
        toast.info(
          data.parsed.name
            ? "Carte non trouvée dans le catalogue"
            : "Aucune carte identifiée",
          data.parsed.name
            ? "Les champs ont été pré-remplis."
            : "Remplissez le formulaire manuellement.",
        );
        setShowForm(true);
      }
    } catch (err) {
      setOcr((prev) => ({ ...prev, isLoading: false }));
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Erreur lors du scan";
      toast.error("Échec du scan", message);
    }
  }, [images.cover]);

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
    },
    [ocr.candidates],
  );

  const handleSkipOcr = useCallback(() => setShowForm(true), []);

  const handleSubmit = useCallback(
    (data: SellFormValues) => {
      if (!images.cover || !images.back) {
        toast.error("Photos manquantes", "Recto et verso obligatoires");
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
          cover_image_url: images.cover.publicUrl,
          back_image_url: images.back.publicUrl,
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
            toast.success("Annonce publiée !");
            setImages({ cover: null, back: null });
            setOcr(INITIAL_OCR);
            setShowForm(false);
            void clearDraft();
            router.push(`/listing/${listing.id}`);
          },
        },
      );
    },
    [
      clearDraft,
      createListing,
      images.back,
      images.cover,
      ocr.selectedCandidate,
    ],
  );

  const formDefaultValues: Partial<SellFormValues> | undefined =
    ocr.selectedCandidate
      ? {
          title: ocr.selectedCandidate.name,
          card_series: ocr.selectedCandidate.set_name ?? undefined,
          card_block: ocr.selectedCandidate.series_name ?? undefined,
          card_number:
            ocr.selectedCandidate.local_id &&
            ocr.selectedCandidate.set_official_count
              ? `${ocr.selectedCandidate.local_id}/${ocr.selectedCandidate.set_official_count}`
              : (ocr.selectedCandidate.local_id ?? undefined),
          card_language:
            toCardLanguageSelectValue(ocr.selectedCandidate.language) ||
            undefined,
          card_rarity: ocr.selectedCandidate.rarity ?? undefined,
          card_illustrator: ocr.selectedCandidate.illustrator ?? undefined,
        }
      : ocr.parsed?.name
        ? {
            title: ocr.parsed.name,
            card_number: ocr.parsed.card_number ?? undefined,
            card_language:
              toCardLanguageSelectValue(ocr.parsed.language) || undefined,
          }
        : undefined;

  if (!authLoading && !user) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center gap-3 bg-background px-8"
        edges={["top"]}
      >
        <Text variant="h3">Connectez-vous pour vendre</Text>
        <Text variant="muted" className="text-center">
          Vous devez avoir un compte pour publier une annonce.
        </Text>
        <Button onPress={() => router.push("/(auth)/login")} className="mt-2">
          Se connecter
        </Button>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="border-b border-border px-4 py-3">
        <Text variant="h3">Vendre une carte</Text>
        <Text variant="muted" className="mt-0.5">
          Photos, identification IA, prix.
        </Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
          keyboardShouldPersistTaps="handled"
        >
          <ImageUploader onImagesChange={handleImagesChange} />

          <AnimatePresence>
            {hasBothImages && !ocr.hasRun ? (
              <MotiView
                key="ocr-trigger"
                from={{ opacity: 0, translateY: 12 }}
                animate={{ opacity: 1, translateY: 0 }}
                exit={{ opacity: 0 }}
                transition={{ type: "timing", duration: duration.normal }}
                className="mt-6 gap-3"
              >
                <Button
                  onPress={handleOcrScan}
                  loading={ocr.isLoading}
                  leftIcon={<Sparkles size={16} color={primaryForeground} />}
                >
                  Scanner la carte avec l&apos;IA
                </Button>
                <Button
                  onPress={handleSkipOcr}
                  variant="ghost"
                  rightIcon={<ArrowRight size={14} color={mutedForeground} />}
                >
                  <Text variant="muted">Passer le scan</Text>
                </Button>
              </MotiView>
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {ocr.hasRun && (ocr.isLoading || ocr.candidates.length > 0) ? (
              <MotiView
                key="ocr-results"
                from={{ opacity: 0, translateY: 12 }}
                animate={{ opacity: 1, translateY: 0 }}
                exit={{ opacity: 0 }}
                transition={{ type: "timing", duration: duration.normal }}
                className="mt-6"
              >
                <OcrResults
                  candidates={ocr.candidates}
                  isLoading={ocr.isLoading}
                  onSelect={handleCandidateSelect}
                />
              </MotiView>
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {ocr.hasRun &&
            !ocr.isLoading &&
            ocr.candidates.length > 0 &&
            !showForm ? (
              <MotiView
                key="confirm-hint"
                from={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mt-3 flex-row items-center gap-2"
              >
                <ScanLine size={14} color={mutedForeground} />
                <Text variant="caption">
                  Sélectionnez un résultat pour continuer
                </Text>
              </MotiView>
            ) : null}
          </AnimatePresence>

          {showForm ? (
            <MotiView
              key={`form-${ocr.selectedCardKey ?? "manual"}`}
              from={{ opacity: 0, translateY: 16 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: "timing", duration: duration.normal }}
              className="mt-8"
            >
              <View className="mb-4 flex-row items-center gap-2">
                <View className="h-px flex-1 bg-border" />
                <Text variant="caption">Détails de l&apos;annonce</Text>
                <View className="h-px flex-1 bg-border" />
              </View>

              <SellForm
                key={ocr.selectedCardKey ?? (ocr.parsed ? "parsed" : "manual")}
                defaultValues={formDefaultValues}
                onSubmit={handleSubmit}
                isLoading={createListing.isPending}
              />
            </MotiView>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
