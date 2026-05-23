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

export function LoginDialog() {
  const { isOpen, close } = useLoginDialog();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const router = useRouter();

  function handleClose() {
    close();
    setEmail("");
    setPassword("");
    setUsername("");
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
      const { error } = await signUp(email, password, username);
      setLoading(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Vérifiez votre email pour confirmer votre compte");
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
            {mode === "login" ? "Connexion" : "Créer un compte"}
          </DialogTitle>
          <DialogDescription>
            {mode === "login"
              ? "Connectez-vous pour continuer sur PokeMarket."
              : "Rejoignez la marketplace des collectionneurs Pokémon."}
          </DialogDescription>
        </DialogHeader>

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
            <Input
              id="login-dialog-password"
              type="password"
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
      </DialogContent>
    </Dialog>
  );
}
