import { AlertTriangle, CheckCircle2, Clock3, Scale } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdminPage } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

import { DisputeActions } from "./dispute-actions";

export const dynamic = "force-dynamic";

const actionableStatuses = new Set([
  "warning_needs_response",
  "needs_response",
]);

const statusLabels: Record<string, string> = {
  warning_needs_response: "Avertissement à traiter",
  warning_under_review: "Avertissement examiné",
  warning_closed: "Avertissement clos",
  needs_response: "Réponse requise",
  under_review: "En examen",
  charge_refunded: "Remboursé",
  won: "Gagné",
  lost: "Perdu",
};

export default async function AdminDisputesPage() {
  await requireAdminPage();
  const admin = createAdminClient();
  const { data: disputes, error } = await admin
    .from("stripe_disputes")
    .select(
      "id, stripe_dispute_id, stripe_charge_id, transaction_id, amount_minor, currency, status, reason, evidence_due_by, evidence_submitted_at, seller_liability_minor, locked_minor, debt_minor, created_at",
    )
    .order("evidence_due_by", { ascending: true });

  if (error) throw error;

  const rows = disputes ?? [];
  const actionable = rows.filter((row) => actionableStatuses.has(row.status));
  const debtMinor = rows.reduce((sum, row) => sum + row.debt_minor, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          Litiges Stripe
        </h1>
        <p className="text-muted-foreground text-sm">
          Échéances, preuves, fonds verrouillés et dette vendeur
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric
          label="Réponses requises"
          value={actionable.length}
          icon={<Scale className="text-destructive h-5 w-5" />}
        />
        <Metric
          label="Échéances ouvertes"
          value={
            actionable.filter(
              (row) => row.evidence_due_by && !row.evidence_submitted_at,
            ).length
          }
          icon={<Clock3 className="h-5 w-5 text-amber-500" />}
        />
        <Metric
          label="Dette non recouvrée"
          value={formatMoney(debtMinor, "EUR")}
          icon={<AlertTriangle className="text-destructive h-5 w-5" />}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Chargebacks bancaires</CardTitle>
          <CardDescription>
            Triés par échéance de réponse Stripe la plus proche.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="font-medium">Aucun litige Stripe</p>
              <p className="text-muted-foreground text-sm">
                Les nouveaux chargebacks apparaîtront ici automatiquement.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Litige</TableHead>
                  <TableHead>Transaction</TableHead>
                  <TableHead>Montant</TableHead>
                  <TableHead>Motif</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Échéance</TableHead>
                  <TableHead>Risque vendeur</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((dispute) => (
                  <TableRow key={dispute.id}>
                    <TableCell className="font-mono text-xs">
                      {dispute.stripe_dispute_id}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {dispute.transaction_id?.slice(0, 8) ?? "Inconnue"}
                    </TableCell>
                    <TableCell>
                      {formatMoney(dispute.amount_minor, dispute.currency)}
                    </TableCell>
                    <TableCell className="max-w-44 truncate">
                      {dispute.reason ?? "Non précisé"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          actionableStatuses.has(dispute.status)
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {statusLabels[dispute.status] ?? dispute.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {dispute.evidence_due_by
                        ? new Intl.DateTimeFormat("fr-FR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          }).format(new Date(dispute.evidence_due_by))
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      <div>
                        Verrouillé{" "}
                        {formatMoney(dispute.locked_minor, dispute.currency)}
                      </div>
                      {dispute.debt_minor > 0 && (
                        <div className="text-destructive font-medium">
                          Dette{" "}
                          {formatMoney(dispute.debt_minor, dispute.currency)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <DisputeActions
                        disputeId={dispute.id}
                        canRespond={actionableStatuses.has(dispute.status)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="text-xs font-medium">
          {label}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-2">
        {icon}
        <span className="text-2xl font-bold">{value}</span>
      </CardContent>
    </Card>
  );
}

function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
  }).format(amountMinor / 100);
}
