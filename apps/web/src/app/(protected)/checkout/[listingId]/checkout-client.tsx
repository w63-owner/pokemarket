"use client";

import { useState } from "react";
import { m } from "framer-motion";
import { CreditCard, ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { OrderSummary } from "@/components/checkout/order-summary";
import { CountdownTimer } from "@/components/checkout/countdown-timer";
import { MobileHeader } from "@/components/layout/mobile-header";
import { AddressAutocomplete } from "@/components/checkout/address-autocomplete";
import { formatPrice } from "@/lib/utils";
import { calcTotalBuyer } from "@/lib/pricing";
import { SHIPPING_COUNTRIES, COUNTRY_LABELS } from "@/lib/constants";
import type { ShippingCountry } from "@/lib/constants";
import type { CheckoutResponse } from "@/types/api";

export interface DefaultShipping {
  addressLine: string;
  city: string;
  postcode: string;
  country: string;
}

interface CheckoutClientProps {
  listing: {
    id: string;
    title: string;
    cover_image_url: string | null;
    display_price: number;
    condition: string | null;
    is_graded: boolean;
    grading_company: string | null;
    grade_note: number | null;
    card_series: string | null;
    delivery_weight_class: string;
  };
  effectivePrice: number;
  shippingCost: number;
  /**
   * Address copied from the buyer's most recent transaction so returning
   * customers don't have to retype the same shipping info on every checkout.
   * `null` if this is the buyer's first purchase.
   */
  defaultShipping: DefaultShipping | null;
}

function isSupportedCountry(value: string): value is ShippingCountry {
  return (SHIPPING_COUNTRIES as readonly string[]).includes(value);
}

export function CheckoutClient({
  listing,
  effectivePrice,
  shippingCost,
  defaultShipping,
}: CheckoutClientProps) {
  const [country, setCountry] = useState<ShippingCountry>(() =>
    defaultShipping && isSupportedCountry(defaultShipping.country)
      ? defaultShipping.country
      : "FR",
  );
  const [addressLine, setAddressLine] = useState(
    defaultShipping?.addressLine ?? "",
  );
  const [city, setCity] = useState(defaultShipping?.city ?? "");
  const [postcode, setPostcode] = useState(defaultShipping?.postcode ?? "");
  const [isLoading, setIsLoading] = useState(false);
  const [isExpired, setIsExpired] = useState(false);

  const [expiresAt] = useState(() => new Date(Date.now() + 30 * 60 * 1000));

  const total = calcTotalBuyer(effectivePrice, shippingCost);

  const isFormValid =
    addressLine.trim().length > 0 &&
    city.trim().length > 0 &&
    postcode.trim().length > 0;

  async function handleCheckout() {
    if (!isFormValid || isLoading || isExpired) return;

    setIsLoading(true);

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listing_id: listing.id,
          shipping_country: country,
          shipping_address_line: addressLine.trim(),
          shipping_address_city: city.trim(),
          shipping_address_postcode: postcode.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Une erreur est survenue");
        setIsLoading(false);
        return;
      }

      const checkout = data as CheckoutResponse;
      window.location.href = checkout.url;
    } catch {
      toast.error("Erreur réseau. Veuillez réessayer.");
      setIsLoading(false);
    }
  }

  return (
    <>
      <MobileHeader title="Paiement" fallbackUrl={`/listing/${listing.id}`} />
      <div className="mx-auto max-w-lg px-4 pt-4 pb-32">
        <m.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-6"
        >
          <p className="text-muted-foreground text-sm">
            Finalisez votre achat en toute sécurité
          </p>

          <CountdownTimer
            expiresAt={expiresAt}
            onExpired={() => setIsExpired(true)}
          />

          <OrderSummary
            listing={listing}
            effectivePrice={effectivePrice}
            shippingCost={shippingCost}
          />

          <div className="bg-card border-border space-y-4 rounded-2xl border p-4 shadow-sm">
            <h2 className="font-heading text-base font-semibold">
              Adresse de livraison
            </h2>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="country">Pays</Label>
                <Select
                  value={country}
                  onValueChange={(v) => setCountry(v as ShippingCountry)}
                >
                  <SelectTrigger id="country">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SHIPPING_COUNTRIES.map((code) => (
                      <SelectItem key={code} value={code}>
                        {COUNTRY_LABELS[code]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {country === "FR" ? (
                <AddressAutocomplete
                  addressLine={addressLine}
                  onAddressLineChange={setAddressLine}
                  onSelect={({ addressLine: addr, postcode: pc, city: c }) => {
                    setAddressLine(addr);
                    setPostcode(pc);
                    setCity(c);
                  }}
                />
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="address">Adresse</Label>
                  <Input
                    id="address"
                    value={addressLine}
                    onChange={(e) => setAddressLine(e.target.value)}
                    placeholder="12 rue de la Pokéball"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="postcode">Code postal</Label>
                  <Input
                    id="postcode"
                    value={postcode}
                    onChange={(e) => setPostcode(e.target.value)}
                    placeholder="75001"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="city">Ville</Label>
                  <Input
                    id="city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Paris"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-primary/5 border-primary/20 flex items-start gap-3 rounded-xl border p-3">
            <ShieldCheck className="text-primary mt-0.5 size-5 shrink-0" />
            <p className="text-muted-foreground text-xs leading-relaxed">
              Votre paiement est sécurisé par Stripe. Les fonds sont conservés
              sous séquestre jusqu&apos;à confirmation de réception de la carte.
            </p>
          </div>
        </m.div>

        <m.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{
            type: "spring",
            stiffness: 400,
            damping: 30,
            delay: 0.15,
          }}
          className="border-border bg-background/95 fixed right-0 bottom-0 left-0 z-40 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:sticky sm:bottom-0"
        >
          <Button
            size="lg"
            className="w-full text-base"
            disabled={!isFormValid || isLoading || isExpired}
            onClick={handleCheckout}
          >
            {isLoading ? (
              <>
                <Loader2 className="size-5 animate-spin" />
                Redirection vers Stripe…
              </>
            ) : (
              <>
                <CreditCard className="size-5" />
                Payer {formatPrice(total)}
              </>
            )}
          </Button>
        </m.div>
      </div>
    </>
  );
}
