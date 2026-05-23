import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DollarSign,
  Users,
  ShoppingBag,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

const metrics = [
  {
    label: "GMV (30j)",
    value: "12 480 €",
    change: "+12,5 %",
    trend: "up" as const,
    icon: DollarSign,
    description: "Volume brut des ventes",
  },
  {
    label: "Utilisateurs",
    value: "1 247",
    change: "+8,3 %",
    trend: "up" as const,
    icon: Users,
    description: "Comptes actifs ce mois",
  },
  {
    label: "Annonces actives",
    value: "3 891",
    change: "+3,1 %",
    trend: "up" as const,
    icon: ShoppingBag,
    description: "Actuellement en ligne",
  },
  {
    label: "Taux de conversion",
    value: "4,2 %",
    change: "-0,8 %",
    trend: "down" as const,
    icon: TrendingUp,
    description: "Visites → achats",
  },
] as const;

const recentTransactions = [
  {
    buyer: "ash_ketchum",
    card: "Charizard VMAX",
    amount: "45,00 €",
    date: "Il y a 2h",
  },
  {
    buyer: "misty_cerulean",
    card: "Pikachu Gold Star",
    amount: "120,00 €",
    date: "Il y a 5h",
  },
  {
    buyer: "brock_pewter",
    card: "Mewtwo EX",
    amount: "28,50 €",
    date: "Il y a 8h",
  },
  {
    buyer: "gary_oak",
    card: "Blastoise Base Set",
    amount: "85,00 €",
    date: "Hier",
  },
  {
    buyer: "nurse_joy",
    card: "Rayquaza VMAX Alt",
    amount: "210,00 €",
    date: "Hier",
  },
];

export default function AdminDashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          Dashboard
        </h1>
        <p className="text-muted-foreground text-sm">
          Vue d&apos;ensemble de l&apos;activité PokeMarket
        </p>
      </div>

      {/* Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label}>
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardDescription className="text-xs font-medium">
                {metric.label}
              </CardDescription>
              <metric.icon className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metric.value}</div>
              <div className="mt-1 flex items-center gap-1 text-xs">
                {metric.trend === "up" ? (
                  <ArrowUpRight className="h-3 w-3 text-emerald-500" />
                ) : (
                  <ArrowDownRight className="text-destructive h-3 w-3" />
                )}
                <span
                  className={
                    metric.trend === "up"
                      ? "text-emerald-500"
                      : "text-destructive"
                  }
                >
                  {metric.change}
                </span>
                <span className="text-muted-foreground">vs mois dernier</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart placeholder + recent activity */}
      <div className="grid gap-4 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Volume des ventes</CardTitle>
            <CardDescription>Évolution mensuelle du GMV</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-64 items-end gap-2">
              {[40, 55, 35, 70, 50, 65, 80, 60, 75, 90, 85, 95].map((h, i) => (
                <div
                  key={i}
                  className="flex flex-1 flex-col items-center gap-1"
                >
                  <div
                    className="bg-primary/80 hover:bg-primary w-full rounded-t-sm transition-all"
                    style={{ height: `${(h / 100) * 100}%` }}
                  />
                  <span className="text-muted-foreground text-[10px]">
                    {
                      [
                        "J",
                        "F",
                        "M",
                        "A",
                        "M",
                        "J",
                        "J",
                        "A",
                        "S",
                        "O",
                        "N",
                        "D",
                      ][i]
                    }
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Transactions récentes</CardTitle>
            <CardDescription>Dernières ventes confirmées</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentTransactions.map((tx, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{tx.card}</p>
                    <p className="text-muted-foreground text-xs">
                      par @{tx.buyer} · {tx.date}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold">
                    {tx.amount}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
