import { useState } from "react";
import { View } from "react-native";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Flag } from "lucide-react-native";
import { router } from "expo-router";
import type { z } from "zod";

import {
  REPORT_REASONS,
  REPORT_REASON_LABELS,
  reportSchema,
  type ReportReason,
} from "@pokemarket/shared";
import {
  Button,
  Label,
  Select,
  Sheet,
  Text,
  Textarea,
  toast,
} from "@/components/ui";
import { useThemeColor } from "@/lib/theme-colors";
import { useAuth } from "@/hooks/use-auth";
import { createReport } from "@/lib/api/reports";

type ReportFormValues = z.infer<typeof reportSchema>;

type Props = {
  listingId: string;
};

const REASON_OPTIONS = REPORT_REASONS.map((reason: ReportReason) => ({
  value: reason,
  label: REPORT_REASON_LABELS[reason],
}));

/**
 * Open-from-bottom report flow — mirrors the web `<ReportDialog />`
 * but uses the mobile bottom Sheet (gorhom) instead of a centered
 * Radix dialog, matching the platform-native pattern for "secondary
 * modal" tasks. RHF + Zod ensures the schema stays in sync with the
 * web validation rules.
 */
export function ReportDialog({ listingId }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const mutedForeground = useThemeColor("mutedForeground");

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ReportFormValues>({
    resolver: zodResolver(reportSchema),
  });

  const onSubmit = async (values: ReportFormValues) => {
    setSubmitting(true);
    try {
      await createReport(listingId, values);
      toast.success("Merci, notre équipe de modération a été alertée");
      setOpen(false);
      reset();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erreur lors du signalement";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onPress={() => {
          if (!user) {
            router.push("/(auth)/login");
            return;
          }
          setOpen(true);
        }}
        leftIcon={<Flag size={14} color={mutedForeground} />}
      >
        <Text variant="caption">Signaler l&apos;annonce</Text>
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <View className="gap-4 pt-2">
          <View className="gap-1">
            <Text variant="h4">Signaler cette annonce</Text>
            <Text variant="muted">
              Si vous pensez que cette annonce est frauduleuse ou enfreint nos
              règles, signalez-la. Notre équipe examinera votre signalement.
            </Text>
          </View>

          <View className="gap-2">
            <Label>
              Raison <Text className="text-destructive">*</Text>
            </Label>
            <Controller
              control={control}
              name="reason"
              render={({ field }) => (
                <Select
                  value={field.value ?? null}
                  onValueChange={(v) => field.onChange(v as ReportReason)}
                  options={REASON_OPTIONS}
                  placeholder="Sélectionner une raison"
                />
              )}
            />
            {errors.reason ? (
              <Text className="text-xs text-destructive">
                {errors.reason.message}
              </Text>
            ) : null}
          </View>

          <View className="gap-2">
            <Label>
              Description <Text variant="muted">(optionnelle)</Text>
            </Label>
            <Controller
              control={control}
              name="description"
              render={({ field }) => (
                <Textarea
                  value={field.value ?? ""}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  placeholder="Décrivez le problème rencontré…"
                  maxLength={500}
                  error={!!errors.description}
                />
              )}
            />
            {errors.description ? (
              <Text className="text-xs text-destructive">
                {errors.description.message}
              </Text>
            ) : null}
          </View>

          <View className="flex-row justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onPress={() => setOpen(false)}
              disabled={submitting}
            >
              Annuler
            </Button>
            <Button
              onPress={handleSubmit(onSubmit)}
              loading={submitting}
              leftIcon={
                submitting ? undefined : <Flag size={16} color="#ffffff" />
              }
            >
              {submitting ? "Envoi…" : "Envoyer"}
            </Button>
          </View>
        </View>
      </Sheet>
    </>
  );
}
