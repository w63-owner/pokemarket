"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { resetPassword } = useAuth();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await resetPassword(email);
    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setSent(true);
    toast.success("Email envoyé ! Vérifiez votre boîte de réception.");
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="font-heading text-2xl font-bold">Mot de passe oublié</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Entrez votre email pour recevoir un lien de réinitialisation.
        </p>
      </div>

      {sent ? (
        <div className="space-y-4 text-center">
          <div className="bg-success/10 text-success rounded-lg p-4">
            Un email a été envoyé à <strong>{email}</strong>.
          </div>
          <Link href="/auth" className="text-brand text-sm hover:underline">
            Retour à la connexion
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="vous@exemple.fr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Envoi..." : "Envoyer le lien"}
          </Button>
          <div className="text-center">
            <Link
              href="/auth"
              className="text-muted-foreground text-sm hover:underline"
            >
              Retour à la connexion
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
