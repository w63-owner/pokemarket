import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { MotiView } from "moti";
import {
  AlertTriangle,
  CheckCircle2,
  Package,
  Star,
  Truck,
} from "lucide-react-native";
import type { Transaction } from "@pokemarket/shared";

import {
  Button,
  Input,
  Label,
  Select,
  Sheet,
  SheetScrollView,
  Text,
  Textarea,
  toast,
} from "@/components/ui";
import {
  useConfirmReception,
  useCreateDispute,
  useShipOrder,
} from "@/hooks/use-transactions";
import type { DisputeReason } from "@/lib/api/transactions";
import { spring } from "@/lib/motion";
import { useThemeColors } from "@/lib/theme-colors";

type TransactionActionsProps = {
  transaction: Transaction;
  conversationId: string;
  listingId: string;
  currentUserId: string;
  sellerId: string;
  buyerId: string;
};

/**
 * Active state-machine bar shown above the message composer (and on the
 * sales detail page). Mirrors the web component
 * `apps/web/src/components/messages/transaction-actions.tsx` but uses
 * native bottom sheets and the `useShipOrder` / `useCreateDispute` /
 * `useConfirmReception` mutations so RN doesn't depend on Server Actions.
 */
export function TransactionActions({
  transaction,
  conversationId,
  listingId,
  currentUserId,
  sellerId,
  buyerId,
}: TransactionActionsProps) {
  const isSeller = currentUserId === sellerId;
  const isBuyer = currentUserId === buyerId;
  const colors = useThemeColors();

  if (transaction.status === "PENDING_PAYMENT") {
    return (
      <StatusBar
        icon={<Package size={16} color={colors.brandSecondary} />}
        label="Paiement en cours de validation…"
      />
    );
  }

  if (transaction.status === "PAID" && isSeller) {
    return (
      <ShipOrderBar
        transactionId={transaction.id}
        conversationId={conversationId}
        listingId={listingId}
      />
    );
  }

  if (transaction.status === "PAID" && isBuyer) {
    return (
      <StatusBar
        icon={<Package size={16} color={colors.brandSecondary} />}
        label="Paiement confirmé — en attente d'envoi"
      />
    );
  }

  if (transaction.status === "SHIPPED" && isBuyer) {
    return (
      <View>
        <ConfirmReceptionBar
          transactionId={transaction.id}
          conversationId={conversationId}
          listingId={listingId}
        />
        <ReportDisputeButton
          transactionId={transaction.id}
          conversationId={conversationId}
          listingId={listingId}
        />
      </View>
    );
  }

  if (transaction.status === "SHIPPED" && isSeller) {
    return (
      <StatusBar
        icon={<Truck size={16} color={colors.warning} />}
        label="En attente de la confirmation de réception"
      />
    );
  }

  if (transaction.status === "DISPUTED") {
    return (
      <StatusBar
        icon={<AlertTriangle size={16} color={colors.destructive} />}
        label="Litige en cours — un administrateur va intervenir"
      />
    );
  }

  if (transaction.status === "COMPLETED") {
    return (
      <StatusBar
        icon={<CheckCircle2 size={16} color={colors.success} />}
        label="Transaction finalisée"
      />
    );
  }

  return null;
}

function StatusBar({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <View className="flex-row items-center gap-2 border-b border-border bg-muted/50 px-3 py-2.5">
      {icon}
      <Text className="text-sm font-medium text-muted-foreground">{label}</Text>
    </View>
  );
}

/** ──────────────────────────────────────────────────────────────────────
 * Ship order
 * ────────────────────────────────────────────────────────────────────── */

