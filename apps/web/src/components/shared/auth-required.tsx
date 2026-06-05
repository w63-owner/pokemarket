import { EmptyState } from "@/components/shared/empty-state";

type AuthRequiredProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  /** Post-login redirect; also used as the auth page back target via `?next=`. */
  next?: string;
};

export function AuthRequired({
  icon,
  title,
  description,
  next = "/",
}: AuthRequiredProps) {
  const authHref =
    next === "/" ? "/auth" : `/auth?next=${encodeURIComponent(next)}`;

  return (
    <EmptyState
      icon={icon}
      title={title}
      description={description}
      action={{ label: "Se connecter", href: authHref }}
    />
  );
}
