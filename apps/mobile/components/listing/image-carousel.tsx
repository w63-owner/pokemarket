import { useState } from "react";
import { Dimensions, View } from "react-native";
import { Image } from "expo-image";
import { FlashList } from "@shopify/flash-list";

type Props = {
  images: string[];
};

export function ImageCarousel({ images }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const width = Dimensions.get("window").width;

  if (images.length === 0) return null;

  return (
    <View>
      <FlashList
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        data={images}
        keyExtractor={(uri, idx) => `${uri}-${idx}`}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / width);
          setActiveIndex(idx);
        }}
        renderItem={({ item }) => (
          <Image
            source={{ uri: item }}
            style={{ width, aspectRatio: 0.72 }}
            contentFit="cover"
            transition={200}
          />
        )}
      />
      {images.length > 1 ? (
        <View className="absolute bottom-3 self-center flex-row gap-1.5">
          {images.map((_, i) => (
            <View
              key={i}
              className={`h-1.5 rounded-full ${i === activeIndex ? "w-5 bg-white" : "w-1.5 bg-white/60"}`}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
