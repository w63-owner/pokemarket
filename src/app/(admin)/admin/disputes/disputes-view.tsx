"use client";

import { useMemo, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Scale, AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { DISPUTE_REASONS } from "@/lib/constants";
import type { InternalDisputeRow, StripeDisputeRow } from "./page";

const internalReasonLabels: Record<(typeof DISPUTE_REASONS)[number], string> = {
  DAMAGED_CARD: "Carte endommagée",
  WRONG_CARD: "Mauvaise carte",
  EMPTY_PACKAGE: "Colis vide",
  OTHER: "Autre",
};

const internalStatusLabels: Record<string, string> = {
  OPEN: "Ouvert",
  IN_REVIEW: "En examen",
  RESOLVED: "Résolu",
};

const stripeStatusLabels: Record<string, string> = {
  warning_needs_response: "Pré-litige : action requise",
  warning_under_review: "Pré-litige : en revue",
  warning_closed: "Pré-litige : clôturé",
  needs_response: "Action requise",
  under_review: "En revue par Stripe",
  charge_refunded: "Remboursé",
  won: "Gagné",
  lost: "Perdu",
};

export function DisputesAdminView({
  internalDisputes,
  stripeDisputes,
}: {
  internalDisputes: InternalDisputeRow[];
  stripeDisputes: StripeDisputeRow[];
}) {
  const openInternalCount = useMemo(
    () =>
      internalDisputes.filter(
        (d) => d.status === "OPEN" || d.status === "IN_REVIEW",
      ).length,
    [internalDisputes],
  );

  const openStripeCount = useMemo(
    () =>
      stripeDisputes.filter((d) =>
        ["needs_response", "under_review", "warning_needs_response"].includes(
          d.status,
        ),
      ).length,
    [stripeDisputes],
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium">
              Litiges internes ouverts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Scale className="text-destructive h-5 w-5" />
              <span className="text-2xl font-bold">{openInternalCount}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium">
              Chargebacks Stripe à traiter
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <AlertTriangle className="text-destructive h-5 w-5" />
              <span className="text-2xl font-bold">{openStripeCount}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium">
              Chargebacks gagnés
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <span className="text-2xl font-bold">
                {stripeDisputes.filter((d) => d.status === "won").length}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="stripe" className="space-y-4">
        <TabsList>
          <TabsTrigger value="stripe">
            Chargebacks Stripe ({stripeDisputes.length})
          </TabsTrigger>
          <TabsTrigger value="internal">
            Litiges internes ({internalDisputes.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stripe">
          <StripeDisputesTable rows={stripeDisputes} />
        </TabsContent>

        <TabsContent value="internal">
          <InternalDisputesTable rows={internalDisputes} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stripe disputes (chargebacks)
// ---------------------------------------------------------------------------

function StripeDisputesTable({ rows }: { rows: StripeDisputeRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Chargebacks bancaires</CardTitle>
        <CardDescription>
          Litiges remontés par la banque de l&apos;acheteur via Stripe. Soumets
          des preuves avant la deadline pour éviter une perte automatique.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Annonce</TableHead>
              <TableHead>Acheteur</TableHead>
              <TableHead>Vendeur</TableHead>
              <TableHead>Montant</TableHead>
              <TableHead>Motif</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Deadline</TableHead>
              <TableHead>Ouvert le</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-muted-foreground h-24 text-center"
                >
                  Aucun chargeback à traiter.
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="max-w-[180px] truncate font-medium">
                  {row.listing_title ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {row.buyer_username ? `@${row.buyer_username}` : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {row.seller_username ? `@${row.seller_username}` : "—"}
                </TableCell>
                <TableCell>{formatPrice(row.amount)}</TableCell>
                <TableCell className="text-muted-foreground max-w-[180px] truncate">
                  {row.reason}
                </TableCell>
                <TableCell>
                  <Badge variant={stripeStatusVariant(row.status)}>
                    {stripeStatusLabels[row.status] ?? row.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <DeadlineBadge dueBy={row.evidence_due_by} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(row.created_at)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function stripeStatusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "won") return "default";
  if (status === "lost" || status === "charge_refunded") return "destructive";
  if (status === "needs_response" || status === "warning_needs_response") {
    return "destructive";
  }
  return "secondary";
}

function DeadlineBadge({ dueBy }: { dueBy: string | null }) {
  const [now] = useState(() => Date.now());
  if (!dueBy) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  const ms = new Date(dueBy).getTime() - now;
  const days = Math.ceil(ms / (24 * 3600 * 1000));

  if (days <= 0) {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="h-3 w-3" />
        Expiré
      </Badge>
    );
  }
  if (days <= 3) {
    return <Badge variant="destructive">{`J-${days}`}</Badge>;
  }
  if (days <= 7) {
    return <Badge variant="secondary">{`J-${days}`}</Badge>;
  }
  return <Badge variant="outline">{`J-${days}`}</Badge>;
}

// ---------------------------------------------------------------------------
// Internal C2C disputes
// ---------------------------------------------------------------------------

function InternalDisputesTable({ rows }: { rows: InternalDisputeRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Litiges entre membres</CardTitle>
        <CardDescription>
          Disputes ouvertes par l&apos;acheteur (carte endommagée, mauvaise
          carte, colis vide…). Résolution manuelle par l&apos;équipe modération.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Annonce</TableHead>
              <TableHead>Ouvert par</TableHead>
              <TableHead>Acheteur</TableHead>
              <TableHead>Vendeur</TableHead>
              <TableHead>Montant</TableHead>
              <TableHead>Motif</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Ouvert le</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-muted-foreground h-24 text-center"
                >
                  Aucun litige interne en cours.
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="max-w-[180px] truncate font-medium">
                  {row.listing_title ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {row.opened_by_username ? `@${row.opened_by_username}` : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {row.buyer_username ? `@${row.buyer_username}` : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {row.seller_username ? `@${row.seller_username}` : "—"}
                </TableCell>
                <TableCell>
                  {row.total_amount != null
                    ? formatPrice(row.total_amount)
                    : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-[180px] truncate">
                  {row.reason
                    ? (internalReasonLabels[
                        row.reason as keyof typeof internalReasonLabels
                      ] ?? row.reason)
                    : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={internalStatusVariant(row.status)}>
                    {row.status
                      ? (internalStatusLabels[row.status] ?? row.status)
                      : "—"}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(row.created_at)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function internalStatusVariant(
  status: string | null,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "OPEN") return "destructive";
  if (status === "IN_REVIEW") return "secondary";
  if (status === "RESOLVED") return "outline";
  return "secondary";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR");
}
