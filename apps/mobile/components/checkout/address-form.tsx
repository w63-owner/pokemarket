import { useEffect, useRef, useState } from "react";
import { Pressable, View, ActivityIndicator } from "react-native";
import { MapPin } from "lucide-react-native";
import {
  COUNTRY_LABELS,
  SHIPPING_COUNTRIES,
  type ShippingCountry,
} from "@pokemarket/shared";
import { Input, Label, Select, Text } from "@/components/ui";

type AddressFormProps = {
  country: ShippingCountry;
  addressLine: string;
  city: string;
  postcode: string;
  onCountryChange: (country: ShippingCountry) => void;
  onAddressLineChange: (value: string) => void;
  onCityChange: (value: string) => void;
  onPostcodeChange: (value: string) => void;
};

type AddressSuggestion = {
  label: string;
  name: string;
  postcode: string;
  city: string;
};

const ADDRESS_API_URL = "https://api-adresse.data.gouv.fr/search";

/**
 * Mobile shipping address form.
 *
 * For French addresses, uses the same `api-adresse.data.gouv.fr`
 * autocomplete as the web version, but renders the suggestions inline
 * below the input instead of in an absolutely-positioned dropdown
 * (RN doesn't support `position: absolute` overlays cleanly inside
 * a ScrollView). For other countries, falls back to a plain input.
 */
export function AddressForm({
  country,
  addressLine,
  city,
  postcode,
  onCountryChange,
  onAddressLineChange,
  onCityChange,
  onPostcodeChange,
}: AddressFormProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressFetchRef = useRef(false);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const countryOptions = SHIPPING_COUNTRIES.map((code) => ({
    value: code,
    label: COUNTRY_LABELS[code],
  }));

  function fetchSuggestions(query: string) {
    if (country !== "FR" || query.length < 3) {
      setSuggestions([]);
      return;
    }
    setIsFetching(true);
    const url = `${ADDRESS_API_URL}?q=${encodeURIComponent(query)}&limit=5&type=housenumber&autocomplete=1`;
    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.features) {
          setSuggestions([]);
          return;
        }
        const results: AddressSuggestion[] = data.features.map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (f: any) => ({
            label: f.properties.label,
            name: f.properties.name,
            postcode: f.properties.postcode,
            city: f.properties.city,
          }),
        );
        setSuggestions(results);
      })
      .catch(() => setSuggestions([]))
      .finally(() => setIsFetching(false));
  }

  function handleAddressChange(value: string) {
    onAddressLineChange(value);
    if (suppressFetchRef.current) {
      suppressFetchRef.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 300);
  }

  function handlePickSuggestion(s: AddressSuggestion) {
    suppressFetchRef.current = true;
    onAddressLineChange(s.name);
    onCityChange(s.city);
    onPostcodeChange(s.postcode);
    setSuggestions([]);
  }

  return (
    <View className="gap-3">
      <View className="gap-1.5">
        <Label>Pays</Label>
        <Select
          value={country}
          onValueChange={(v) => onCountryChange(v as ShippingCountry)}
          options={countryOptions}
        />
      </View>

      <View className="gap-1.5">
        <Label>Adresse</Label>
        <View className="relative">
          <Input
            value={addressLine}
            onChangeText={handleAddressChange}
            placeholder="12 rue de la Pokéball"
            autoComplete="street-address"
          />
          {isFetching ? (
            <View className="absolute right-3 top-3.5">
              <ActivityIndicator size="small" color="#94a3b8" />
            </View>
          ) : null}
        </View>

        {suggestions.length > 0 ? (
          <View className="overflow-hidden rounded-xl border border-border bg-card">
            {suggestions.map((s) => (
              <Pressable
                key={s.label}
                onPress={() => handlePickSuggestion(s)}
                className="flex-row items-center gap-2.5 px-3 py-3 active:bg-muted"
              >
                <MapPin size={16} color="#64748b" />
                <Text className="flex-1 text-sm" numberOfLines={1}>
                  {s.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1 gap-1.5">
          <Label>Code postal</Label>
          <Input
            value={postcode}
            onChangeText={onPostcodeChange}
            placeholder="75001"
            keyboardType="number-pad"
            autoComplete="postal-code"
          />
        </View>
        <View className="flex-1 gap-1.5">
          <Label>Ville</Label>
          <Input
            value={city}
            onChangeText={onCityChange}
            placeholder="Paris"
            autoComplete="postal-address-locality"
          />
        </View>
      </View>
    </View>
  );
}
