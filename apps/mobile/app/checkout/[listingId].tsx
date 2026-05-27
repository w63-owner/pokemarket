import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import {
  KeyboardAvoidingView,
  useKeyboardState,
} from "react-native-keyboard-controller";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { ChevronLeft, CreditCard, ShieldCheck } from "lucide-react-native";
import {
  calcTotalBuyer,
  formatPrice,
  LIMITS,
  SHIPPING_COUNTRIES,
  type ShippingCountry,
} from "@pokemarket/shared";

import { useAuth } from "@/hooks/use-auth";
import { useListing } from "@/hooks/use-listings";
import { fetchShippingCost } from "@/lib/api/shipping";
import { fetchMyProfile } from "@/lib/api/profile";
import { usePayment } from "@/lib/payments";
import { transactionRoutes } from "@/lib/routes/orders";
import { useThemeColors } from "@/lib/theme-colors";
import { Button, Skeleton, Text, toast } from "@/components/ui";
import { OrderSummary } from "@/components/checkout/order-summary";
import { CountdownTimer } from "@/components/checkout/countdown-timer";
import { AddressForm } from "@/components/checkout/address-form";

function isSupportedCountry(value: string | null): value is ShippingCountry {
  return (
    value !== null && (SHIPPING_COUNTRIES as readonly string[]).includes(value)
  );
}

