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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal,
  Search,
  Eye,
  Ban,
  ShieldCheck,
  UserX,
  Mail,
} from "lucide-react";

type MockUser = {
  id: string;
  username: string;
  email: string;
  role: "user" | "admin";
  status: "active" | "suspended" | "banned";
  listings_count: number;
  transactions_count: number;
  joined_at: string;
};

const mockUsers: MockUser[] = [
  {
    id: "1",
    username: "ash_ketchum",
    email: "ash@pokemon.com",
    role: "user",
    status: "active",
    listings_count: 24,
    transactions_count: 18,
    joined_at: "15/01/2026",
  },
  {
    id: "2",
    username: "dark_collector",
    email: "dark@mail.com",
    role: "user",
    status: "active",
    listings_count: 142,
    transactions_count: 89,
    joined_at: "03/11/2025",
  },
  {
    id: "3",
    username: "scam_maybe",
    email: "scam@fake.com",
    role: "user",
    status: "suspended",
    listings_count: 3,
    transactions_count: 1,
    joined_at: "20/03/2026",
  },
  {
    id: "4",
    username: "misty_cerulean",
    email: "misty@pokemon.com",
    role: "user",
    status: "active",
    listings_count: 56,
    transactions_count: 34,
    joined_at: "28/12/2025",
  },
  {
    id: "5",
    username: "admin_poke",
    email: "admin@pokemarket.fr",
    role: "admin",
    status: "active",
    listings_count: 0,
    transactions_count: 0,
    joined_at: "01/09/2025",
  },
  {
    id: "6",
    username: "toxic_trader",
    email: "toxic@mail.com",
    role: "user",
    status: "banned",
    listings_count: 7,
    transactions_count: 2,
    joined_at: "10/02/2026",
  },
  {
    id: "7",
    username: "card_master",
    email: "master@cards.fr",
    role: "user",
    status: "active",
    listings_count: 89,
    transactions_count: 67,
    joined_at: "15/10/2025",
  },
  {
    id: "8",
    username: "brock_pewter",
    email: "brock@pokemon.com",
    role: "user",
    status: "active",
    listings_count: 12,
    transactions_count: 8,
    joined_at: "05/02/2026",
  },
];

const statusConfig = {
  active: { label: "Actif", variant: "secondary" as const },
  suspended: { label: "Suspendu", variant: "destructive" as const },
  banned: { label: "Banni", variant: "destructive" as const },
};

export default function AdminUsersPage() {
  const [search, setSearch] = useState("");

  const filtered = mockUsers.filter(
    (u) =>
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          Gestion des utilisateurs
        </h1>
        <p className="text-muted-foreground text-sm">
          Recherchez, consultez et modérez les comptes utilisateurs
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Utilisateurs</CardTitle>
              <CardDescription>
                {filtered.length} utilisateur{filtered.length !== 1 ? "s" : ""}
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-80">
              <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                placeholder="Rechercher par nom ou email…"
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
                <TableHead>Utilisateur</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-center">Annonces</TableHead>
                <TableHead className="text-center">Transactions</TableHead>
                <TableHead>Inscrit le</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((user) => {
                const status = statusConfig[user.status];
                return (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        @{user.username}
                        {user.role === "admin" && (
                          <ShieldCheck className="text-primary h-3.5 w-3.5" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.email}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={user.role === "admin" ? "default" : "outline"}
                      >
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {user.listings_count}
                    </TableCell>
                    <TableCell className="text-center">
                      {user.transactions_count}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.joined_at}
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
                            Voir le profil
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Mail className="mr-2 h-4 w-4" />
                            Envoyer un email
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem>
                            <UserX className="mr-2 h-4 w-4" />
                            Suspendre
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive focus:text-destructive">
                            <Ban className="mr-2 h-4 w-4" />
                            Bannir
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
                    colSpan={8}
                    className="text-muted-foreground h-24 text-center"
                  >
                    Aucun utilisateur trouvé.
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
