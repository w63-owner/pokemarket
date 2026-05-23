import { useEffect, useState } from "react";
import { Keyboard, View } from "react-native";
import { Bookmark } from "lucide-react-native";
import {
  type FeedFilters,
  filtersToLabel,
  suggestSearchName,
} from "@pokemarket/shared";

import {
  Button,
  Input,
  Label,
  Sheet,
  SheetScrollView,
  Text,
} from "@/components/ui";
import { useCreateSavedSearch } from "@/hooks/use-saved-searches";
import { useThemeColor } from "@/lib/theme-colors";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: FeedFilters;
};

/**
 * Mobile parity of `SaveSearchDialog` (web). Rendered as a bottom sheet
 * so the keyboard can lift naturally and the form sits above the safe
 * area inset. Pre-fills the name with `suggestSearchName(filters)` —
 * same heuristic as the web dialog so the suggested label stays iso.
 */
export function SaveSearchDialog({ open, onOpenChange, filters }: Props) {
  const [name, setName] = useState("");
  const { mutate, isPending } = useCreateSavedSearch();
  const primary = useThemeColor("primary");

  // Refresh the pre-filled name each time the sheet opens — the active
  // filters may have changed since the user last opened it.
  useEffect(() => {
    if (open) setName(suggestSearchName(filters));
  }, [open, filters]);

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    mutate(
      { name: trimmed, filters },
      {
        onSuccess: () => {
          Keyboard.dismiss();
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center gap-2 pb-1">
          <Bookmark size={20} color={primary} />
          <Text variant="h3">Sauvegarder cette recherche</Text>
        </View>
        <Text variant="muted" className="pb-4">
          {filtersToLabel(filters)}
        </Text>

        <View className="gap-1.5">
          <Label>Nom</Label>
          <Input
            placeholder="Ex: Pikachu Rare pas cher"
            value={name}
            onChangeText={setName}
            maxLength={100}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />
        </View>

        <View className="mt-5 flex-row gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onPress={() => onOpenChange(false)}
          >
            Annuler
          </Button>
          <Button
            className="flex-1"
            onPress={handleSubmit}
            disabled={isPending || !name.trim()}
            loading={isPending}
          >
            Enregistrer
          </Button>
        </View>
      </SheetScrollView>
    </Sheet>
  );
}