export default function CheckoutScreen() {
  const { listingId } = useLocalSearchParams<{ listingId: string }>();
  const { user, loading: authLoading } = useAuth();
  const { data: listing, isLoading: listingLoading } = useListing(listingId);

  // Pre-fill from the buyer's profile address (canonical source). Falls back
  // to empty fields on first checkout — same behaviour as web.
  const { data: profile } = useQuery({
    queryKey: ["profile", "me"],
    queryFn: fetchMyProfile,
    enabled: !!user,
  });

  const [country, setCountry] = useState<ShippingCountry>("FR");
  const [addressLine, setAddressLine] = useState("");
  const [city, setCity] = useState("");
  const [postcode, setPostcode] = useState("");
  const [hasHydrated, setHasHydrated] = useState(false);
  const [isExpired, setIsExpired] = useState(false);

  // Collapse the bottom safe-area when the keyboard is open: with edge-to-edge
  // enabled the home indicator / nav bar is occluded by the keyboard, so
  // reserving `insets.bottom` here would leave a visible empty strip
  // between the Pay button and the keyboard top.
  const insets = useSafeAreaInsets();
  const { isVisible: isKeyboardVisible } = useKeyboardState();
  const payBarBottomPadding = isKeyboardVisible ? 0 : insets.bottom;

  // Hydrate the form once when the profile arrives. Guarded so the user's
  // edits aren't overwritten by a late-arriving profile fetch.
  useEffect(() => {
    if (!profile || hasHydrated) return;
    if (isSupportedCountry(profile.country_code)) {
      setCountry(profile.country_code);
    }
    if (profile.address_line) setAddressLine(profile.address_line);
    if (profile.city) setCity(profile.city);
    if (profile.postal_code) setPostcode(profile.postal_code);
    setHasHydrated(true);
  }, [profile, hasHydrated]);

  // Re-fetch the shipping cost whenever the destination country changes.
  // The API will recompute server-side at confirmation, but we want the
  // OrderSummary the buyer sees to match what they'll actually pay.
  const { data: shippingCost = 0 } = useQuery({
    queryKey: ["shipping", country, listing?.delivery_weight_class ?? null],
    queryFn: () =>
      fetchShippingCost(country, listing?.delivery_weight_class ?? "standard"),
    enabled: !!listing,
  });

  // The countdown is informational before the buyer taps "Pay" (the
  // server-side reservation lock only exists after `/api/checkout`
  // creates a PENDING_PAYMENT transaction). We mirror the exact lock
  // duration the server will impose via `LIMITS.CHECKOUT_LOCK_MINUTES`
  // (used by `apps/web/src/app/api/checkout/route.ts` to compute
  // `transactions.expiration_date`) so the buyer never sees a longer
  // window on screen than they actually get. Parity with the web
  // checkout-client which does the same.
  const expiresAt = useMemo(
    () => new Date(Date.now() + LIMITS.CHECKOUT_LOCK_MINUTES * 60 * 1000),
    [],
  );

  const { startPayment, isProcessing } = usePayment();
  const colors = useThemeColors();

  const isFormValid =
    addressLine.trim().length > 0 &&
    city.trim().length > 0 &&
    postcode.trim().length > 0;

  if (authLoading || listingLoading || !listing) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View className="gap-3 p-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    router.replace("/(auth)/login" as never);
    return null;
  }

  if (user.id === listing.seller_id) {
    router.replace(`/listing/${listing.id}` as never);
    return null;
  }

  const isReservedForMe =
    (listing.status === "RESERVED" || listing.status === "LOCKED") &&
    listing.reserved_for === user.id;
  const isActive = listing.status === "ACTIVE";

  if (!isActive && !isReservedForMe) {
    router.replace(`/listing/${listing.id}` as never);
    return null;
  }

  const effectivePrice =
    (isReservedForMe
      ? (listing.reserved_price ?? listing.display_price)
      : listing.display_price) ?? 0;

  const total = calcTotalBuyer(effectivePrice, shippingCost);

  async function handlePay() {
    if (!isFormValid || isProcessing || isExpired) return;
    if (!listing) return;

    const result = await startPayment({
      listing_id: listing.id,
      shipping_country: country,
      shipping_address_line: addressLine.trim(),
      shipping_address_city: city.trim(),
      shipping_address_postcode: postcode.trim(),
    });

    if (result.status === "succeeded") {
      router.replace(
        transactionRoutes.buyerSuccess(result.transactionId) as never,
      );
      return;
    }
    if (result.status === "cancelled") {
      // The user cancelled inside PaymentSheet — keep them on the checkout
      // screen so they can retry without losing their address. The backend
      // already created a PENDING_PAYMENT transaction; the cron job will
      // expire it after CHECKOUT_LOCK_MINUTES.
      return;
    }
    toast.error("Paiement impossible", result.error);
  }

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: false }} />

      <SafeAreaView edges={["top"]} className="border-b border-border bg-card">
        <View className="flex-row items-center gap-3 px-4 py-3">
          <Pressable
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace(`/listing/${listing.id}` as never);
            }}
            hitSlop={8}
            className="h-9 w-9 items-center justify-center rounded-full"
          >
            <ChevronLeft size={22} color={colors.foreground} />
          </Pressable>
          <Text className="text-lg font-semibold">Paiement</Text>
        </View>
      </SafeAreaView>

      {/* `KeyboardAvoidingView` from `react-native-keyboard-controller`
          handles both iOS and Android edge-to-edge correctly — the legacy
          RN component is a no-op on Android when `behavior` isn't set.
          No `keyboardVerticalOffset`: the lib computes the KAV's window
          position itself, so any non-zero offset becomes a visible gap
          between the keyboard top and the bottom of the content. */}
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 20 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text variant="muted">Finalisez votre achat en toute sécurité</Text>

          <CountdownTimer
            expiresAt={expiresAt}
            onExpired={() => setIsExpired(true)}
          />

          <OrderSummary
            listing={{
              title: listing.title,
              cover_image_url: listing.cover_image_url,
              display_price: listing.display_price ?? 0,
              condition: listing.condition,
              is_graded: listing.is_graded ?? false,
              grading_company: listing.grading_company,
              grade_note: listing.grade_note,
              card_series: listing.card_series,
            }}
            effectivePrice={effectivePrice}
            shippingCost={shippingCost}
          />

          <View className="gap-3 rounded-2xl border border-border bg-card p-4">
            <Text className="text-base font-semibold">
              Adresse de livraison
            </Text>
            <AddressForm
              country={country}
              addressLine={addressLine}
              city={city}
              postcode={postcode}
              onCountryChange={setCountry}
              onAddressLineChange={setAddressLine}
              onCityChange={setCity}
              onPostcodeChange={setPostcode}
            />
          </View>

          <View className="flex-row items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
            <ShieldCheck size={20} color={colors.primary} />
            <Text className="flex-1 text-xs leading-5 text-muted-foreground">
              Votre paiement est sécurisé. Les fonds sont conservés sous
              séquestre jusqu&apos;à confirmation de réception de la carte.
            </Text>
          </View>
        </ScrollView>

        <View
          className="border-t border-border bg-card px-4 pt-3"
          style={{ paddingBottom: payBarBottomPadding + 12 }}
        >
          <Button
            size="lg"
            onPress={handlePay}
            disabled={!isFormValid || isExpired}
            loading={isProcessing}
            leftIcon={<CreditCard size={20} color={colors.primaryForeground} />}
          >
            {`Payer ${formatPrice(total)}`}
          </Button>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
