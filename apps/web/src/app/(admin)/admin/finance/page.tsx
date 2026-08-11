import {
  AlertTriangle,
  CircleCheck,
  ClockAlert,
  RefreshCcw,
  Scale,
} from "lucide-react";

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
import { getFinancialOperationsSnapshot } from "@/lib/financial-operations";

export const dynamic = "force-dynamic";

export default async function AdminFinancePage() {
  await requireAdminPage();
  const snapshot = await getFinancialOperationsSnapshot();
  const debtMinor = snapshot.sellerDebts.reduce(
    (total, row) => total + row.debt_minor,
    0,
  );
  const hasIncident =
    snapshot.stuckJobs.length > 0 ||
    snapshot.failedRecoveries.length > 0 ||
    snapshot.reconciliationAlerts.length > 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            Opérations financières
          </h1>
          <p className="text-muted-foreground text-sm">
            Jobs, rapprochement Stripe, remboursements, dettes et payouts
          </p>
        </div>
        <Badge variant={hasIncident ? "destructive" : "secondary"}>
          {hasIncident ? "Intervention requise" : "Aucune anomalie critique"}
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Jobs bloqués"
          value={snapshot.stuckJobs.length + snapshot.failedRecoveries.length}
          icon={<ClockAlert className="h-5 w-5 text-amber-500" />}
        />
        <Metric
          label="Écarts de rapprochement"
          value={snapshot.reconciliationAlerts.length}
          icon={<RefreshCcw className="text-destructive h-5 w-5" />}
        />
        <Metric
          label="Dette vendeurs"
          value={formatMoney(debtMinor)}
          icon={<AlertTriangle className="text-destructive h-5 w-5" />}
        />
        <Metric
          label="Preuves sous 72 h"
          value={snapshot.evidenceDueSoon.length}
          icon={<Scale className="h-5 w-5 text-amber-500" />}
        />
      </div>

      <OperationsTable
        title="File financière"
        description="Jobs échoués, en retard ou avec un lease expiré."
        empty="Aucun job financier bloqué."
        headers={["Type", "Agrégat", "État", "Tentatives", "Dernière erreur"]}
        rows={[
          ...snapshot.stuckJobs.map((job) => [
            job.event_type,
            shortId(job.aggregate_id),
            job.status,
            `${job.attempts}/${job.max_attempts}`,
            job.last_error ?? "—",
          ]),
          ...snapshot.failedRecoveries.map((recovery) => [
            `recovery:${recovery.kind}`,
            shortId(recovery.transaction_id),
            recovery.status,
            String(recovery.attempts),
            recovery.last_error ?? "—",
          ]),
        ]}
      />

      <OperationsTable
        title="Rapprochement ledger / Stripe"
        description="Invariants qui ne convergent pas entre objets métier et ledger."
        empty="Aucun écart détecté."
        headers={["Anomalie", "Entité", "Attendu", "Constaté"]}
        rows={snapshot.reconciliationAlerts.map((alert) => [
          alert.alert_type ?? "inconnue",
          shortId(alert.entity_id),
          formatMinor(alert.expected_minor),
          formatMinor(alert.actual_minor),
        ])}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <OperationsTable
          title="Remboursements à recouvrer"
          description="Part vendeur cible non encore recouvrée."
          empty="Aucun remboursement en attente."
          headers={["Transaction", "Cible", "Recouvré", "Reste"]}
          rows={snapshot.pendingRefunds.map((refund) => [
            shortId(refund.id),
            formatMoney(refund.seller_refund_target_minor),
            formatMoney(refund.seller_refunded_minor),
            formatMoney(
              refund.seller_refund_target_minor - refund.seller_refunded_minor,
            ),
          ])}
        />
        <OperationsTable
          title="Payouts échoués"
          description="Sorties bancaires à diagnostiquer avant nouveau retry."
          empty="Aucun payout échoué."
          headers={["Payout", "Vendeur", "Montant", "Erreur"]}
          rows={snapshot.failedPayouts.map((payout) => [
            shortId(payout.id),
            shortId(payout.user_id),
            formatMoney(payout.amount_minor, payout.currency),
            payout.failure_code ?? payout.failure_message ?? "Inconnue",
          ])}
        />
      </div>

      <OperationsTable
        title="Dettes vendeurs"
        description="Comptes bloqués jusqu'au recouvrement complet."
        empty="Aucune dette vendeur."
        headers={["Vendeur", "Dette", "Verrouillé", "Niveau"]}
        rows={snapshot.sellerDebts.map((risk) => [
          shortId(risk.seller_id),
          formatMoney(risk.debt_minor),
          formatMoney(risk.locked_minor),
          risk.alert_level,
        ])}
      />

      <OperationsTable
        title="Échéances de preuves"
        description="Litiges ouverts, triés par échéance Stripe."
        empty="Aucune preuve à soumettre."
        headers={["Litige", "Transaction", "Montant", "Échéance"]}
        rows={snapshot.evidenceDeadlines.map((dispute) => [
          dispute.stripe_dispute_id,
          shortId(dispute.transaction_id),
          formatMoney(dispute.amount_minor, dispute.currency),
          formatDate(dispute.evidence_due_by),
        ])}
      />

      <p className="text-muted-foreground text-xs">
        Instantané généré le {formatDate(snapshot.generatedAt)}. Les alertes
        Sentry sont évaluées indépendamment par le cron de surveillance.
      </p>
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
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-3">
        {icon}
        <span className="text-2xl font-bold">{value}</span>
      </CardContent>
    </Card>
  );
}

function OperationsTable({
  title,
  description,
  empty,
  headers,
  rows,
}: {
  title: string;
  description: string;
  empty: string;
  headers: string[];
  rows: string[][];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="flex min-h-28 items-center justify-center gap-2 text-sm text-emerald-600">
            <CircleCheck className="h-5 w-5" />
            {empty}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {headers.map((header) => (
                  <TableHead key={header}>{header}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, rowIndex) => (
                <TableRow key={`${row[0]}-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <TableCell
                      key={`${cellIndex}-${cell}`}
                      className={
                        cellIndex < 2
                          ? "max-w-64 truncate font-mono text-xs"
                          : "max-w-80 truncate text-xs"
                      }
                    >
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function shortId(value: string | null): string {
  return value ? value.slice(0, 12) : "—";
}

function formatMinor(value: number | null): string {
  return value === null ? "—" : `${value} ct`;
}

function formatMoney(amountMinor: number, currency = "EUR"): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
  }).format(amountMinor / 100);
}

function formatDate(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
}
