"use client";

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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal,
  Eye,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Scale,
} from "lucide-react";

type MockDispute = {
  id: string;
  transaction_id: string;
  buyer: string;
  seller: string;
  card: string;
  amount: string;
  reason: string;
  status: "open" | "under_review" | "resolved" | "refunded";
  opened_at: string;
};

const mockDisputes: MockDispute[] = [
  {
    id: "D-001",
    transaction_id: "TX-4821",
    buyer: "ash_ketchum",
    seller: "dark_collector",
    card: "Charizard Base Set",
    amount: "1 200,00 €",
    reason: "Carte reçue en mauvais état",
    status: "open",
    opened_at: "23/03/2026",
  },
  {
    id: "D-002",
    transaction_id: "TX-4793",
    buyer: "misty_cerulean",
    seller: "scam_maybe",
    card: "Pikachu Illustrator",
    amount: "50 000,00 €",
    reason: "Contrefaçon suspectée",
    status: "under_review",
    opened_at: "21/03/2026",
  },
  {
    id: "D-003",
    transaction_id: "TX-4756",
    buyer: "brock_pewter",
    seller: "card_master",
    card: "Mewtwo GX",
    amount: "35,00 €",
    reason: "Colis non reçu",
    status: "open",
    opened_at: "19/03/2026",
  },
  {
    id: "D-004",
    transaction_id: "TX-4701",
    buyer: "gary_oak",
    seller: "bulk_seller",
    card: "Lot 50 communes",
    amount: "15,00 €",
    reason: "Cartes manquantes dans le lot",
    status: "refunded",
    opened_at: "15/03/2026",
  },
  {
    id: "D-005",
    transaction_id: "TX-4680",
    buyer: "nurse_joy",
    seller: "legend_cards",
    card: "Rayquaza Gold Star",
    amount: "450,00 €",
    reason: "Mauvais grading annoncé",
    status: "resolved",
    opened_at: "12/03/2026",
  },
];

const statusConfig = {
  open: { label: "Ouvert", variant: "destructive" as const },
  under_review: { label: "En examen", variant: "secondary" as const },
  resolved: { label: "Résolu", variant: "outline" as const },
  refunded: { label: "Remboursé", variant: "default" as const },
};

export default function AdminDisputesPage() {
  const openCount = mockDisputes.filter(
    (d) => d.status === "open" || d.status === "under_review",
  ).length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          Gestion des litiges
        </h1>
        <p className="text-muted-foreground text-sm">
          Traitez les disputes entre acheteurs et vendeurs
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium">
              Litiges ouverts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Scale className="text-destructive h-5 w-5" />
              <span className="text-2xl font-bold">{openCount}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium">
              Résolus ce mois
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <span className="text-2xl font-bold">
                {mockDisputes.filter((d) => d.status === "resolved").length}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium">
              Remboursements
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <RotateCcw className="text-primary h-5 w-5" />
              <span className="text-2xl font-bold">
                {mockDisputes.filter((d) => d.status === "refunded").length}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tous les litiges</CardTitle>
          <CardDescription>
            {mockDisputes.length} litige{mockDisputes.length !== 1 ? "s" : ""}{" "}
            au total
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Carte</TableHead>
                <TableHead>Acheteur</TableHead>
                <TableHead>Vendeur</TableHead>
                <TableHead>Montant</TableHead>
                <TableHead>Motif</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockDisputes.map((dispute) => {
                const status = statusConfig[dispute.status];
                return (
                  <TableRow key={dispute.id}>
                    <TableCell className="font-mono text-xs">
                      {dispute.id}
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate font-medium">
                      {dispute.card}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      @{dispute.buyer}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      @{dispute.seller}
                    </TableCell>
                    <TableCell>{dispute.amount}</TableCell>
                    <TableCell className="text-muted-foreground max-w-[180px] truncate">
                      {dispute.reason}
                    </TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {dispute.opened_at}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                            />
                          }
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            <Eye className="mr-2 h-4 w-4" />
                            Voir la transaction
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem>
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Marquer comme résolu
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <RotateCcw className="mr-2 h-4 w-4" />
                            Rembourser via Stripe
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:text-destructive">
                            <XCircle className="mr-2 h-4 w-4" />
                            Rejeter le litige
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