function ShipOrderBar({
  transactionId,
  conversationId,
  listingId,
}: {
  transactionId: string;
  conversationId: string;
  listingId: string;
}) {
  const [open, setOpen] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");

  const ship = useShipOrder();
  const colors = useThemeColors();

  const handleSubmit = useCallback(() => {
    if (!trackingNumber.trim() || ship.isPending) return;
    ship.mutate(
      {
        transactionId,
        conversationId,
        listingId,
        trackingNumber,
        trackingUrl: trackingUrl || null,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setTrackingNumber("");
          setTrackingUrl("");
          toast.success("Colis marqué comme expédié !");
        },
        onError: () => {
          toast.error("Impossible de mettre à jour l'expédition");
        },
      },
    );
  }, [
    ship,
    transactionId,
    conversationId,
    listingId,
    trackingNumber,
    trackingUrl,
  ]);

  return (
    <>
      <View className="flex-row items-center justify-between gap-2 border-b border-border bg-brand-secondary/10 px-3 py-2.5">
        <View className="flex-row items-center gap-2">
          <Package size={16} color={colors.brandSecondary} />
          <Text className="text-sm font-medium">Paiement reçu</Text>
        </View>
        <Button size="sm" onPress={() => setOpen(true)}>
          <View className="flex-row items-center gap-1.5">
            <Truck size={14} color={colors.primaryForeground} />
            <Text className="text-sm font-semibold text-primary-foreground">
              Expédier
            </Text>
          </View>
        </Button>
      </View>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          <View className="gap-1.5">
            <Text variant="h4">Expédier le colis</Text>
            <Text variant="muted">
              Renseignez les informations de suivi pour informer
              l&apos;acheteur.
            </Text>
          </View>

          <View className="mt-4 gap-3">
            <View className="gap-1.5">
              <Label>
                Numéro de suivi <Text className="text-destructive">*</Text>
              </Label>
              <Input
                placeholder="Ex : 1Z999AA10123456784"
                value={trackingNumber}
                onChangeText={setTrackingNumber}
                autoCapitalize="characters"
                editable={!ship.isPending}
              />
            </View>

            <View className="gap-1.5">
              <Label>URL de suivi (optionnel)</Label>
              <Input
                placeholder="https://…"
                value={trackingUrl}
                onChangeText={setTrackingUrl}
                autoCapitalize="none"
                keyboardType="url"
                editable={!ship.isPending}
              />
            </View>
          </View>

          <Button
            className="mt-5"
            size="lg"
            loading={ship.isPending}
            onPress={handleSubmit}
            disabled={!trackingNumber.trim()}
            leftIcon={
              ship.isPending ? null : (
                <Package size={18} color={colors.primaryForeground} />
              )
            }
          >
            Confirmer l&apos;expédition
          </Button>
        </SheetScrollView>
      </Sheet>
    </>
  );
}

/** ──────────────────────────────────────────────────────────────────────
 * Confirm reception (rating)
 * ────────────────────────────────────────────────────────────────────── */

function ConfirmReceptionBar({
  transactionId,
  conversationId,
  listingId,
}: {
  transactionId: string;
  conversationId: string;
  listingId: string;
}) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  const confirm = useConfirmReception();
  const colors = useThemeColors();

  const handleSubmit = useCallback(() => {
    if (rating < 1 || rating > 5 || confirm.isPending) return;
    confirm.mutate(
      {
        transactionId,
        conversationId,
        listingId,
        rating,
        comment: comment.trim() || null,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setRating(0);
          setComment("");
          toast.success("Réception confirmée !", "Merci pour votre avis.");
        },
        onError: (err: unknown) => {
          const message =
            err instanceof Error ? err.message : "Action impossible";
          toast.error("Impossible de confirmer", message);
        },
      },
    );
  }, [confirm, transactionId, conversationId, listingId, rating, comment]);

  return (
    <>
      <View className="flex-row items-center justify-between gap-2 border-b border-border bg-warning/10 px-3 py-2.5">
        <View className="flex-row items-center gap-2">
          <Truck size={16} color={colors.warning} />
          <Text className="text-sm font-medium">Colis en route</Text>
        </View>
        <Button size="sm" onPress={() => setOpen(true)}>
          <View className="flex-row items-center gap-1.5">
            <CheckCircle2 size={14} color={colors.primaryForeground} />
            <Text className="text-sm font-semibold text-primary-foreground">
              Confirmer
            </Text>
          </View>
        </Button>
      </View>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          <View className="gap-1.5">
            <Text variant="h4">Confirmer la réception</Text>
            <Text variant="muted">
              Notez le vendeur pour finaliser la transaction.
            </Text>
          </View>

          <View className="mt-4 gap-4">
            <View className="gap-1.5">
              <Label>
                Votre note <Text className="text-destructive">*</Text>
              </Label>
              <StarPicker value={rating} onChange={setRating} />
              {rating === 0 ? (
                <Text variant="caption">Touchez une étoile pour noter</Text>
              ) : null}
            </View>

            <View className="gap-1.5">
              <Label>Commentaire (optionnel)</Label>
              <Textarea
                placeholder="Partagez votre expérience…"
                value={comment}
                onChangeText={setComment}
                numberOfLines={3}
                editable={!confirm.isPending}
              />
            </View>
          </View>

          <Button
            className="mt-5"
            size="lg"
            loading={confirm.isPending}
            onPress={handleSubmit}
            disabled={rating < 1}
            leftIcon={
              confirm.isPending ? null : (
                <CheckCircle2 size={18} color={colors.primaryForeground} />
              )
            }
          >
            Confirmer et noter
          </Button>
        </SheetScrollView>
      </Sheet>
    </>
  );
}

