"use client";

import { useEffect } from "react";
import { useForm, Controller, useWatch, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { m, AnimatePresence } from "framer-motion";
import { Euro, ShieldCheck, Loader2, TrendingUp } from "lucide-react";
import { queryKeys, type PriceHistoryResponse } from "@pokemarket/shared";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  CARD_CONDITIONS,
  CONDITION_LABELS,
  GRADING_COMPANIES,
  CARD_LANGUAGES,
  toCardLanguageSelectValue,
  RARITY_OPTIONS,
  LIMITS,
} from "@/lib/constants";
import type { CardCondition } from "@/lib/constants";
import {
  calcBuyerProtectionFee,
  calcDisplayPrice,
  parseDecimalPrice,
} from "@/lib/pricing";
import { formatPrice } from "@/lib/utils";

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
      .min(
        LIMITS.MIN_LISTING_PRICE,
        `Le prix minimum est de ${LIMITS.MIN_LISTING_PRICE} €`,
      ),
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
    card_variant: z.enum(["normal", "holo"], {
      message: "Variante requise",
    }),
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

interface SellFormProps {
  cardKey?: string | null;
  defaultValues?: Partial<SellFormValues>;
  onSubmit: (data: SellFormValues) => void;
  onValuesChange?: (data: Partial<SellFormValues>) => void;
  isLoading?: boolean;
  submitLabel?: string;
}

async function fetchPriceRecommendation(
  cardKey: string,
  condition: string,
  language: string,
  isGraded: boolean,
): Promise<PriceHistoryResponse> {
  const params = new URLSearchParams({
    condition,
    language,
    isGraded: String(isGraded),
  });
  const response = await fetch(
    `/api/cards/${encodeURIComponent(cardKey)}/price-history?${params}`,
  );

  if (!response.ok) {
    throw new Error("Impossible de charger le prix conseillé");
  }

  return response.json();
}

function DisplayPricePreview({
  control,
}: {
  control: Control<SellFormValues>;
}) {
  const priceSeller = useWatch({ control, name: "price_seller" });
  const displayPrice =
    priceSeller && priceSeller > 0 ? calcDisplayPrice(priceSeller) : null;
  const buyerProtection =
    priceSeller && priceSeller > 0 ? calcBuyerProtectionFee(priceSeller) : null;

  return (
    <AnimatePresence mode="wait">
      {displayPrice != null && (
        <m.div
          key="price-preview"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
          className="border-brand/20 bg-brand/5 flex items-center gap-2 rounded-lg border px-3 py-2"
        >
          <ShieldCheck className="text-brand size-4 shrink-0" />
          <p className="text-foreground text-sm">
            Prix affiché à l&apos;acheteur :{" "}
            <span className="font-display text-brand font-bold">
              {formatPrice(displayPrice)}
            </span>
            {buyerProtection != null && (
              <span className="text-muted-foreground">
                {" "}
                (dont {formatPrice(buyerProtection)} de protection acheteur)
              </span>
            )}
          </p>
        </m.div>
      )}
    </AnimatePresence>
  );
}

function FieldError({ message }: { message?: string }) {
  return (
    <AnimatePresence mode="wait">
      {message && (
        <m.p
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -4 }}
          className="text-destructive text-xs"
        >
          {message}
        </m.p>
      )}
    </AnimatePresence>
  );
}

