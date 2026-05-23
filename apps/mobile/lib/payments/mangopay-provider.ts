import * as WebBrowser from "expo-web-browser";
import type {
  PaymentProviderClient,
  PaymentResult,
  PresentPaymentParams,
} from "./types";

/**
 * MangoPay does not ship an official React Native SDK. The card-direct
 * payin flow is initiated server-side; the only piece the mobile app
 * needs to handle is the 3DS challenge — which MangoPay returns as a
 * `secure_mode_url`. We open it in the in-app browser tab via
 * `expo-web-browser` so the user authenticates inside the app, then
 * resolves once the page redirects back to the deep link we configured.
 *
 * The redirect target (`pokemarket://wallet/return` is reused — it's the
 * same return scheme as MangoPay onboarding) is the contract the backend
 * uses when calling `/payins/card/direct` with `SecureModeReturnURL`.
 *
 * Status finalization happens on the backend via MangoPay webhooks
 * (PAYIN_NORMAL_SUCCEEDED). The mobile client does NOT inspect the
 * redirect URL — it just trusts that the transaction will be PAID by the
 * time the success screen polls for it.
 */
export const mangopayProvider: PaymentProviderClient = {
  async present(params: PresentPaymentParams): Promise<PaymentResult> {
    if (params.intent.provider !== "mangopay") {
      throw new Error(
        `mangopayProvider received non-mangopay intent: ${params.intent.provider}`,
      );
    }

    const { secure_mode_url, transaction_id } = params.intent;

    // No 3DS challenge required (low-risk card / SCA exemption granted).
    // The PayIn is already submitted server-side, so the mobile flow can
    // optimistically transition to the success screen.
    if (!secure_mode_url) {
      return { status: "succeeded", transactionId: transaction_id };
    }

    const result = await WebBrowser.openAuthSessionAsync(
      secure_mode_url,
      "pokemarket://wallet/return",
      {
        showInRecents: false,
      },
    );

    if (result.type === "success") {
      return { status: "succeeded", transactionId: transaction_id };
    }

    if (result.type === "cancel" || result.type === "dismiss") {
      return { status: "cancelled", transactionId: transaction_id };
    }

    return {
      status: "failed",
      transactionId: transaction_id,
      error: "Le challenge 3DS s'est terminé de manière inattendue.",
    };
  },
};
