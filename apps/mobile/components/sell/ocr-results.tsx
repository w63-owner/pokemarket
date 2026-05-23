import { useState } from "react";
import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { MotiView } from "moti";
import { CircleHelp, ScanLine, Sparkles } from "lucide-react-native";
import type { OcrCandidate } from "@pokemarket/shared";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";

const MANUAL_VALUE = "__manual__";

type Props = {
  candidates: OcrCandidate[];
  isLoading: boolean;
  onSelect: (cardKey: string | null) => void;
};

function confidenceColor(confidence: number): string {
  if (confidence >= 80) return "bg-emerald-500";
  if (confidence >= 50) return "bg-amber-500";
  return "bg-red-400";
}

function confidenceLabel(confidence: number): string {
  if (confidence >= 80) return "Forte";
  if (confidence >= 50) return "Moyenne";
  return "Faible";
}

function CandidateCard({
  candidate,
  selected,
}: {
  candidate: OcrCandidate;
  selected: boolean;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <View
      className={cn(
        "flex-row items-start gap-3 rounded-2xl border p-3",
        selected ? "border-primary bg-primary/5" : "border-border bg-card",
      )}
    >
      <View className="mt-1">
        <View
          className={cn(
            "h-5 w-5 items-center justify-center rounded-full border",
            selected ? "border-primary" : "border-border",
          )}
        >
          {selected ? (
            <View className="h-2.5 w-2.5 rounded-full bg-primary" />
          ) : null}
        </View>
      </View>

      <View
        style={{ width: 72, height: 100 }}
        className="overflow-hidden rounded-lg bg-muted"
      >
        {candidate.image_url && !imgError ? (
          <Image
            source={{ uri: candidate.image_url }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <CircleHelp size={20} color="#94a3b8" />
          </View>
        )}
      </View>

      <View className="flex-1 gap-1.5">
        <View className="flex-row items-start justify-between gap-2">
          <Text className="flex-1 text-sm font-semibold" numberOfLines={1}>
            {candidate.name}
          </Text>
          {candidate.hp != null ? (
            <Badge variant="outline">{`${candidate.hp} HP`}</Badge>
          ) : null}
        </View>

        <View className="flex-row flex-wrap items-center gap-1.5">
          {candidate.set_name ? (
            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
              {candidate.set_name}
            </Text>
          ) : null}
          {candidate.rarity ? (
            <Badge variant="secondary">{candidate.rarity}</Badge>
          ) : null}
        </View>

        <View className="mt-1 flex-row items-center gap-2">
          <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <MotiView
              from={{ width: "0%" }}
              animate={{ width: `${candidate.confidence}%` }}
              transition={{ type: "timing", duration: 500 }}
              className={cn(
                "h-full rounded-full",
                confidenceColor(candidate.confidence),
              )}
            />
          </View>
          <Text className="text-[10px] font-medium tabular-nums">
            {candidate.confidence}%
          </Text>
        </View>

        <Text className="text-[10px] text-muted-foreground">
          {confidenceLabel(candidate.confidence)} confiance ·{" "}
          {candidate.language.toUpperCase()}
        </Text>
      </View>
    </View>
  );
}

function ScanSkeleton() {
  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-2">
        <Sparkles size={16} color="#E63946" />
        <Text className="text-sm font-medium text-muted-foreground">
          Analyse de la carte en cours…
        </Text>
      </View>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{ opacity: 1 - i * 0.25 }}
          className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-3"
        >
          <Skeleton style={{ width: 72, height: 100 }} className="rounded-lg" />
          <View className="flex-1 gap-2">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-2 w-full rounded-full" />
          </View>
        </View>
      ))}
    </View>
  );
}

export function OcrResults({ candidates, isLoading, onSelect }: Props) {
  const [selected, setSelected] = useState<string>("");

  if (isLoading) return <ScanSkeleton />;
  if (candidates.length === 0) return null;

  const handleChange = (value: string) => {
    setSelected(value);
    onSelect(value === MANUAL_VALUE ? null : value);
  };

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-2">
        <ScanLine size={16} color="#E63946" />
        <Text className="text-sm font-semibold">
          Résultats de l&apos;identification
        </Text>
        <View className="ml-auto">
          <Badge variant="secondary">
            {`${candidates.length} résultat${candidates.length > 1 ? "s" : ""}`}
          </Badge>
        </View>
      </View>

      {candidates.map((candidate, i) => (
        <Pressable
          key={candidate.card_key}
          onPress={() => handleChange(candidate.card_key)}
        >
          <MotiView
            from={{ opacity: 0, translateY: 8 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 200, delay: i * 50 }}
          >
            <CandidateCard
              candidate={candidate}
              selected={selected === candidate.card_key}
            />
          </MotiView>
        </Pressable>
      ))}

      <Pressable onPress={() => handleChange(MANUAL_VALUE)}>
        <MotiView
          from={{ opacity: 0, translateY: 8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{
            type: "timing",
            duration: 200,
            delay: candidates.length * 50,
          }}
          className={cn(
            "flex-row items-center gap-3 rounded-2xl border border-dashed p-3",
            selected === MANUAL_VALUE
              ? "border-primary bg-primary/5"
              : "border-border bg-card",
          )}
        >
          <View
            className={cn(
              "h-5 w-5 items-center justify-center rounded-full border",
              selected === MANUAL_VALUE ? "border-primary" : "border-border",
            )}
          >
            {selected === MANUAL_VALUE ? (
              <View className="h-2.5 w-2.5 rounded-full bg-primary" />
            ) : null}
          </View>
          <View className="flex-row items-center gap-2">
            <CircleHelp size={16} color="#64748b" />
            <Text variant="muted" className="text-sm font-medium">
              Aucun de ces résultats (Saisie manuelle)
            </Text>
          </View>
        </MotiView>
      </Pressable>
    </View>
  );
}
