"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import Link from "next/link";
import { ArrowLeft, MailCheck } from "lucide-react";
import { SmartBackButton } from "@/components/ui/smart-back-button";

function AuthForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";
  const mode = searchParams.get("mode") === "register" ? "register" : "login";

  const confirmed = searchParams.get("confirmed");
  const errorParam = searchParams.get("error");

  function showRegister() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("mode", "register");
    router.push(`/auth?${params.toString()}`);
  }

  function showLogin() {
    router.back();
  }

  function returnToLogin() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("mode");
    setConfirmationEmail(null);
    router.replace(`/auth${params.size ? `?${params.toString()}` : ""}`);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    if (mode === "login") {
      const { error } = await signIn(email, password);
      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }
    } else {
      if (username.length < 3) {
        toast.error("Le pseudo doit contenir au moins 3 caractères");
        setLoading(false);
        return;
      }
      const { data, error } = await signUp(email, password, username, next);
      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }
      if (data.session) {
        router.push(next);
        router.refresh();
        return;
      }
      setConfirmationEmail(email);
      setLoading(false);
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {mode === "register" ? (
        <Button
          type="button"
          variant="ghost"
          onClick={showLogin}
          className="-ml-2 min-h-11"
        >
          <ArrowLeft className="size-5" />
          Connexion
        </Button>
      ) : (
        <SmartBackButton
          returnTo={searchParams.get("next") ?? undefined}
          fallbackUrl="/"
          variant="ghost"
          className="-ml-2"
        />
      )}

      <div className="text-center">
        <h1 className="font-heading text-3xl font-bold">
          Poke<span className="text-brand">Market</span>
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {mode === "login"
            ? "Connectez-vous à votre compte"
            : "Créez votre compte"}
        </p>
      </div>

      {confirmed === "true" && (
        <div className="bg-success/10 text-success rounded-lg p-3 text-center text-sm">
          Email confirmé ! Vous pouvez maintenant vous connecter.
        </div>
      )}

      {errorParam && (
        <div className="bg-destructive/10 text-destructive rounded-lg p-3 text-center text-sm">
          {errorParam}
        </div>
      )}

      {confirmationEmail ? (
        <div
          className="flex flex-col items-center gap-5 text-center"
          aria-live="polite"
        >
          <div className="bg-brand/10 flex size-20 items-center justify-center rounded-full">
            <MailCheck className="text-brand size-10" aria-hidden="true" />
          </div>
          <div className="space-y-2">
            <h2 className="font-heading text-xl font-semibold">
              Consultez votre boîte mail
            </h2>
            <p className="text-sm">
              Nous avons envoyé un email à{" "}
              <strong className="break-all">{confirmationEmail}</strong>.
            </p>
            <p className="text-muted-foreground text-sm">
              Cliquez sur le lien reçu pour confirmer votre adresse et finaliser
              votre inscription. Pensez à vérifier vos courriers indésirables.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={returnToLogin}
          >
            Retour à la connexion
          </Button>
        </div>
      ) : (
        <>
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div className="space-y-2">
                <Label htmlFor="username">Pseudo</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="votre_pseudo"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  minLength={3}
                  maxLength={30}
                />
              </div>
            )}

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

            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <PasswordInput
                id="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
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
              onClick={mode === "login" ? showRegister : showLogin}
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
                >
                  Mot de passe oublié ?
                </Link>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function AuthFormSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<AuthFormSkeleton />}>
      <AuthForm />
    </Suspense>
  );
}
