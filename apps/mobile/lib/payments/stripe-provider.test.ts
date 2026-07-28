import { Platform } from "react-native";
import {
  initPaymentSheet,
  presentPaymentSheet,
  PaymentSheetError,
} from "@stripe/stripe-react-native";
import type { MobileCheckoutResponse } from "@pokemarket/shared";

import { stripeProvider } from "./stripe-provider";

jest.mock("@stripe/stripe-react-native", () => ({
  initPaymentSheet: jest.fn(),
  presentPaymentSheet: jest.fn(),
  PaymentSheetError: { Canceled: "Canceled" },
}));

const mockInitPaymentSheet = jest.mocked(initPaymentSheet);
const mockPresentPaymentSheet = jest.mocked(presentPaymentSheet);

const intent: MobileCheckoutResponse = {
  provider: "stripe",
  mode: "payment_intent",
  client_secret: "pi_test_secret",
  payment_intent_id: "pi_test",
  ephemeral_key: "ek_test",
  customer_id: "cus_test",
  transaction_id: "transaction-1",
};

describe("Stripe mobile PaymentSheet", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_placeholder";
    Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" });
    mockInitPaymentSheet.mockResolvedValue({});
    mockPresentPaymentSheet.mockResolvedValue({});
  });

  it("configures Apple Pay, 3DS return, and webhook-owned settlement on iOS", async () => {
    const result = await stripeProvider.present({
      merchantDisplayName: "PokeMarket",
      intent,
    });

    expect(mockInitPaymentSheet).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentIntentClientSecret: "pi_test_secret",
        returnURL: "pokemarket://stripe-redirect",
        allowsDelayedPaymentMethods: false,
        applePay: { merchantCountryCode: "FR" },
      }),
    );
    expect(result).toEqual({
      status: "succeeded",
      transactionId: "transaction-1",
    });
  });

  it("enables Google Pay test mode for sandbox builds", async () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "android",
    });

    await stripeProvider.present({
      merchantDisplayName: "PokeMarket",
      intent,
    });

    expect(mockInitPaymentSheet).toHaveBeenCalledWith(
      expect.objectContaining({
        googlePay: {
          merchantCountryCode: "FR",
          currencyCode: "EUR",
          testEnv: true,
        },
      }),
    );
  });

  it("returns cancellation without treating it as a payment failure", async () => {
    mockPresentPaymentSheet.mockResolvedValue({
      error: {
        code: PaymentSheetError.Canceled,
        message: "Canceled",
        localizedMessage: "Canceled",
      },
    });

    await expect(
      stripeProvider.present({ merchantDisplayName: "PokeMarket", intent }),
    ).resolves.toEqual({
      status: "cancelled",
      transactionId: "transaction-1",
    });
  });

  it("does not present PaymentSheet when initialization fails", async () => {
    mockInitPaymentSheet.mockResolvedValue({
      error: {
        code: PaymentSheetError.Failed,
        message: "Invalid ephemeral key",
        localizedMessage: "Invalid ephemeral key",
      },
    });

    await expect(
      stripeProvider.present({ merchantDisplayName: "PokeMarket", intent }),
    ).resolves.toEqual({
      status: "failed",
      transactionId: "transaction-1",
      error: "Invalid ephemeral key",
    });
    expect(mockPresentPaymentSheet).not.toHaveBeenCalled();
  });
});
