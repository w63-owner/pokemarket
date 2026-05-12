import { ScrollView, View } from "react-native";
import type {
  LegalBlock,
  LegalDocument,
  LegalSection,
} from "@pokemarket/shared";
import { Text } from "@/components/ui";

type Props = {
  document: LegalDocument;
};

export function LegalContent({ document }: Props) {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <Text variant="h2">{document.title}</Text>
      <Text variant="caption" className="mt-1">
        Dernière mise à jour : {document.lastUpdated}
      </Text>

      {document.intro?.length ? (
        <View className="mt-4 gap-3">
          {document.intro.map((block, i) => (
            <BlockRenderer key={`intro-${i}`} block={block} />
          ))}
        </View>
      ) : null}

      <View className="mt-6 gap-6">
        {document.sections.map((section, idx) => (
          <SectionRenderer key={`section-${idx}`} section={section} />
        ))}
      </View>
    </ScrollView>
  );
}

function SectionRenderer({ section }: { section: LegalSection }) {
  return (
    <View className="gap-3">
      <Text variant={section.level === 2 ? "h3" : "h4"}>{section.heading}</Text>
      {section.body.map((block, i) => (
        <BlockRenderer key={i} block={block} />
      ))}
    </View>
  );
}

function BlockRenderer({ block }: { block: LegalBlock }) {
  if (block.type === "p") {
    return (
      <Text className="text-sm leading-6 text-foreground">{block.text}</Text>
    );
  }
  if (block.type === "ul") {
    return (
      <View className="gap-1.5">
        {block.items.map((item, i) => (
          <View key={i} className="flex-row gap-2 pr-2">
            <Text className="text-foreground">•</Text>
            <Text className="flex-1 text-sm leading-6 text-foreground">
              {item}
            </Text>
          </View>
        ))}
      </View>
    );
  }
  // Table — simple stacked rendering for narrow mobile screens.
  return (
    <View className="gap-2 rounded-xl border border-border p-3">
      {block.rows.map((row, i) => (
        <View key={i} className="gap-1">
          {row.map((cell, j) => (
            <View key={j} className="flex-row gap-2">
              <Text variant="muted" className="w-1/3 text-xs uppercase">
                {block.headers[j] ?? ""}
              </Text>
              <Text className="flex-1 text-sm text-foreground">{cell}</Text>
            </View>
          ))}
          {i < block.rows.length - 1 ? (
            <View className="my-1 h-px bg-border" />
          ) : null}
        </View>
      ))}
    </View>
  );
}
