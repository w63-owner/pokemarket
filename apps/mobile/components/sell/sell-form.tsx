import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { View } from "react-native";
import { MotiView, AnimatePresence } from "moti";
import { ShieldCheck } from "lucide-react-native";
import {
  CARD_CONDITIONS,
  CARD_LANGUAGES,
  CONDITION_LABELS,
  GRADING_COMPANIES,
  LIMITS,
  RARITY_OPTIONS,
  type CardCondition,
  calcDisplayPrice,
  formatPrice,
  toCardLanguageSelectValue,
} from "@pokemarket/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, type SelectOption } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { duration } from "@/lib/motion";

const sellFormSchema = z
  .object({
    title: z
      .string()
      .min(
        LIMITS.TITLE_MIN_LENGTH,
        `Au moins ${LIMITS.TITLE_MIN_LENGTH} caractères`,
      )
      .max(
        LIMITS.TITLE_MAX_LENGTH,
        `Maximum ${LIMITS.TITLE_MAX_LENGTH} caractères`,
      ),
    price_seller: z
      .number({ message: "Entrez un prix valide" })
      .positive("Le prix doit être supérieur à 0"),
    condition: z.string().optional(),
    is_graded: z.boolean(),
    grading_company: z.string().optional(),
    grade_note: z
      .number({ message: "Entrez une note valide" })
      .min(1, "Minimum 1")
      .max(10, "Maximum 10")
      .optional(),
    card_series: z.string().optional(),
    card_block: z.string().optional(),
    card_number: z.string().optional(),
    card_language: z.string().optional(),
    card_rarity: z.string().optional(),
    card_illustrator: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.is_graded) {
      if (!data.grading_company) {
        ctx.addIssue({
          code: "custom",
          message: "Organisme requis",
          path: ["grading_company"],
        });
      }
      if (data.grade_note == null) {
        ctx.addIssue({
          code: "custom",
          message: "Note requise",
          path: ["grade_note"],
        });
      }
    } else if (!data.condition) {
      ctx.addIssue({
        code: "custom",
        message: "État de la carte requis",
        path: ["condition"],
      });
    }
  });

export type SellFormValues = z.infer<typeof sellFormSchema>;

const LANGUAGE_OPTIONS: SelectOption[] = CARD_LANGUAGES.map((l) => ({
  value: l.value,
  label: l.label,
}));

const RARITY_SELECT_OPTIONS: SelectOption[] = RARITY_OPTIONS.map((r) => ({
  value: r.value,
  label: r.label,
}));

const CONDITION_OPTIONS: SelectOption[] = CARD_CONDITIONS.map((c) => ({
  value: c,
  label: CONDITION_LABELS[c as CardCondition],
}));

const GRADING_OPTIONS: SelectOption[] = GRADING_COMPANIES.map((c) => ({
  value: c,
  label: c,
}));

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Text className="text-xs text-destructive" numberOfLines={2}>
      {message}
    </Text>
  );
}

type Props = {
  defaultValues?: Partial<SellFormValues>;
  onSubmit: (data: SellFormValues) => void;
  isLoading?: boolean;
  submitLabel?: string;
};

