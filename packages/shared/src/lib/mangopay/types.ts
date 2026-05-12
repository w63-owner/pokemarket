/**
 * MangoPay V2.01 REST API types.
 *
 * We intentionally use the REST API directly (rather than the deprecated
 * `mangopay2-nodejs-sdk`) for:
 *  - Type safety (we control every contract surface)
 *  - Smaller bundle (no SDK transitive deps)
 *  - Future-proofing (MangoPay V3 migration will be easier)
 *  - Better observability (we wrap every call ourselves)
 *
 * Only the fields PokeMarket actually needs are typed here. Add more as they
 * become required — never widen with `Record<string, unknown>` to keep
 * compile-time enforcement.
 */

export type MangoPayCurrency = "EUR";

export type Money = {
  Currency: MangoPayCurrency;
  Amount: number; // cents
};

// ─── Users ────────────────────────────────────────────────────────────────

export type NaturalUserCreate = {
  FirstName: string;
  LastName: string;
  Email: string;
  Birthday: number; // unix seconds
  Nationality: string; // ISO 3166-1 alpha-2
  CountryOfResidence: string; // ISO 3166-1 alpha-2
  Tag?: string; // optional, we put the supabase user id here
};

export type NaturalUser = NaturalUserCreate & {
  Id: string;
  PersonType: "NATURAL";
  KYCLevel: "LIGHT" | "REGULAR";
  CreationDate: number;
};

// ─── Wallets ──────────────────────────────────────────────────────────────

export type WalletCreate = {
  Owners: string[]; // user ids
  Description: string;
  Currency: MangoPayCurrency;
  Tag?: string;
};

export type Wallet = WalletCreate & {
  Id: string;
  Balance: Money;
  CreationDate: number;
};

// ─── Card Registration ────────────────────────────────────────────────────

export type CardType = "CB_VISA_MASTERCARD";

export type CardRegistrationCreate = {
  UserId: string;
  Currency: MangoPayCurrency;
  CardType: CardType;
  Tag?: string;
};

export type CardRegistration = {
  Id: string;
  UserId: string;
  Currency: MangoPayCurrency;
  CardType: CardType;
  CardId: string | null;
  Status:
    | "CREATED"
    | "VALIDATED"
    | "ERROR"; // VALIDATED once tokenisation is finished
  AccessKey: string;
  PreregistrationData: string;
  CardRegistrationURL: string;
  RegistrationData?: string;
  ResultCode?: string;
  ResultMessage?: string;
  CreationDate: number;
};

export type CardRegistrationFinalize = {
  RegistrationData: string;
};

export type Card = {
  Id: string;
  UserId: string;
  Active: boolean;
  Validity: "UNKNOWN" | "VALID" | "INVALID";
  Currency: MangoPayCurrency;
  Alias: string; // e.g. "497010XXXXXX0464"
  CardProvider: string;
  CardType: CardType;
  Country: string;
  ExpirationDate: string; // MMYY
  CreationDate: number;
};

// ─── PayIns (incoming payments) ───────────────────────────────────────────

export type SecureMode = "DEFAULT" | "FORCE";

export type BrowserInfo = {
  AcceptHeader: string;
  JavaEnabled: boolean;
  Language: string;
  ColorDepth: number;
  ScreenHeight: number;
  ScreenWidth: number;
  TimeZoneOffset: string;
  UserAgent: string;
  JavascriptEnabled: boolean;
};

export type PayInCardCreate = {
  AuthorId: string;
  CreditedWalletId: string;
  DebitedFunds: Money;
  Fees: Money;
  CardId: string;
  SecureMode: SecureMode;
  SecureModeReturnURL: string;
  Browser: BrowserInfo;
  IpAddress: string;
  StatementDescriptor?: string;
  Tag?: string;
};

