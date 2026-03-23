"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { MapPin, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { COUNTRY_LABELS } from "@/lib/constants";
import type { ShippingCountry } from "@/lib/constants";

interface PhotonFeature {
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
    name?: string;
    type?: string;
  };
}

export interface AddressResult {
  label: string;
  city: string;
  postalCode: string;
  countryCode: string;
}

interface AddressAutocompleteProps {
  value: AddressResult | null;
  onChange: (result: AddressResult | null) => void;
  placeholder?: string;
  id?: string;
}

const ALLOWED_COUNTRIES = Object.keys(COUNTRY_LABELS) as ShippingCountry[];

function formatLabel(props: PhotonFeature["properties"]): string {
  const city = props.city || props.town || props.village || props.name || "";
  const parts: string[] = [];
  if (city) parts.push(city);
  if (props.postcode) parts.push(props.postcode);
  if (props.country) parts.push(props.country);
  return parts.join(", ");
}

function extractCity(props: PhotonFeature["properties"]): string {
  return props.city || props.town || props.village || props.name || "";
}

export function AddressAutocomplete({
  value,
  onChange,
  placeholder = "Rechercher une ville...",
  id,
}: AddressAutocompleteProps) {
  const [query, setQuery] = useState(value?.label || "");
  const [suggestions, setSuggestions] = useState<PhotonFeature[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        q,
        limit: "6",
        lang: "fr",
      });

      const res = await fetch(
        `https://photon.komoot.io/api/?${params.toString()}`,
      );
      if (!res.ok) throw new Error("Photon API error");

      const data = await res.json();
      const features = (data.features as PhotonFeature[]).filter((f) => {
        const cc = f.properties.countrycode?.toUpperCase();
        return cc && ALLOWED_COUNTRIES.includes(cc as ShippingCountry);
      });

      setSuggestions(features);
      setIsOpen(features.length > 0);
      setActiveIndex(-1);
    } catch {
      setSuggestions([]);
      setIsOpen(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);

    if (value) {
      onChange(null);
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 300);
  }

  function handleSelect(feature: PhotonFeature) {
    const props = feature.properties;
    const result: AddressResult = {
      label: formatLabel(props),
      city: extractCity(props),
      postalCode: props.postcode || "",
      countryCode: (props.countrycode || "FR").toUpperCase(),
    };

    setQuery(result.label);
    onChange(result);
    setIsOpen(false);
    setSuggestions([]);
    inputRef.current?.blur();
  }

  function handleClear() {
    setQuery("");
    onChange(null);
    setSuggestions([]);
    setIsOpen(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : 0,
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((prev) =>
          prev > 0 ? prev - 1 : suggestions.length - 1,
        );
        break;
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < suggestions.length) {
          handleSelect(suggestions[activeIndex]);
        }
        break;
      case "Escape":
        setIsOpen(false);
        setActiveIndex(-1);
        break;
    }
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <MapPin className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          ref={inputRef}
          id={id}
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          placeholder={placeholder}
          className="pr-9 pl-9"
          autoComplete="off"
        />
        {isLoading && (
          <Loader2 className="text-muted-foreground absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin" />
        )}
        {!isLoading && query && (
          <button
            type="button"
            onClick={handleClear}
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="bg-popover ring-foreground/10 absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg p-1 shadow-md ring-1"
        >
          {suggestions.map((feature, idx) => {
            const props = feature.properties;
            const city = extractCity(props);
            const secondary = [props.postcode, props.state, props.country]
              .filter(Boolean)
              .join(", ");

            return (
              <li
                key={`${props.osm_id ?? idx}-${idx}`}
                role="option"
                aria-selected={idx === activeIndex}
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-md px-2 py-2 text-sm transition-colors",
                  idx === activeIndex
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50",
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(feature)}
                onMouseEnter={() => setActiveIndex(idx)}
              >
                <MapPin className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium">{city || props.name}</p>
                  {secondary && (
                    <p className="text-muted-foreground truncate text-xs">
                      {secondary}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
