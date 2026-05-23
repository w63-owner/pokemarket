import { router } from "expo-router";
import { EmptyState } from "./empty-state";

type Props = {
  icon: React.ReactNode;
  title: string;
  description: string;
};

export function AuthRequired({ icon, title, description }: Props) {
  return (
    <EmptyState
      icon={icon}
      title={title}
      description={description}
      action={{
        label: "Se connecter",
        onPress: () => router.push("/(auth)/login"),
      }}
    />
  );
}