export function SellForm({
  cardKey,
  defaultValues,
  onSubmit,
  onValuesChange,
  isLoading,
  submitLabel = "Publier l'annonce",
}: SellFormProps) {
  const {
    register,
    handleSubmit,
    control,
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
      card_variant: undefined,
      card_rarity: undefined,
      card_illustrator: undefined,
      ...defaultValues,
    },
  });

  const watchedValues = useWatch({ control });

  useEffect(() => {
    if (!onValuesChange) return;
    onValuesChange(watchedValues as Partial<SellFormValues>);
  }, [onValuesChange, watchedValues]);

  const isGraded = useWatch({ control, name: "is_graded" });
  const condition = useWatch({ control, name: "condition" });
  const cardLanguage = useWatch({ control, name: "card_language" });
  const safeCondition = condition ?? "EXCELLENT";
  const languageCanonical = (cardLanguage ?? "FR").toUpperCase();
  const canRecommend = Boolean(cardKey && (isGraded || condition));
  const { data: priceData, isLoading: isPriceLoading } = useQuery({
    queryKey: queryKeys.priceRecommendation(
      cardKey ?? "",
      safeCondition,
      languageCanonical,
      isGraded,
    ),
    queryFn: () =>
      fetchPriceRecommendation(
        cardKey!,
        safeCondition,
        languageCanonical.toLowerCase(),
        isGraded,
      ),
    enabled: canRecommend,
    staleTime: 5 * 60 * 1000,
  });
  const recommendation = priceData?.recommendation;

  return (
    <m.form
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-5"
    >
      {/* Title */}
      <div className="space-y-1.5">
        <Label htmlFor="title">Titre de l&apos;annonce</Label>
        <Input
          id="title"
          placeholder="Ex : Pikachu VMAX 044/185"
          aria-invalid={!!errors.title}
          {...register("title")}
        />
        <FieldError message={errors.title?.message} />
      </div>

      {/* Card metadata: Série, Bloc, Numéro */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="card_series">Série (Set)</Label>
          <Input
            id="card_series"
            placeholder="Ex : Flammes Obsidiennes"
            {...register("card_series")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="card_block">Bloc</Label>
          <Input
            id="card_block"
            placeholder="Ex : Écarlate et Violet"
            {...register("card_block")}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="card_number">Numéro</Label>
          <Input
            id="card_number"
            placeholder="Ex : 44/185"
            {...register("card_number")}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Langue</Label>
          <Controller
            name="card_language"
            control={control}
            render={({ field }) => (
              <Select
                value={toCardLanguageSelectValue(field.value)}
                onValueChange={field.onChange}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Langue" />
                </SelectTrigger>
                <SelectContent>
                  {CARD_LANGUAGES.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Variante</Label>
          <Controller
            name="card_variant"
            control={control}
            render={({ field }) => (
              <Select value={field.value ?? ""} onValueChange={field.onChange}>
                <SelectTrigger
                  className="w-full"
                  aria-invalid={!!errors.card_variant}
                >
                  <SelectValue placeholder="Variante" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normale</SelectItem>
                  <SelectItem value="holo">Holographique</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
          <FieldError message={errors.card_variant?.message} />
        </div>
        <div className="space-y-1.5">
          <Label>Rareté</Label>
          <Controller
            name="card_rarity"
            control={control}
            render={({ field }) => (
              <Select value={field.value ?? ""} onValueChange={field.onChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Rareté" />
                </SelectTrigger>
                <SelectContent>
                  {RARITY_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="card_illustrator">Illustrateur</Label>
        <Input
          id="card_illustrator"
          placeholder="Ex : Mitsuhiro Arita"
          {...register("card_illustrator")}
        />
      </div>

      {/* Graded toggle */}
      <div className="border-border bg-card flex items-center justify-between rounded-lg border p-3">
        <div className="space-y-0.5">
          <Label htmlFor="is_graded" className="cursor-pointer">
            Carte gradée
          </Label>
          <p className="text-muted-foreground text-xs">
            Gradée par un organisme officiel
          </p>
        </div>
        <Controller
          name="is_graded"
          control={control}
          render={({ field }) => (
            <Switch
              id="is_graded"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
      </div>

      <AnimatePresence mode="wait">
        {isGraded ? (
          <m.div
            key="graded-fields"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-4 pt-1">
              {/* Grading company */}
              <div className="space-y-1.5">
                <Label>Organisme de gradation</Label>
                <Controller
                  name="grading_company"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ?? ""}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger
                        className="w-full"
                        aria-invalid={!!errors.grading_company}
                      >
                        <SelectValue placeholder="Choisir l'organisme" />
                      </SelectTrigger>
                      <SelectContent>
                        {GRADING_COMPANIES.map((company) => (
                          <SelectItem key={company} value={company}>
                            {company}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError message={errors.grading_company?.message} />
              </div>

              {/* Grade note */}
              <div className="space-y-1.5">
                <Label htmlFor="grade_note">Note (1–10)</Label>
                <Input
                  id="grade_note"
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min="1"
                  max="10"
                  placeholder="9.5"
                  aria-invalid={!!errors.grade_note}
                  {...register("grade_note", { valueAsNumber: true })}
                />
                <FieldError message={errors.grade_note?.message} />
              </div>
            </div>
          </m.div>
        ) : (
          <m.div
            key="condition-field"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-1.5 pt-1">
              <Label>État de la carte</Label>
              <Controller
                name="condition"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value ?? ""}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger
                      className="w-full"
                      aria-invalid={!!errors.condition}
                    >
                      <SelectValue placeholder="Choisir l'état" />
                    </SelectTrigger>
                    <SelectContent>
                      {CARD_CONDITIONS.map((condition) => (
                        <SelectItem key={condition} value={condition}>
                          {CONDITION_LABELS[condition as CardCondition]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError message={errors.condition?.message} />
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {/* Seller price */}
      <div className="space-y-1.5">
        <Label htmlFor="price_seller">Prix vendeur</Label>
        <div className="relative">
          <Euro className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            id="price_seller"
            type="text"
            inputMode="decimal"
            placeholder="1,00"
            className="pl-8"
            aria-invalid={!!errors.price_seller}
            {...register("price_seller", {
              setValueAs: parseDecimalPrice,
            })}
          />
        </div>
        <FieldError message={errors.price_seller?.message} />
        {canRecommend && isPriceLoading ? (
          <Skeleton className="h-14 w-full rounded-lg" />
        ) : recommendation ? (
          <div className="border-primary/20 bg-primary/5 flex items-center gap-3 rounded-lg border px-3 py-2.5">
            <TrendingUp className="text-primary size-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                Prix conseillé :{" "}
                <span className="font-display text-primary font-bold">
                  {formatPrice(recommendation.sellerPrice)}
                </span>
              </p>
              <p className="text-muted-foreground text-xs">
                {recommendation.source === "pokemarket"
                  ? `Moyenne de ${recommendation.sampleSize} annonce${recommendation.sampleSize === 1 ? "" : "s"} comparable${recommendation.sampleSize === 1 ? "" : "s"}`
                  : "D'après la cotation Cardmarket"}
              </p>
            </div>
          </div>
        ) : null}
        <DisplayPricePreview control={control} />
      </div>

      {/* Submit */}
      <div className="pt-2 pb-8">
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              En cours…
            </>
          ) : (
            submitLabel
          )}
        </Button>
      </div>
    </m.form>
  );
}