export type PayIn = {
  Id: string;
  Status: "CREATED" | "SUCCEEDED" | "FAILED";
  ResultCode: string | null;
  ResultMessage: string | null;
  AuthorId: string;
  CreditedUserId: string | null;
  CreditedWalletId: string;
  DebitedFunds: Money;
  CreditedFunds: Money;
  Fees: Money;
  Type: "PAYIN";
  PaymentType: "CARD";
  ExecutionType: "DIRECT" | "WEB";
  CardId?: string;
  SecureMode?: SecureMode;
  SecureModeReturnURL?: string;
  SecureModeRedirectURL?: string;
  CreationDate: number;
  ExecutionDate?: number;
  Tag?: string;
};

// ─── Transfers (escrow release) ───────────────────────────────────────────

export type TransferCreate = {
  AuthorId: string;
  DebitedWalletId: string;
  CreditedWalletId: string;
  CreditedUserId?: string;
  DebitedFunds: Money;
  Fees: Money;
  Tag?: string;
};

export type Transfer = {
  Id: string;
  Status: "CREATED" | "SUCCEEDED" | "FAILED";
  ResultCode: string | null;
  ResultMessage: string | null;
  AuthorId: string;
  CreditedUserId: string;
  CreditedWalletId: string;
  DebitedWalletId: string;
  DebitedFunds: Money;
  CreditedFunds: Money;
  Fees: Money;
  Type: "TRANSFER";
  CreationDate: number;
  ExecutionDate?: number;
  Tag?: string;
};

// ─── Refunds ──────────────────────────────────────────────────────────────

export type RefundCreate = {
  AuthorId: string;
  DebitedFunds?: Money;
  Fees?: Money;
  Reason?: {
    RefundReasonType:
      | "INITIALIZED_BY_CLIENT"
      | "BANKACCOUNT_INCORRECT"
      | "OTHER";
    RefundReasonMessage?: string;
  };
  Tag?: string;
};

export type Refund = {
  Id: string;
  Status: "CREATED" | "SUCCEEDED" | "FAILED";
  ResultCode: string | null;
  ResultMessage: string | null;
  AuthorId: string;
  InitialTransactionId: string;
  InitialTransactionType: "PAYIN" | "TRANSFER" | "PAYOUT";
  DebitedFunds: Money;
  CreditedFunds: Money;
  Fees: Money;
  Type: "PAYOUT" | "TRANSFER" | "PAYIN";
  Nature: "REFUND";
  CreationDate: number;
  ExecutionDate?: number;
  Tag?: string;
};

// ─── Bank accounts ────────────────────────────────────────────────────────

export type BankAccountAddress = {
  AddressLine1: string;
  AddressLine2?: string;
  City: string;
  Region?: string;
  PostalCode: string;
  Country: string; // ISO 3166-1 alpha-2
};

export type BankAccountIBANCreate = {
  Type: "IBAN";
  OwnerName: string;
  OwnerAddress: BankAccountAddress;
  IBAN: string;
  BIC?: string;
  Tag?: string;
};

export type BankAccount = BankAccountIBANCreate & {
  Id: string;
  UserId: string;
  Active: boolean;
  CreationDate: number;
};

// ─── Payouts ──────────────────────────────────────────────────────────────

export type PayOutCreate = {
  AuthorId: string;
  DebitedWalletId: string;
  DebitedFunds: Money;
  Fees: Money;
  BankAccountId: string;
  BankWireRef?: string;
  Tag?: string;
};

export type PayOut = {
  Id: string;
  Status: "CREATED" | "SUCCEEDED" | "FAILED";
  ResultCode: string | null;
  ResultMessage: string | null;
  AuthorId: string;
  DebitedWalletId: string;
  DebitedFunds: Money;
  CreditedFunds: Money;
  Fees: Money;
  BankAccountId: string;
  Type: "PAYOUT";
  PaymentType: "BANK_WIRE";
  CreationDate: number;
  ExecutionDate?: number;
  Tag?: string;
};

// ─── KYC documents ────────────────────────────────────────────────────────

export type KycDocumentType =
  | "IDENTITY_PROOF"
  | "REGISTRATION_PROOF"
  | "ARTICLES_OF_ASSOCIATION"
  | "SHAREHOLDER_DECLARATION"
  | "ADDRESS_PROOF";

