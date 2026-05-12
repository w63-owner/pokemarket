"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Flag, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { reportSchema } from "@/lib/validations";
import { REPORT_REASONS, REPORT_REASON_LABELS } from "@/lib/constants";
import { createReport } from "@/lib/api/reports";

type ReportFormValues = z.infer<typeof reportSchema>;

interface ReportDialogProps {
  listingId: string;
}

export function ReportDialog({ listingId }: ReportDialogProps) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ReportFormValues>({
    resolver: zodResolver(reportSchema),
  });

  const onSubmit = async (data: ReportFormValues) => {
    setSubmitting(true);
    try {
      await createReport(listingId, data);
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs transition-colors"
      >
        <Flag className="size-3.5" />
        Signaler l&apos;annonce
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Signaler cette annonce</DialogTitle>
            <DialogDescription>
              Si vous pensez que cette annonce est frauduleuse ou enfreint nos
              règles, signalez-la. Notre équipe examinera votre signalement.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="report-reason">
                Raison <span className="text-destructive">*</span>
              </Label>
              <Controller
                name="reason"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value ?? ""}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger
                      id="report-reason"
                      className="w-full"
                      aria-invalid={!!errors.reason}
                    >
                      <SelectValue placeholder="Sélectionner une raison" />
                    </SelectTrigger>
                    <SelectContent>
                      {REPORT_REASONS.map((reason) => (
                        <SelectItem key={reason} value={reason}>
                          {REPORT_REASON_LABELS[reason]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.reason && (
                <p className="text-destructive text-xs">
                  {errors.reason.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="report-description">
                Description{" "}
                <span className="text-muted-foreground font-normal">
                  (optionnelle)
                </span>
              </Label>
              <Textarea
                id="report-description"
                placeholder="Décrivez le problème rencontré…"
                maxLength={500}
                {...register("description")}
                aria-invalid={!!errors.description}
              />
              {errors.description && (
                <p className="text-destructive text-xs">
                  {errors.description.message}
                </p>
              )}
            </div>

            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                Annuler
              </DialogClose>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Flag className="size-4" />
                )}
                {submitting ? "Envoi…" : "Envoyer le signalement"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