export function SellForm({
  defaultValues,
  onSubmit,
  isLoading,
  submitLabel = "Publier l'annonce",
}: Props) {
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<SellFormValues>({
    resolver: zodResolver(sellFormSchema),
    defaultValues: {
      title: "",
      price_seller: undefined as unknown as number,
      condition: undefined,
      is_graded: false,
      grading_company: undefined,
      grade_note: undefined,
      card_series: undefined,
      card_block: undefined,
      card_number: undefined,
      card_language: undefined,
      card_rarity: undefined,
      card_illustrator: undefined,
      ...defaultValues,
    },
  });

  const isGraded = useWatch({ control, name: "is_graded" });
  const priceSeller = useWatch({ control, name: "price_seller" });
  const displayPrice =
    typeof priceSeller === "number" && priceSeller > 0
      ? calcDisplayPrice(priceSeller)
      : null;

  return (
    <View className="gap-5">
      <View className="gap-1.5">
        <Label>Titre de l&apos;annonce</Label>
        <Controller
          control={control}
          name="title"
          render={({ field: { value, onChange, onBlur } }) => (
            <Input
              value={value ?? ""}
              onChangeText={onChange}
              onBlur={onBlur}
              placeholder="Ex : Pikachu VMAX 044/185"
              error={!!errors.title}
              autoCapitalize="sentences"
              maxLength={LIMITS.TITLE_MAX_LENGTH}
            />
          )}
        />
        <FieldError message={errors.title?.message} />
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1 gap-1.5">
          <Label>Série (Set)</Label>
          <Controller
            control={control}
            name="card_series"
            render={({ field: { value, onChange, onBlur } }) => (
              <Input
                value={value ?? ""}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder="Flammes Obs."
                autoCapitalize="words"
              />
            )}
          />
        </View>
        <View className="flex-1 gap-1.5">
          <Label>Bloc</Label>
          <Controller
            control={control}
            name="card_block"
            render={({ field: { value, onChange, onBlur } }) => (
              <Input
                value={value ?? ""}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder="Écarlate & Violet"
                autoCapitalize="words"
              />
            )}
          />
        </View>
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1 gap-1.5">
          <Label>Numéro</Label>
          <Controller
            control={control}
            name="card_number"
            render={({ field: { value, onChange, onBlur } }) => (
              <Input
                value={value ?? ""}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder="44/185"
              />
            )}
          />
        </View>
        <View className="flex-1 gap-1.5">
          <Label>Langue</Label>
          <Controller
            control={control}
            name="card_language"
            render={({ field: { value, onChange } }) => (
              <Select
                value={toCardLanguageSelectValue(value) || null}
                onValueChange={onChange}
                options={LANGUAGE_OPTIONS}
                placeholder="Langue"
              />
            )}
          />
        </View>
      </View>

      <View className="gap-1.5">
        <Label>Rareté</Label>
        <Controller
          control={control}
          name="card_rarity"
          render={({ field: { value, onChange } }) => (
            <Select
              value={value ?? null}
              onValueChange={onChange}
              options={RARITY_SELECT_OPTIONS}
              placeholder="Choisir la rareté"
            />
          )}
        />
      </View>

      <View className="gap-1.5">
        <Label>Illustrateur</Label>
        <Controller
          control={control}
          name="card_illustrator"
          render={({ field: { value, onChange, onBlur } }) => (
            <Input
              value={value ?? ""}
              onChangeText={onChange}
              onBlur={onBlur}
              placeholder="Mitsuhiro Arita"
              autoCapitalize="words"
            />
          )}
        />
      </View>

      <View className="gap-1.5">
        <Label>Prix vendeur</Label>
        <Controller
          control={control}
          name="price_seller"
          render={({ field: { value, onChange, onBlur } }) => (
            <Input
              value={value != null && !Number.isNaN(value) ? String(value) : ""}
              onChangeText={(text) => {
                const cleaned = text.replace(",", ".");
                const parsed = parseFloat(cleaned);
                onChange(Number.isFinite(parsed) ? parsed : undefined);
              }}
              onBlur={onBlur}
              keyboardType="decimal-pad"
              placeholder="0,00 €"
              error={!!errors.price_seller}
            />
          )}
        />
        <FieldError message={errors.price_seller?.message} />
        {displayPrice != null ? (
          <View className="mt-1 flex-row items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
            <ShieldCheck size={16} color="#E63946" />
            <Text className="text-sm">
              Prix affiché à l&apos;acheteur :{" "}
              <Text className="font-bold text-primary">
                {formatPrice(displayPrice)}
              </Text>
            </Text>
          </View>
        ) : null}
      </View>

      <View className="flex-row items-center justify-between rounded-2xl border border-border bg-card p-3">
        <View className="flex-1 gap-0.5">
          <Label>Carte gradée</Label>
          <Text variant="caption">Gradée par un organisme officiel</Text>
        </View>
        <Controller
          control={control}
          name="is_graded"
          render={({ field: { value, onChange } }) => (
            <Switch checked={!!value} onCheckedChange={onChange} />
          )}
        />
      </View>

      <AnimatePresence>
        {isGraded ? (
          <MotiView
            key="graded"
            from={{ opacity: 0, translateY: 6 }}
            animate={{ opacity: 1, translateY: 0 }}
            exit={{ opacity: 0 }}
            transition={{ type: "timing", duration: duration.fast }}
            className="gap-4"
          >
            <View className="gap-1.5">
              <Label>Organisme de gradation</Label>
              <Controller
                control={control}
                name="grading_company"
                render={({ field: { value, onChange } }) => (
                  <Select
                    value={value ?? null}
                    onValueChange={onChange}
                    options={GRADING_OPTIONS}
                    placeholder="Choisir l'organisme"
                  />
                )}
              />
              <FieldError message={errors.grading_company?.message} />
            </View>
            <View className="gap-1.5">
              <Label>Note (1-10)</Label>
              <Controller
                control={control}
                name="grade_note"
                render={({ field: { value, onChange, onBlur } }) => (
                  <Input
                    value={
                      value != null && !Number.isNaN(value) ? String(value) : ""
                    }
                    onChangeText={(text) => {
                      const parsed = parseFloat(text.replace(",", "."));
                      onChange(Number.isFinite(parsed) ? parsed : undefined);
                    }}
                    onBlur={onBlur}
                    keyboardType="decimal-pad"
                    placeholder="9.5"
                    error={!!errors.grade_note}
                  />
                )}
              />
              <FieldError message={errors.grade_note?.message} />
            </View>
          </MotiView>
        ) : (
          <MotiView
            key="condition"
            from={{ opacity: 0, translateY: 6 }}
            animate={{ opacity: 1, translateY: 0 }}
            exit={{ opacity: 0 }}
            transition={{ type: "timing", duration: duration.fast }}
            className="gap-1.5"
          >
            <Label>État de la carte</Label>
            <Controller
              control={control}
              name="condition"
              render={({ field: { value, onChange } }) => (
                <Select
                  value={value ?? null}
                  onValueChange={onChange}
                  options={CONDITION_OPTIONS}
                  placeholder="Choisir l'état"
                />
              )}
            />
            <FieldError message={errors.condition?.message} />
          </MotiView>
        )}
      </AnimatePresence>

      <Button
        onPress={handleSubmit(onSubmit)}
        loading={isLoading}
        className="mt-2"
      >
        {submitLabel}
      </Button>
    </View>
  );
}
