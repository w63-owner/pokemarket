import { Platform } from "react-native";
import {
  initPaymentSheet,
  presentPaymentSheet,
  PaymentSheetError,
} from "@stripe/stripe-react-native";
import type {
  PaymentProviderClient,
  PaymentResult,
  PresentPaymentParams,
} from "./types";

/**
 * Stripe PaymentSheet provider — handles cards, Apple Pay (iOS) and
 * Google Pay (Android) natively. Required by App Store guideline 3.1.5
 * for iOS marketplaces that accept cards.
 *
 * The buyer never leaves the app: PaymentSheet renders a native bottom
 * sheet, the SDK confirms the PaymentIntent client-side, and the actual
 * "transaction PAID" transition happens server-side via the
 * `payment_intent.succeeded` webhook.
 */
export const stripeProvider: PaymentProviderClient = {
  async present(params: PresentPaymentParams): Promise<PaymentResult> {
    if (params.intent.provider !== "stripe") {
      throw new Error(
        `stripeProvider received non-stripe intent: ${params.intent.provider}`,
      );
    }

    const intent = params.intent;

    // Apple Pay needs a country & merchant identifier (already declared in
    // app.json `ios.merchantIdentifier`). Google Pay needs the country
    // and (in test mode) `testEnv: true`. We treat anything that isn't
    // Stripe live mode as test, since the publishable key prefix tells
    // us which environment we're in (`pk_live_` vs `pk_test_`).
    const isLiveMode = (
      process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""
    ).startsWith("pk_live_");

    const initResult = await initPaymentSheet({
      merchantDisplayName: params.merchantDisplayName,
      paymentIntentClientSecret: intent.client_secret,
      customerId: intent.customer_id,
      customerEphemeralKeySecret: intent.ephemeral_key,
      // Keep PaymentSheet aligned with our brand red so it doesn't look
      // grafted onto the rest of the app.
      appearance: {
        colors: { primary: "#E63946" },
        shapes: { borderRadius: 12 },
      },
      // The deep-link return URL Stripe needs to bounce back to the app
      // after 3DS (Stripe opens the challenge in an in-app browser tab).
      // Configured in app.json `scheme`.
      returnURL: "pokemarket://stripe-redirect",
      allowsDelayedPaymentMethods: false,
      ...(Platform.OS === "ios"
        ? {
            applePay: {
              merchantCountryCode: "FR",
            },
          }
        : {
            googlePay: {
              merchantCountryCode: "FR",
              currencyCode: "EUR",
              testEnv: !isLiveMode,
            },
          }),
    });

    if (initResult.error) {
      return {
        status: "failed",
        transactionId: intent.transaction_id,
        error: initResult.error.message,
      };
    }

    const presentResult = await presentPaymentSheet();

    if (presentResult.error) {
      const isCancellation =
        presentResult.error.code === PaymentSheetError.Canceled;
      return isCancellation
        ? { status: "cancelled", transactionId: intent.transaction_id }
        : {
            status: "failed",
            transactionId: intent.transaction_id,
            error: presentResult.error.message,
          };
    }

    return { status: "succeeded", transactionId: intent.transaction_id };
  },
};
