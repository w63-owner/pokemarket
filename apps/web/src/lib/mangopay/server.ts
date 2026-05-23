/**
 * Server-only MangoPay REST API V2.01 client.
 *
 * Pattern: thin functional wrapper around `fetch`. Each MangoPay resource
 * exposes a small group of strongly-typed methods. We deliberately avoid
 * the deprecated `mangopay2-nodejs-sdk` and the inflated promise-chain SDK
 * in favour of a single readable file.
 *
 * Auth model:
 *   - We exchange `MANGOPAY_CLIENT_ID` + `MANGOPAY_API_KEY` for an OAuth
 *     access token via `/api/v2.01/{client_id}/oauth/token`.
 *   - The token lives ~30 minutes. We cache it in module scope and refresh
 *     2 minutes before expiry to avoid the boundary case.
 *   - In serverless (Vercel) the cache lifetime is bounded by the lambda
 *     warm window — refresh is cheap (~50 ms), so this is fine.
 *
 * Idempotency:
 *   - Every mutating call accepts an optional `idempotencyKey` that is sent
 *     via the `Idempotency-Key` header. MangoPay deduplicates within a 24 h
 *     window. We let callers decide the key shape so they can scope it to a
 *     business object id (e.g. `payin-{transactionId}`).
 */

import * as Sentry from "@sentry/nextjs";

import type {
  BankAccount,
  BankAccountIBANCreate,
  Card,
  CardRegistration,
  CardRegistrationCreate,
  CardRegistrationFinalize,
  Dispute,
  KycDocument,
  MangoPayCurrency,
  NaturalUser,
  NaturalUserCreate,
  OnboardingSession,
  OnboardingSessionCreate,
  PayIn,
  PayInCardCreate,
  PayOut,
  PayOutCreate,
  Refund,
  RefundCreate,
  Transfer,
  TransferCreate,
  Wallet,
  WalletCreate,
} from "./types";
import { MangoPayApiError } from "./errors";

const TOKEN_REFRESH_BUFFER_MS = 2 * 60 * 1000;

type CachedToken = {
  accessToken: string;
  expiresAt: number; // ms epoch
};

let _cachedToken: CachedToken | null = null;

function readEnv(): {
  clientId: string;
  apiKey: string;
  baseUrl: string;
} {
  const clientId = process.env.MANGOPAY_CLIENT_ID;
  const apiKey = process.env.MANGOPAY_API_KEY;
  const baseUrl =
    process.env.MANGOPAY_BASE_URL ?? "https://api.sandbox.mangopay.com";

  if (!clientId || !apiKey) {
    throw new Error(
      "MANGOPAY_CLIENT_ID and MANGOPAY_API_KEY must be set to use the MangoPay client.",
    );
  }

  return {
    clientId,
    apiKey,
    baseUrl: baseUrl.replace(/\/$/, ""),
  };
}

async function fetchAccessToken(): Promise<CachedToken> {
  const { clientId, apiKey, baseUrl } = readEnv();
  const credentials = Buffer.from(`${clientId}:${apiKey}`).toString("base64");

  const res = await fetch(`${baseUrl}/api/v2.01/${clientId}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new MangoPayApiError({
      status: res.status,
      message: `MangoPay OAuth token request failed: ${body.slice(0, 200)}`,
    });
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number; // seconds
  };

  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

async function getAccessToken(): Promise<string> {
  if (
    _cachedToken &&
    _cachedToken.expiresAt - Date.now() > TOKEN_REFRESH_BUFFER_MS
  ) {
    return _cachedToken.accessToken;
  }

  _cachedToken = await fetchAccessToken();
  return _cachedToken.accessToken;
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  idempotencyKey?: string;
};

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { clientId, baseUrl } = readEnv();
  const token = await getAccessToken();
  const method = opts.method ?? "GET";

  const url = `${baseUrl}/api/v2.01/${clientId}${path}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (opts.idempotencyKey) {
    headers["Idempotency-Key"] = opts.idempotencyKey;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      // body is not JSON; ignore
    }

    const error = parseApiError(res.status, payload);

    Sentry.addBreadcrumb({
      category: "mangopay",
      level: "error",
      message: `MangoPay ${method} ${path} -> ${res.status}`,
      data: { code: error.code, type: error.type },
    });

    throw error;
  }

  // Some endpoints (DELETE) return 204 with empty body.
  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

function parseApiError(status: number, payload: unknown): MangoPayApiError {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const obj = payload as Record<string, unknown>;
    const message =
      typeof obj.Message === "string"
        ? obj.Message
        : typeof obj.error_description === "string"
          ? obj.error_description
          : `MangoPay API error (HTTP ${status})`;
    const code = typeof obj.Code === "string" ? obj.Code : null;
    const type = typeof obj.Type === "string" ? obj.Type : null;
    const fields =
      obj.errors && typeof obj.errors === "object"
        ? (obj.errors as Record<string, string>)
        : {};

    return new MangoPayApiError({
      status,
      message,
      code,
      type,
      fields,
      raw: payload,
    });
  }

  return new MangoPayApiError({
    status,
    message: `MangoPay API error (HTTP ${status})`,
    raw: payload,
  });
}

// ─── Public client ────────────────────────────────────────────────────────