export type KycDocumentStatus =
  | "CREATED"
  | "VALIDATION_ASKED"
  | "VALIDATED"
  | "REFUSED"
  | "OUT_OF_DATE";

export type KycDocument = {
  Id: string;
  UserId: string;
  Type: KycDocumentType;
  Status: KycDocumentStatus;
  RefusedReasonType?: string;
  RefusedReasonMessage?: string;
  CreationDate: number;
  ProcessedDate?: number;
  Tag?: string;
};

// ─── Hosted UserKYC ───────────────────────────────────────────────────────

/**
 * MangoPay's "Onboarding Sessions" (also called "Hosted KYC") gives us a URL
 * that the user opens to upload their documents and KYC their account in a
 * MangoPay-hosted iframe / page.
 *
 * Current name in API: "User Onboarding". Available since 2023.
 */
export type OnboardingSessionCreate = {
  UserId: string;
  ReturnUrl: string;
  Locale?: "en" | "fr";
  Tag?: string;
};

export type OnboardingSession = {
  Id: string;
  UserId: string;
  Url: string;
  ExpirationDate: number;
  CreationDate: number;
};

// ─── Disputes ─────────────────────────────────────────────────────────────

export type DisputeStatus =
  | "CREATED"
  | "PENDING_CLIENT_ACTION"
  | "SUBMITTED"
  | "PENDING_BANK_ACTION"
  | "REOPENED_PENDING_CLIENT_ACTION"
  | "CLOSED";

export type DisputeType =
  | "CONTESTABLE"
  | "NOT_CONTESTABLE"
  | "RETRIEVAL";

export type Dispute = {
  Id: string;
  InitialTransactionId: string;
  InitialTransactionType: "PAYIN";
  DisputeType: DisputeType;
  ContestedFunds: Money;
  DisputedFunds: Money;
  Status: DisputeStatus;
  StatusMessage: string | null;
  ContestDeadlineDate: number;
  ResultCode: string | null;
  ResultMessage: string | null;
  Reason: {
    DisputeReasonType: string;
    DisputeReasonMessage: string;
  };
  CreationDate: number;
};

// ─── Webhook events ───────────────────────────────────────────────────────

export type MangoPayEventType =
  | "KYC_SUCCEEDED"
  | "KYC_FAILED"
  | "KYC_OUTDATED"
  | "IDENTITY_PROOF_VALIDATED"
  | "IDENTITY_PROOF_REFUSED"
  | "REGISTRATION_PROOF_VALIDATED"
  | "REGISTRATION_PROOF_REFUSED"
  | "PAYIN_NORMAL_CREATED"
  | "PAYIN_NORMAL_SUCCEEDED"
  | "PAYIN_NORMAL_FAILED"
  | "TRANSFER_NORMAL_CREATED"
  | "TRANSFER_NORMAL_SUCCEEDED"
  | "TRANSFER_NORMAL_FAILED"
  | "PAYOUT_NORMAL_CREATED"
  | "PAYOUT_NORMAL_SUCCEEDED"
  | "PAYOUT_NORMAL_FAILED"
  | "REFUND_NORMAL_CREATED"
  | "REFUND_NORMAL_SUCCEEDED"
  | "REFUND_NORMAL_FAILED"
  | "DISPUTE_CREATED"
  | "DISPUTE_FUNDS_CHECKED_OUT"
  | "DISPUTE_CLOSED";

export type MangoPayWebhookEvent = {
  ResourceId: string;
  EventType: MangoPayEventType;
  Date: number; // unix seconds
};

// ─── KYC level enum (PokeMarket-internal) ─────────────────────────────────

/**
 * PokeMarket's simplified KYC ladder:
 *  - NONE    : just signed up, can vend up to ~2500€/12mo (MangoPay limits)
 *  - LIGHT   : email + phone + address + selfie validated, can payout up to 2500€/12mo
 *  - REGULAR : ID + proof of address validated, unlimited payouts
 *
 * Maps loosely to MangoPay's KYCLevel field, but adds a "NONE" level for
 * users who exist in PokeMarket but haven't completed any KYC step yet.
 */
export type KycLevel = "NONE" | "LIGHT" | "REGULAR";
