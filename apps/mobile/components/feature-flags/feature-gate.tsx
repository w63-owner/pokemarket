import { router } from "expo-router";
import { Power } from "lucide-react-native";
import { View } from "react-native";
import type { FeatureFlag } from "@deckdealr/shared";
import { EmptyState } from "@/components/shared";
import { useFeatureFlag } from "@/hooks/use-feature-flags";
import { useThemeColor } from "@/lib/theme-colors";

type FeatureGateProps = {
  flag: FeatureFlag;
  name: string;
  children: React.ReactNode;
};

export function FeatureGate({ flag, name, children }: FeatureGateProps) {
  const { enabled, isLoading } = useFeatureFlag(flag);
  const mutedForeground = useThemeColor("mutedForeground");

  if (isLoading) return null;
  if (enabled) return children;

  return (
    <View className="flex-1 items-center justify-center bg-background">
      <EmptyState
        icon={<Power size={28} color={mutedForeground} />}
        title={`${name} est temporairement indisponible`}
        description="Cette fonctionnalité a été mise en pause. Elle sera de nouveau accessible prochainement."
        action={{
          label: "Retour à l’accueil",
          onPress: () => router.replace("/"),
        }}
      />
    </View>
  );
}
