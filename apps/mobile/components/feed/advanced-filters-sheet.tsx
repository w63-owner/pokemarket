import { useState } from "react";
import { Pressable, View } from "react-native";
import { MotiView, AnimatePresence } from "moti";
import { Bookmark } from "lucide-react-native";
import {
  CARD_CONDITIONS,
  CONDITION_LABELS,
  RARITY_OPTIONS,
  type FeedFilters,
} from "@pokemarket/shared";

import {
  Button,
  Input,
  Label,
  Select,
  Sheet,
  SheetScrollView,
  Switch,
  Text,
} from "@/components/ui";
import { useAuth } from "@/hooks/use-auth";
import { useThemeColor } from "@/lib/theme-colors";
import { duration } from "@/lib/motion";
import { SaveSearchDialog } from "./save-search-dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: FeedFilters;
  onChange: (patch: Partial<FeedFilters>) => void;
  onReset: () => void;
  activeCount: number;
};

const RARITY_SELECT_OPTIONS = [
  { value: "", label: "Toutes" },
  ...RARITY_OPTIONS.map((r) => ({ value: r.value, label: r.label })),
];

const CONDITION_SELECT_OPTIONS = [
  { value: "", label: "Tous" },
  ...CARD_CONDITIONS.map((c) => ({ value: c, label: CONDITION_LABELS[c] })),
];

function parseNumberInput(raw: string): number | undefined {
  if (!raw) return undefined;
  const normalized = raw.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : undefined;
}

export function AdvancedFiltersSheet({
  open,
  onOpenChange,
  filters,
  onChange,
  onReset,
  activeCount,
}: Props) {
  const { isAuthenticated } = useAuth();
  const primary = useThemeColor("primary");
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);

  const footerEl = (
    <>
      {isAuthenticated && activeCount > 0 ? (
        <Pressable
          onPress={() => setSaveDialogOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Sauvegarder cette recherche"
          className="mb-3 flex-row items-center justify-center gap-1.5 self-center px-3 py-1.5"
        >
          <Bookmark size={14} color={primary} />
          <Text className="text-sm font-medium text-primary">
            Sauvegarder cette recherche
          </Text>
        </Pressable>
      ) : null}
      <View className="flex-row gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onPress={() => {
            onReset();
          }}
        >
          Réinitialiser
        </Button>
        <Button className="flex-1" onPress={() => onOpenChange(false)}>
          Voir les résultats
        </Button>
      </View>
    </>
  );

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      snapPoints={["92%"]}
      footer={footerEl}
    >
      <View className="flex-row items-center justify-between pb-2">
        <Text variant="h3">Filtres avancés</Text>
        {activeCount > 0 ? (
          <View className="rounded-full bg-secondary px-2.5 py-0.5">
            <Text className="text-xs font-medium">{activeCount}</Text>
          </View>
        ) : null}
      </View>

      {/* paddingBottom offsets the sticky footer so the last row isn't
          hidden behind it (footer ≈ button 44 + paddingTop 8 + paddingBottom 24 = 76dp). */}
      <SheetScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 76 }}
      >
        <View className="gap-1.5">
          <Label>Bloc</Label>
          <Input
            placeholder="Ex: Écarlate et Violet…"
            value={filters.series ?? ""}
            onChangeText={(v) => onChange({ series: v || undefined })}
          />
        </View>

        <View className="mt-3 gap-1.5">
          <Label>Série / Extension</Label>
          <Input
            placeholder="Ex: Flammes Obsidiennes…"
            value={filters.set ?? ""}
            onChangeText={(v) => onChange({ set: v || undefined })}
          />
        </View>

        <View className="mt-3 gap-1.5">
          <Label>N° de carte</Label>
          <Input
            placeholder="Ex: 25/165"
            value={filters.card_number ?? ""}
            onChangeText={(v) => onChange({ card_number: v || undefined })}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View className="mt-3 gap-1.5">
          <Label>Rareté</Label>
          <Select
            value={filters.rarity ?? ""}
            onValueChange={(val) => onChange({ rarity: val || undefined })}
            options={RARITY_SELECT_OPTIONS}
            placeholder="Toutes"
          />
        </View>

        <View className="mt-3 gap-1.5">
          <Label>État</Label>
          <Select
            value={filters.condition ?? ""}
            onValueChange={(val) => onChange({ condition: val || undefined })}
            options={CONDITION_SELECT_OPTIONS}
            placeholder="Tous"
          />
        </View>

        <View className="mt-3 gap-3">
          <View className="flex-row items-center justify-between">
            <Label>Carte gradée</Label>
            <Switch
              checked={!!filters.is_graded}
              onCheckedChange={(checked) =>
                onChange({
                  is_graded: checked || undefined,
                  ...(!checked && {
                    grade_min: undefined,
                    grade_max: undefined,
                  }),
                })
              }
            />
          </View>

          <AnimatePresence>
            {filters.is_graded ? (
              <MotiView
                from={{ opacity: 0, translateY: -4 }}
                animate={{ opacity: 1, translateY: 0 }}
                exit={{ opacity: 0, translateY: -4 }}
                transition={{ type: "timing", duration: duration.fast }}
              >
                <View className="flex-row gap-2">
                  <View className="flex-1 gap-1">
                    <Text variant="caption">Note min</Text>
                    <Input
                      keyboardType="decimal-pad"
                      placeholder="1"
                      value={
                        filters.grade_min !== undefined
                          ? String(filters.grade_min)
                          : ""
                      }
                      onChangeText={(v) =>
                        onChange({ grade_min: parseNumberInput(v) })
                      }
                    />
                  </View>
                  <View className="flex-1 gap-1">
                    <Text variant="caption">Note max</Text>
                    <Input
                      keyboardType="decimal-pad"
                      placeholder="10"
                      value={
                        filters.grade_max !== undefined
                          ? String(filters.grade_max)
                          : ""
                      }
                      onChangeText={(v) =>
                        onChange({ grade_max: parseNumberInput(v) })
                      }
                    />
                  </View>
                </View>
              </MotiView>
            ) : null}
          </AnimatePresence>
        </View>

        <View className="mt-3 gap-1.5">
          <Label>Prix (€)</Label>
          <View className="flex-row items-center gap-2">
            <View className="flex-1">
              <Input
                keyboardType="decimal-pad"
                placeholder="Min"
                value={
                  filters.price_min !== undefined
                    ? String(filters.price_min)
                    : ""
                }
                onChangeText={(v) =>
                  onChange({ price_min: parseNumberInput(v) })
                }
              />
            </View>
            <Text variant="muted">–</Text>
            <View className="flex-1">
              <Input
                keyboardType="decimal-pad"
                placeholder="Max"
                value={
                  filters.price_max !== undefined
                    ? String(filters.price_max)
                    : ""
                }
                onChangeText={(v) =>
                  onChange({ price_max: parseNumberInput(v) })
                }
              />
            </View>
          </View>
        </View>
      </SheetScrollView>

      <SaveSearchDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        filters={filters}
      />
    </Sheet>
  );
}
