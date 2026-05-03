import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";

import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const URGENT_STATUSES = ["needs_response", "warning_needs_response"] as const;

type CountResult = { stripe: number; internal: number; expiringSoon: number };

async function countOpenDisputes(): Promise<CountResult> {
  try {
    const admin = createAdminClient();
    const [stripeRes, internalRes] = await Promise.all([
      admin
        .from("stripe_disputes")
        .select("id, status, evidence_due_by")
        .in("status", URGENT_STATUSES as unknown as string[]),
      admin.from("disputes").select("id").in("status", ["OPEN", "IN_REVIEW"]),
    ]);

    const stripeRows = stripeRes.data ?? [];
    const now = Date.now();
    const expiringSoon = stripeRows.filter((d) => {
      if (!d.evidence_due_by) return false;
      const ms = new Date(d.evidence_due_by).getTime() - now;
      return ms > 0 && ms < 3 * 24 * 3600 * 1000;
    }).length;

    return {
      stripe: stripeRows.length,
      internal: internalRes.data?.length ?? 0,
      expiringSoon,
    };
  } catch {
    return { stripe: 0, internal: 0, expiringSoon: 0 };
  }
}

export async function DisputesAdminBanner() {
  const counts = await countOpenDisputes();
  const total = counts.stripe + counts.internal;
  if (total === 0) return null;

  const isUrgent = counts.expiringSoon > 0;

  return (
    <Link href="/admin/disputes" className="block">
      <Card
        className={cn(
          "border-l-4 transition-colors",
          isUrgent
            ? "border-l-destructive bg-destructive/5 hover:bg-destructive/10"
            : "border-l-amber-500 bg-amber-50/50 hover:bg-amber-100/50 dark:bg-amber-900/10 dark:hover:bg-amber-900/20",
        )}
      >
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <AlertTriangle
              className={cn(
                "h-5 w-5",
                isUrgent ? "text-destructive" : "text-amber-600",
              )}
            />
            <div>
              <p className="text-sm font-semibold">
                {total} litige{total > 1 ? "s" : ""} en attente de traitement
              </p>
              <p className="text-muted-foreground text-xs">
                {counts.stripe} chargeback{counts.stripe !== 1 ? "s" : ""}{" "}
                Stripe · {counts.internal} interne
                {counts.internal !== 1 ? "s" : ""}
                {counts.expiringSoon > 0 && (
                  <>
                    {" "}
                    ·{" "}
                    <span className="text-destructive font-medium">
                      {counts.expiringSoon} avec deadline &lt; 3 jours
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>
          <ChevronRight className="text-muted-foreground h-4 w-4" />
        </CardContent>
      </Card>
    </Link>
  );
}
