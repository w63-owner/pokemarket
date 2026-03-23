"use client";

import { useForm, Controller, useWatch, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { Euro, ShieldCheck, Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
  WEIGHT_CLASSES,
  WEIGHT_CLASS_LABELS,
  LIMITS,
} from "@/lib/constants";
import type { CardCondition, WeightClass } from "@/lib/constants";
import { calcDisplayPrice } from "@/lib/pricing";
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
      .positive("Le prix doit être supérieur à 0"),
    condition: z.string().optional(),
    is_graded: z.boolean(),
    grading_company: z.string().optional(),
    grade_note: z
      .number({ message: "Entrez une note valide" })
      .min(1, "Minimum 1")
      .max(10, "Maximum 10")
      .optional(),
    delivery_weight_class: z.string(),
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
  defaultValues?: Partial<SellFormValues>;
  onSubmit: (data: SellFormValues) => void;
  isLoading?: boolean;
}

function DisplayPricePreview({
  control,
}: {
  control: Control<SellFormValues>;
}) {
  const priceSeller = useWatch({ control, name: "price_seller" });
  const displayPrice =
    priceSeller && priceSeller > 0 ? calcDisplayPrice(priceSeller) : null;

  return (
    <AnimatePresence mode="wait">
      {displayPrice != null && (
        <motion.div
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
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function FieldError({ message }: { message?: string }) {
  return (
    <AnimatePresence mode="wait">
      {message && (
        <motion.p
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -4 }}
          className="text-destructive text-xs"
        >
          {message}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

export function SellForm({
  defaultValues,
  onSubmit,
  isLoading,
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
      delivery_weight_class: "S",
      ...defaultValues,
    },
  });

  const isGraded = useWatch({ control, name: "is_graded" });

  return (
    <motion.form
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

      {/* Seller price */}
      <div className="space-y-1.5">
        <Label htmlFor="price_seller">Prix vendeur</Label>
        <div className="relative">
          <Euro className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            id="price_seller"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            placeholder="0,00"
            className="pl-8"
            aria-invalid={!!errors.price_seller}
            {...register("price_seller", { valueAsNumber: true })}
          />
        </div>
        <FieldError message={errors.price_seller?.message} />
        <DisplayPricePreview control={control} />
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
          <motion.div
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
          </motion.div>
        ) : (
          <motion.div
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* Weight class */}
      <div className="space-y-1.5">
        <Label>Catégorie de poids</Label>
        <Controller
          name="delivery_weight_class"
          control={control}
          render={({ field }) => (
            <Select value={field.value ?? "S"} onValueChange={field.onChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choisir le poids" />
              </SelectTrigger>
              <SelectContent>
                {WEIGHT_CLASSES.map((wc) => (
                  <SelectItem key={wc} value={wc}>
                    {WEIGHT_CLASS_LABELS[wc as WeightClass]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      {/* Submit */}
      <div className="pt-2 pb-8">
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Publication en cours…
            </>
          ) : (
            "Publier l'annonce"
          )}
        </Button>
      </div>
    </motion.form>
  );
}
