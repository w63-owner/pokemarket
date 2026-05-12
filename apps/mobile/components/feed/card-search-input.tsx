import { forwardRef } from "react";
import { Pressable, TextInput, View } from "react-native";
import { Search, X } from "lucide-react-native";

import { Input } from "@/components/ui";

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
    return (
      <View className="relative flex-1">
        <View className="absolute left-3 top-0 bottom-0 z-10 justify-center">
          <Search size={18} color="#94a3b8" />
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
              onChangeText("");
              onClear?.();
            }}
            hitSlop={8}
            className="absolute right-3 top-0 bottom-0 z-10 justify-center"
          >
            <X size={16} color="#64748b" />
          </Pressable>
        ) : null}
      </View>
    );
  },
);