function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  const colors = useThemeColors();
  return (
    <View className="flex-row gap-2 py-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const active = n <= value;
        const starColor = active ? colors.warning : colors.border;
        return (
          <Pressable
            key={n}
            onPress={() => onChange(n)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Note ${n} sur 5`}
          >
            <MotiView
              animate={{ scale: active ? 1.05 : 1 }}
              transition={spring.bouncy}
            >
              <Star
                size={32}
                color={starColor}
                fill={active ? colors.warning : "transparent"}
              />
            </MotiView>
          </Pressable>
        );
      })}
    </View>
  );
}

/** ──────────────────────────────────────────────────────────────────────
 * Report dispute
 * ────────────────────────────────────────────────────────────────────── */

const DISPUTE_REASONS: { value: DisputeReason; label: string }[] = [
  { value: "damaged_card", label: "Carte endommagée" },
  { value: "wrong_card", label: "Mauvaise carte" },
  { value: "empty_package", label: "Colis vide" },
  { value: "other", label: "Autre" },
];

function ReportDisputeButton({
  transactionId,
  conversationId,
  listingId,
}: {
  transactionId: string;
  conversationId: string;
  listingId: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<DisputeReason | "">("");
  const [description, setDescription] = useState("");

  const dispute = useCreateDispute();
  const colors = useThemeColors();

  const handleSubmit = useCallback(() => {
    if (reason === "" || description.trim().length < 10 || dispute.isPending)
      return;
    dispute.mutate(
      {
        transactionId,
        conversationId,
        listingId,
        reason,
        description,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setReason("");
          setDescription("");
          toast.success("Litige ouvert", "Un modérateur va intervenir.");
        },
        onError: () => {
          toast.error("Impossible d'ouvrir le litige");
        },
      },
    );
  }, [dispute, transactionId, conversationId, listingId, reason, description]);

  return (
    <>
      <View className="items-center py-2">
        <Pressable
          onPress={() => setOpen(true)}
          className="flex-row items-center gap-1.5 active:opacity-60"
        >
          <AlertTriangle size={12} color={colors.mutedForeground} />
          <Text variant="caption">Signaler un problème</Text>
        </Pressable>
      </View>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          <View className="flex-row items-center gap-2">
            <AlertTriangle size={20} color={colors.destructive} />
            <Text variant="h4">Signaler un problème</Text>
          </View>
          <Text variant="muted" className="mt-1">
            Décrivez le problème rencontré. Un modérateur examinera votre
            demande.
          </Text>

          <View className="mt-4 gap-4">
            <View className="gap-1.5">
              <Label>
                Raison <Text className="text-destructive">*</Text>
              </Label>
              <Select
                value={reason || null}
                onValueChange={(v) => setReason(v as DisputeReason)}
                options={DISPUTE_REASONS}
                placeholder="Sélectionnez une raison"
                title="Raison du litige"
                disabled={dispute.isPending}
              />
            </View>

            <View className="gap-1.5">
              <Label>
                Description <Text className="text-destructive">*</Text>
              </Label>
              <Textarea
                placeholder="Décrivez le problème en détail (min. 10 caractères)…"
                value={description}
                onChangeText={setDescription}
                numberOfLines={4}
                editable={!dispute.isPending}
              />
              {description.length > 0 && description.trim().length < 10 ? (
                <Text variant="caption" className="text-destructive">
                  Minimum 10 caractères ({description.trim().length}/10)
                </Text>
              ) : null}
            </View>
          </View>

          <Button
            variant="destructive"
            size="lg"
            className="mt-5"
            loading={dispute.isPending}
            disabled={reason === "" || description.trim().length < 10}
            onPress={handleSubmit}
            leftIcon={
              dispute.isPending ? null : (
                <AlertTriangle size={18} color={colors.destructiveForeground} />
              )
            }
          >
            Ouvrir le litige
          </Button>
        </SheetScrollView>
      </Sheet>
    </>
  );
}
