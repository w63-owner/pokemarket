import { forwardRef } from "react";
import { Pressable, TextInput, View } from "react-native";
import { Search, X } from "lucide-react-native";

import { Input } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { useThemeColor } from "@/lib/theme-colors";

type Props = {
  value: string;
  onChangeText: (value: string) => void;
  onClear?: () => void;
  onSubmit?: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
};

export const CardSearchInput = forwardRef<TextInput, Props>(
  function CardSearchInput(
    {
      value,
      onChangeText,
      onClear,
      onSubmit,
      onFocus,
      onBlur,
      placeholder = "Carte, série ou bloc (ex: Dracaufeu 11/25)…",
    },
    ref,
  ) {
    const mutedForeground = useThemeColor("mutedForeground");
    return (
      <View className="relative flex-1">
        <View className="absolute bottom-0 left-3 top-0 z-10 justify-center">
          <Search size={18} color={mutedForeground} />
        </View>
        <Input
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          onFocus={onFocus}
          onBlur={onBlur}
          onSubmitEditing={(e) => onSubmit?.(e.nativeEvent.text)}
          placeholder={placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          className="pl-10 pr-10"
        />
        {value ? (
          <Pressable
            onPress={() => {
              haptic("tap");
              onChangeText("");
              onClear?.();
            }}
            hitSlop={8}
            className="absolute bottom-0 right-3 top-0 z-10 justify-center"
          >
            <X size={16} color={mutedForeground} />
          </Pressable>
        ) : null}
      </View>
    );
  },
);
