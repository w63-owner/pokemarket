"use client";

import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Search, Pause, Trash2, Eye } from "lucide-react";

type MockListing = {
  id: string;
  title: string;
  seller: string;
  price: string;
  status: "active" | "suspended" | "sold";
  created_at: string;
  reports: number;
};

const mockListings: MockListing[] = [
  {
    id: "1",
    title: "Charizard Base Set 1ère Édition",
    seller: "dark_collector",
    price: "1 200,00 €",
    status: "active",
    created_at: "22/03/2026",
    reports: 3,
  },
  {
    id: "2",
    title: "Pikachu Illustrator (Suspect)",
    seller: "scam_maybe",
    price: "50 000,00 €",
    status: "active",
    created_at: "21/03/2026",
    reports: 12,
  },
  {
    id: "3",
    title: "Lot 50 cartes communes",
    seller: "bulk_seller",
    price: "15,00 €",
    status: "active",
    created_at: "20/03/2026",
    reports: 0,
  },
  {
    id: "4",
    title: "Mewtwo GX Rainbow",
    seller: "pokemon_fan42",
    price: "35,00 €",
    status: "suspended",
    created_at: "19/03/2026",
    reports: 2,
  },
  {
    id: "5",
    title: "Dracaufeu VMAX Shiny",
    seller: "card_master",
    price: "89,00 €",
    status: "sold",
    created_at: "18/03/2026",
    reports: 0,
  },
  {
    id: "6",
    title: "Rayquaza Gold Star",
    seller: "legend_cards",
    price: "450,00 €",
    status: "active",
    created_at: "17/03/2026",
    reports: 1,
  },
];

const statusConfig = {
  active: { label: "Active", variant: "secondary" as const },
  suspended: { label: "Suspendue", variant: "destructive" as const },
  sold: { label: "Vendue", variant: "outline" as const },
};

export default function AdminListingsPage() {
  const [search, setSearch] = useState("");

  const filtered = mockListings.filter(
    (l) =>
      l.title.toLowerCase().includes(search.toLowerCase()) ||
      l.seller.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          Modération des annonces
        </h1>
        <p className="text-muted-foreground text-sm">
          Gérez et modérez les annonces publiées sur la plateforme
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Annonces</CardTitle>
              <CardDescription>
                {filtered.length} annonce{filtered.length !== 1 ? "s" : ""}
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                placeholder="Rechercher une annonce…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Annonce</TableHead>
                <TableHead>Vendeur</TableHead>
                <TableHead>Prix</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-center">Signalements</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((listing) => {
                const status = statusConfig[listing.status];
                return (
                  <TableRow key={listing.id}>
                    <TableCell className="max-w-[200px] truncate font-medium">
                      {listing.title}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      @{listing.seller}
                    </TableCell>
                    <TableCell>{listing.price}</TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {listing.reports > 0 ? (
                        <Badge
                          variant={
                            listing.reports >= 5 ? "destructive" : "outline"
                          }
                        >
                          {listing.reports}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {listing.created_at}
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
                            Voir l&apos;annonce
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Pause className="mr-2 h-4 w-4" />
                            Suspendre
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive focus:text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-muted-foreground h-24 text-center"
                  >
                    Aucune annonce trouvée.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
