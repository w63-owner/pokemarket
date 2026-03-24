import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ShieldX } from "lucide-react";

export async function AdminGuard({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="bg-destructive/10 flex h-16 w-16 items-center justify-center rounded-full">
          <ShieldX className="text-destructive h-8 w-8" />
        </div>
        <h1 className="font-heading text-2xl font-bold">403 — Accès refusé</h1>
        <p className="text-muted-foreground max-w-sm">
          Vous n&apos;avez pas les permissions nécessaires pour accéder à cette
          page.
        </p>
        <Link
          href="/"
          className="text-primary hover:text-primary/80 mt-2 text-sm font-medium underline underline-offset-4"
        >
          Retour à l&apos;accueil
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
