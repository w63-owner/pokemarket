"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface AddressSuggestion {
  label: string;
  name: string;
  postcode: string;
  city: string;
}

interface AddressAutocompleteProps {
  addressLine: string;
  onSelect: (address: {
    addressLine: string;
    postcode: string;
    city: string;
  }) => void;
  onAddressLineChange: (value: string) => void;
  disabled?: boolean;
}

const API_URL = "https://api-adresse.data.gouv.fr/search";

export function AddressAutocomplete({
  addressLine,
  onSelect,
  onAddressLineChange,
  disabled,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const suppressFetchRef = useRef(false);

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 3) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    setIsFetching(true);
    try {
      const params = new URLSearchParams({
        q: query,
        limit: "5",
        type: "housenumber",
        autocomplete: "1",
      });

      const res = await fetch(`${API_URL}?${params}`);
      if (!res.ok) return;

      const data = await res.json();
      const results: AddressSuggestion[] = (data.features ?? []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (f: any) => ({
          label: f.properties.label,
          name: f.properties.name,
          postcode: f.properties.postcode,
          city: f.properties.city,
        }),
      );

      setSuggestions(results);
      setIsOpen(results.length > 0);
      setActiveIndex(-1);
    } catch {
      setSuggestions([]);
      setIsOpen(false);
    } finally {
      setIsFetching(false);
    }
  }, []);

  function handleInputChange(value: string) {
    onAddressLineChange(value);

    if (suppressFetchRef.current) {
      suppressFetchRef.current = false;
      return;
    }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 300);
  }

  function handleSelect(suggestion: AddressSuggestion) {
    suppressFetchRef.current = true;
    onSelect({
      addressLine: suggestion.name,
      postcode: suggestion.postcode,
      city: suggestion.city,
    });
    setSuggestions([]);
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen || suggestions.length === 0) return;

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
        if (activeIndex >= 0) {
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
    return () => clearTimeout(debounceRef.current);
  }, []);

  return (
    <div ref={containerRef} className="relative space-y-1.5">
      <Label htmlFor="address">Adresse</Label>
      <div className="relative">
        <Input
          ref={inputRef}
          id="address"
          value={addressLine}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          placeholder="12 rue de la Pokéball"
          disabled={disabled}
          autoComplete="off"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls="address-suggestions"
          aria-activedescendant={
            activeIndex >= 0 ? `address-option-${activeIndex}` : undefined
          }
        />
        {isFetching && (
          <Loader2 className="text-muted-foreground absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin" />
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <ul
          id="address-suggestions"
          role="listbox"
          className="bg-popover border-border absolute top-full right-0 left-0 z-50 mt-1 overflow-hidden rounded-lg border shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.label}
              id={`address-option-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm transition-colors",
                i === activeIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50",
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(s);
              }}
            >
              <MapPin className="text-muted-foreground size-4 shrink-0" />
              <span className="truncate">{s.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
