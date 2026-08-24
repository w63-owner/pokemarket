"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useLoginDialog } from "@/lib/login-dialog-context";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { MailCheck } from "lucide-react";

export function LoginDialog() {
  const { isOpen, close } = useLoginDialog();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const router = useRouter();

  function handleClose() {
    close();
    setEmail("");
    setPassword("");
    setUsername("");
    setConfirmationEmail(null);
    setMode("login");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    if (mode === "login") {
      const { error } = await signIn(email, password);
      setLoading(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      handleClose();
      router.refresh();
    } else {
      if (username.length < 3) {
        toast.error("Le pseudo doit contenir au moins 3 caractères");
        setLoading(false);
        return;
      }
      const { data, error } = await signUp(email, password, username);
      setLoading(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      if (data.session) {
        handleClose();
        router.refresh();
        return;
      }
      setConfirmationEmail(email);
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {confirmationEmail
              ? "Consultez votre boîte mail"
              : mode === "login"
                ? "Connexion"
                : "Créer un compte"}
          </DialogTitle>
          <DialogDescription>
            {confirmationEmail
              ? "Une dernière étape est nécessaire pour finaliser votre inscription."
              : mode === "login"
                ? "Connectez-vous pour continuer sur DeckDealr."
                : "Rejoignez la marketplace des collectionneurs Pokémon."}
          </DialogDescription>
        </DialogHeader>

        {confirmationEmail ? (
          <div
            className="flex flex-col items-center gap-4 py-2 text-center"
            aria-live="polite"
          >
            <div className="bg-brand/10 flex size-16 items-center justify-center rounded-full">
              <MailCheck className="text-brand size-8" aria-hidden="true" />
            </div>
            <div className="space-y-2">
              <p className="text-sm">
                Nous avons envoyé un email à{" "}
                <strong className="break-all">{confirmationEmail}</strong>.
              </p>
              <p className="text-muted-foreground text-sm">
                Cliquez sur le lien reçu pour confirmer votre adresse et
                finaliser votre inscription. Pensez à vérifier vos courriers
                indésirables.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleClose}
            >
              J&apos;ai compris
            </Button>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "register" && (
                <div className="space-y-2">
                  <Label htmlFor="login-dialog-username">Pseudo</Label>
                  <Input
                    id="login-dialog-username"
                    type="text"
                    placeholder="votre_pseudo"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    minLength={3}
                    maxLength={30}
                    autoComplete="username"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="login-dialog-email">Email</Label>
                <Input
                  id="login-dialog-email"
                  type="email"
                  placeholder="vous@exemple.fr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="login-dialog-password">Mot de passe</Label>
                <PasswordInput
                  id="login-dialog-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading
                  ? "Chargement..."
                  : mode === "login"
                    ? "Se connecter"
                    : "Créer mon compte"}
              </Button>
            </form>

            <div className="space-y-2 text-center text-sm">
              <button
                type="button"
                onClick={() => setMode(mode === "login" ? "register" : "login")}
                className="text-brand hover:underline"
              >
                {mode === "login"
                  ? "Pas encore de compte ? Inscrivez-vous"
                  : "Déjà un compte ? Connectez-vous"}
              </button>

              {mode === "login" && (
                <div>
                  <Link
                    href="/auth/forgot-password"
                    className="text-muted-foreground hover:underline"
                    onClick={handleClose}
                  >
                    Mot de passe oublié ?
                  </Link>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
