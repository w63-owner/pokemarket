"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Wallet as WalletIcon,
  ArrowRight,
  TrendingUp,
  Clock,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { queryKeys } from "@/lib/query-keys";
import { fetchWalletBalance } from "@/lib/api/wallet";
import { formatPrice } from "@/lib/utils";

export default function ProfileWalletPage() {
  const { data: wallet, isLoading } = useQuery({
    queryKey: queryKeys.wallet.balance(),
    queryFn: fetchWalletBalance,
  });

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="bg-primary/10 rounded-full p-2.5">
            <WalletIcon className="text-primary size-6" />
          </div>
          <h1 className="font-heading text-xl font-bold">Mon portefeuille</h1>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </div>
        ) : (
          <div className="space-y-3">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-full bg-emerald-100 p-2 dark:bg-emerald-900/40">
                  <TrendingUp className="size-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="flex-1">
                  <p className="text-muted-foreground text-xs">Disponible</p>
                  <p className="font-heading text-lg font-bold">
                    {formatPrice(wallet?.available_balance ?? 0)}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-full bg-amber-100 p-2 dark:bg-amber-900/40">
                  <Clock className="size-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1">
                  <p className="text-muted-foreground text-xs">En attente</p>
                  <p className="font-heading text-lg font-bold">
                    {formatPrice(wallet?.pending_balance ?? 0)}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Button className="mt-4 w-full" render={<Link href="/wallet" />}>
              Gérer mon portefeuille
              <ArrowRight className="ml-2 size-4" />
            </Button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
