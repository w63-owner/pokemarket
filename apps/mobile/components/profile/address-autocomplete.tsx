import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { MapPin, X } from "lucide-react-native";
import { SHIPPING_COUNTRIES, type ShippingCountry } from "@pokemarket/shared";

import { Input, Sheet, Text } from "@/components/ui";
import { useThemeColor } from "@/lib/theme-colors";

const ALLOWED_COUNTRIES = SHIPPING_COUNTRIES as readonly string[];

export type AddressResult = {
  label: string;
  addressLine: string;
  city: string;
  postalCode: string;
  countryCode: string;
};

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_id?: number;
    country?: string;
    countrycode?: string;
    city?: string;
    town?: string;
    village?: string;
    postcode?: string;
    state?: string;
    street?: string;
    housenumber?: string;
    name?: string;
    type?: string;
  };
};

type Props = {
  value: AddressResult | null;
  onChange: (result: AddressResult | null) => void;
  placeholder?: string;
};

function extractCity(p: PhotonFeature["properties"]): string {
  return p.city || p.town || p.village || "";
}

function extractStreet(p: PhotonFeature["properties"]): string {
  const parts: string[] = [];
  if (p.housenumber) parts.push(p.housenumber);
  if (p.street) parts.push(p.street);
  if (
    parts.length === 0 &&
    p.name &&
    p.type !== "city" &&
    p.type !== "district"
  ) {
    parts.push(p.name);
  }
  return parts.join(" ");
}

function formatLabel(p: PhotonFeature["properties"]): string {
  const street = extractStreet(p);
  const city = extractCity(p);
  const parts: string[] = [];
  if (street) parts.push(street);
  if (city) parts.push(city);
  if (p.postcode) parts.push(p.postcode);
  if (p.country) parts.push(p.country);
  return parts.join(", ");
}

function formatPrimary(p: PhotonFeature["properties"]): string {
  const street = extractStreet(p);
  if (street) return street;
  return extractCity(p) || p.name || "";
}

function formatSecondary(p: PhotonFeature["properties"]): string {
  const street = extractStreet(p);
  const parts: string[] = [];
  if (street) {
    const city = extractCity(p);
    if (city) parts.push(city);
  }
  if (p.postcode) parts.push(p.postcode);
  if (p.country) parts.push(p.country);
  return parts.join(", ");
}

/**
 * Tap to open a bottom-sheet with a search field; suggestions are
 * fetched from Photon (OSM) with a 300ms debounce. Mirrors the web
 * `AddressAutocomplete` API but uses native components only.
 */
export function AddressAutocomplete({
  value,
  onChange,
  placeholder = "12 Rue de la Paix, Paris…",
}: Props) {
  const [open, setOpen] = useState(false);
  const muted = useThemeColor("mutedForeground");
  const foreground = useThemeColor("foreground");

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        className="h-12 flex-row items-center gap-2 rounded-xl border border-border bg-background px-4"
      >
        <MapPin size={16} color={muted} />
        <Text
          className="flex-1 text-base"
          numberOfLines={1}
          style={{ color: value ? foreground : muted }}
        >
          {value?.label || placeholder}
        </Text>
        {value ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
            hitSlop={6}
          >
            <X size={16} color={muted} />
          </Pressable>
        ) : null}
      </Pressable>

      <Sheet open={open} onOpenChange={setOpen}>
        <SearchSheetBody
          onPick={(picked) => {
            onChange(picked);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      </Sheet>
    </>
  );
}

function SearchSheetBody({
  onPick,
  onClose,
}: {
  onPick: (result: AddressResult) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PhotonFeature[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const muted = useThemeColor("mutedForeground");

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ q, limit: "8", lang: "fr" });
      const res = await fetch(
        `https://photon.komoot.io/api/?${params.toString()}`,
      );
      if (!res.ok) throw new Error("Photon error");
      const data = (await res.json()) as { features: PhotonFeature[] };
      const features = (data.features ?? []).filter((f) => {
        const cc = f.properties.countrycode?.toUpperCase();
        return cc && ALLOWED_COUNTRIES.includes(cc);
      });
      setSuggestions(features);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, fetchSuggestions]);

  const handlePick = (feature: PhotonFeature) => {
    const p = feature.properties;
    onPick({
      label: formatLabel(p),
      addressLine: extractStreet(p),
      city: extractCity(p),
      postalCode: p.postcode || "",
      countryCode: (p.countrycode || "FR").toUpperCase(),
    });
  };

  return (
    <View style={{ minHeight: 380 }} className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text variant="h4">Rechercher une adresse</Text>
        <Pressable onPress={onClose} hitSlop={6}>
          <X size={20} color={muted} />
        </Pressable>
      </View>

      <Input
        value={query}
        onChangeText={setQuery}
        placeholder="Adresse, ville, code postal…"
        autoFocus
        autoCorrect={false}
        autoCapitalize="words"
      />

      {loading ? (
        <View className="flex-row items-center justify-center py-8">
          <ActivityIndicator />
        </View>
      ) : suggestions.length === 0 ? (
        <View className="items-center py-8">
          <Text variant="muted">
            {query.length < 3
              ? "Tapez au moins 3 caractères"
              : "Aucun résultat"}
          </Text>
        </View>
      ) : (
        <View className="gap-1">
          {suggestions.map((feature, idx) => {
            const p = feature.properties;
            const primary = formatPrimary(p);
            const secondary = formatSecondary(p);
            return (
              <Pressable
                key={`${p.osm_id ?? idx}-${idx}`}
                onPress={() => handlePick(feature)}
                className="flex-row items-start gap-2 rounded-lg p-2 active:bg-muted"
              >
                <MapPin size={16} color={muted} />
                <View className="min-w-0 flex-1">
                  <Text className="font-medium" numberOfLines={1}>
                    {primary}
                  </Text>
                  {secondary ? (
                    <Text variant="muted" className="text-xs" numberOfLines={1}>
                      {secondary}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

// Re-export for callers that need to type their own state with the
// strictly-allowed country tuple.
export type { ShippingCountry };
