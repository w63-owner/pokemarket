import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AlertTriangle, Trash2 } from "lucide-react-native";
import { toCardLanguageSelectValue, type Listing } from "@pokemarket/shared";
import {
  useDeleteListing,
  useOwnedListing,
  useUpdateListing,
} from "@/hooks/use-listings";
import {
  ImageUploader,
  SellForm,
  type SellFormValues,
} from "@/components/sell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { MobileHeader } from "@/components/layout/mobile-header";
import type { UploadedListingImage } from "@/lib/api/listings";

export default function EditListingScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = params.id ?? "";
  const { data: listing, isLoading, error } = useOwnedListing(id);
  const updateListing = useUpdateListing();
  const deleteListing = useDeleteListing();

  const [images, setImages] = useState<{
    cover: UploadedListingImage | null;
    back: UploadedListingImage | null;
  } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleSubmit = useCallback(
    (data: SellFormValues) => {
      if (!listing) return;

      const coverUrl =
        images?.cover?.publicUrl ?? listing.cover_image_url ?? null;
      const backUrl = images?.back?.publicUrl ?? listing.back_image_url ?? null;

      if (!coverUrl || !backUrl) {
        toast.error("Photos manquantes", "Recto et verso obligatoires");
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
          cover_image_url: coverUrl,
          back_image_url: backUrl,
          card_series: data.card_series ?? null,
          card_block: data.card_block ?? null,
          card_number: data.card_number ?? null,
          card_language: data.card_language ?? null,
          card_rarity: data.card_rarity ?? null,
          card_illustrator: data.card_illustrator ?? null,
        },
        {
          onSuccess: (updated) => {
            toast.success("Annonce modifiée");
            router.replace(`/listing/${updated.id}`);
          },
        },
      );
    },
    [images, listing, updateListing],
  );

  const handleDelete = useCallback(() => {
    if (!listing) return;
    deleteListing.mutate(listing.id, {
      onSuccess: () => {
        setDeleteOpen(false);
        toast.success("Annonce supprimée");
        router.replace("/profile/listings");
      },
    });
  }, [deleteListing, listing]);

  if (isLoading || (!listing && !error)) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color="#E63946" />
      </SafeAreaView>
    );
  }

  if (error || !listing) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center gap-3 bg-background px-8"
        edges={["top"]}
      >
        <AlertTriangle size={28} color="#dc2626" />
        <Text variant="muted">Annonce introuvable ou accès refusé</Text>
        <Button onPress={() => router.back()}>Retour</Button>
      </SafeAreaView>
    );
  }

  const defaults = buildFormDefaults(listing);

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: false }} />

      <MobileHeader
        title="Modifier l’annonce"
        fallbackHref={`/listing/${listing.id}`}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
          keyboardShouldPersistTaps="handled"
        >
          <ImageUploader
            onImagesChange={setImages}
            initialCover={
              listing.cover_image_url
                ? {
                    publicUrl: listing.cover_image_url,
                    storagePath: extractStoragePath(listing.cover_image_url),
                  }
                : null
            }
            initialBack={
              listing.back_image_url
                ? {
                    publicUrl: listing.back_image_url,
                    storagePath: extractStoragePath(listing.back_image_url),
                  }
                : null
            }
          />

          <View className="my-6 flex-row items-center gap-2">
            <View className="h-px flex-1 bg-border" />
            <Text variant="caption">Détails</Text>
            <View className="h-px flex-1 bg-border" />
          </View>

          <SellForm
            defaultValues={defaults}
            onSubmit={handleSubmit}
            isLoading={updateListing.isPending}
            submitLabel="Enregistrer les modifications"
          />

          <Button
            variant="destructive"
            className="mt-6"
            leftIcon={<Trash2 size={16} color="#fff" />}
            onPress={() => setDeleteOpen(true)}
            disabled={updateListing.isPending}
          >
            Supprimer l&apos;annonce
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogHeader>
          <DialogTitle>Supprimer l&apos;annonce</DialogTitle>
          <DialogDescription>
            Cette action est irréversible. Votre annonce sera définitivement
            supprimée.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onPress={() => setDeleteOpen(false)}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            onPress={handleDelete}
            loading={deleteListing.isPending}
            leftIcon={<Trash2 size={14} color="#fff" />}
          >
            Supprimer
          </Button>
        </DialogFooter>
      </Dialog>
    </View>
  );
}

function buildFormDefaults(listing: Listing): Partial<SellFormValues> {
  return {
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
}

/**
 * Best-effort: derive the Supabase Storage path from a public URL.
 * Public URL format:
 *   https://<project>.supabase.co/storage/v1/object/public/listing-images/<userId>/<filename>
 * We strip everything up to and including "/listing-images/" to get the path
 * that Storage APIs expect.
 */
function extractStoragePath(publicUrl: string): string {
  const marker = "/listing-images/";
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return "";
  return publicUrl.slice(idx + marker.length);
}