export const mangopay = {
  /** OAuth helper exposed for diagnostic / smoke tests only. */
  _getAccessToken: getAccessToken,

  users: {
    createNatural(input: NaturalUserCreate): Promise<NaturalUser> {
      return request<NaturalUser>("/users/natural", {
        method: "POST",
        body: input,
      });
    },
    get(userId: string): Promise<NaturalUser> {
      return request<NaturalUser>(`/users/${userId}`);
    },
  },

  wallets: {
    create(input: WalletCreate): Promise<Wallet> {
      return request<Wallet>("/wallets", { method: "POST", body: input });
    },
    get(walletId: string): Promise<Wallet> {
      return request<Wallet>(`/wallets/${walletId}`);
    },
    listForUser(userId: string): Promise<Wallet[]> {
      return request<Wallet[]>(`/users/${userId}/wallets`);
    },
  },

  cardRegistrations: {
    create(input: CardRegistrationCreate): Promise<CardRegistration> {
      return request<CardRegistration>("/cardregistrations", {
        method: "POST",
        body: input,
      });
    },
    finalize(
      registrationId: string,
      input: CardRegistrationFinalize,
    ): Promise<CardRegistration> {
      return request<CardRegistration>(`/cardregistrations/${registrationId}`, {
        method: "PUT",
        body: input,
      });
    },
    get(registrationId: string): Promise<CardRegistration> {
      return request<CardRegistration>(`/cardregistrations/${registrationId}`);
    },
  },

  cards: {
    get(cardId: string): Promise<Card> {
      return request<Card>(`/cards/${cardId}`);
    },
    deactivate(cardId: string): Promise<Card> {
      return request<Card>(`/cards/${cardId}`, {
        method: "PUT",
        body: { Active: false },
      });
    },
  },

  payins: {
    createCardDirect(
      input: PayInCardCreate,
      idempotencyKey?: string,
    ): Promise<PayIn> {
      return request<PayIn>("/payins/card/direct", {
        method: "POST",
        body: input,
        idempotencyKey,
      });
    },
    get(payinId: string): Promise<PayIn> {
      return request<PayIn>(`/payins/${payinId}`);
    },
    refund(
      payinId: string,
      input: RefundCreate,
      idempotencyKey?: string,
    ): Promise<Refund> {
      return request<Refund>(`/payins/${payinId}/refunds`, {
        method: "POST",
        body: input,
        idempotencyKey,
      });
    },
  },

  transfers: {
    create(input: TransferCreate, idempotencyKey?: string): Promise<Transfer> {
      return request<Transfer>("/transfers", {
        method: "POST",
        body: input,
        idempotencyKey,
      });
    },
    get(transferId: string): Promise<Transfer> {
      return request<Transfer>(`/transfers/${transferId}`);
    },
    refund(
      transferId: string,
      input: { AuthorId: string; Tag?: string },
      idempotencyKey?: string,
    ): Promise<Refund> {
      return request<Refund>(`/transfers/${transferId}/refunds`, {
        method: "POST",
        body: input,
        idempotencyKey,
      });
    },
  },

  bankAccounts: {
    createIBAN(
      userId: string,
      input: BankAccountIBANCreate,
    ): Promise<BankAccount> {
      return request<BankAccount>(`/users/${userId}/bankaccounts/iban`, {
        method: "POST",
        body: input,
      });
    },
    list(userId: string): Promise<BankAccount[]> {
      return request<BankAccount[]>(`/users/${userId}/bankaccounts`);
    },
    deactivate(userId: string, bankAccountId: string): Promise<BankAccount> {
      return request<BankAccount>(
        `/users/${userId}/bankaccounts/${bankAccountId}`,
        {
          method: "PUT",
          body: { Active: false },
        },
      );
    },
  },

  payouts: {
    create(input: PayOutCreate, idempotencyKey?: string): Promise<PayOut> {
      return request<PayOut>("/payouts/bankwire", {
        method: "POST",
        body: input,
        idempotencyKey,
      });
    },
    get(payoutId: string): Promise<PayOut> {
      return request<PayOut>(`/payouts/${payoutId}`);
    },
  },

  kycDocuments: {
    listForUser(userId: string): Promise<KycDocument[]> {
      return request<KycDocument[]>(`/users/${userId}/kyc/documents`);
    },
    get(documentId: string): Promise<KycDocument> {
      return request<KycDocument>(`/kyc/documents/${documentId}`);
    },
  },

  onboarding: {
    /**
     * Creates a hosted KYC onboarding session — returns a URL that the user
     * opens to complete identity verification in MangoPay's hosted UI.
     *
     * The product name in MangoPay's docs is "User Onboarding". Available
     * since 2023, replaces the old PSP iframe flow.
     */
    create(input: OnboardingSessionCreate): Promise<OnboardingSession> {
      return request<OnboardingSession>("/users/onboarding", {
        method: "POST",
        body: input,
      });
    },
  },

  disputes: {
    get(disputeId: string): Promise<Dispute> {
      return request<Dispute>(`/disputes/${disputeId}`);
    },
    contest(
      disputeId: string,
      contestedFunds: { Amount: number; Currency: MangoPayCurrency },
    ): Promise<Dispute> {
      return request<Dispute>(`/disputes/${disputeId}/submit`, {
        method: "PUT",
        body: { ContestedFunds: contestedFunds },
      });
    },
    listDocuments(
      disputeId: string,
    ): Promise<Array<{ Id: string; Type: string; Status: string }>> {
      return request<Array<{ Id: string; Type: string; Status: string }>>(
        `/disputes/${disputeId}/documents`,
      );
    },
    createDocument(
      disputeId: string,
      type: string,
    ): Promise<{ Id: string; Type: string; Status: string }> {
      return request<{ Id: string; Type: string; Status: string }>(
        `/disputes/${disputeId}/documents`,
        {
          method: "POST",
          body: { Type: type },
        },
      );
    },
    submitDocument(
      disputeId: string,
      documentId: string,
    ): Promise<{ Id: string; Type: string; Status: string }> {
      return request<{ Id: string; Type: string; Status: string }>(
        `/disputes/${disputeId}/documents/${documentId}/submit`,
        {
          method: "PUT",
        },
      );
    },
  },
} as const;

export type MangoPayClient = typeof mangopay;
