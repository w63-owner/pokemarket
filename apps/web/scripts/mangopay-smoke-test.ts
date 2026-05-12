/**
 * MangoPay sandbox smoke test.
 *
 * Run once after creating a sandbox account to validate:
 *   - OAuth credentials work
 *   - You can create a NaturalUser + Wallet (bootstraps your platform user)
 *   - Card tokenisation + PayIn round-trips and credits the wallet
 *
 * Usage:
 *   1. Fill in MANGOPAY_CLIENT_ID + MANGOPAY_API_KEY in .env.local
 *   2. Run: `npx tsx scripts/mangopay-smoke-test.ts`
 *   3. Copy the printed Platform User Id + Wallet Id into:
 *        MANGOPAY_PLATFORM_USER_ID
 *        MANGOPAY_PLATFORM_WALLET_ID
 *   4. Run again any time to verify credentials still work.
 *
 * This script is idempotent: it reuses the platform user/wallet from env
 * vars if set, otherwise creates fresh ones and prints them.
 *
 * Sandbox test card (Visa, no 3DS): 4970103181088864 / 12/30 / 123
 *
 * NOT run in CI. NOT imported by app code.
 */

/* eslint-disable no-console */
import { config } from "dotenv";

config({ path: ".env.local" });

async function main(): Promise<void> {
  // Lazy import so the dotenv config above runs first.
  const { mangopay } = await import("../src/lib/mangopay/server");
  const { getMangoPayConfig } = await import("../src/lib/env");

  const cfg = getMangoPayConfig();
  if (!cfg.clientId || !cfg.apiKey) {
    console.error(
      "Missing MANGOPAY_CLIENT_ID or MANGOPAY_API_KEY. Add them to .env.local first.",
    );
    process.exit(1);
  }

  console.log("• Authenticating with MangoPay sandbox…");
  const token = await mangopay._getAccessToken();
  console.log(`  ✓ Got access token (${token.slice(0, 12)}…)`);

  let platformUserId = cfg.platformUserId;
  let platformWalletId = cfg.platformWalletId;

  if (!platformUserId) {
    console.log("\n• Creating PLATFORM NaturalUser…");
    const platformUser = await mangopay.users.createNatural({
      FirstName: "PokeMarket",
      LastName: "Platform",
      Email: "platform@pokemarket.fr",
      // 1990-01-01 in unix seconds
      Birthday: 631152000,
      Nationality: "FR",
      CountryOfResidence: "FR",
      Tag: "platform",
    });
    platformUserId = platformUser.Id;
    console.log(`  ✓ Platform User Id: ${platformUserId}`);
    console.log(
      `\n  >>> COPY this into .env.local as MANGOPAY_PLATFORM_USER_ID`,
    );
  } else {
    console.log(`\n• Reusing existing platform user ${platformUserId}`);
  }

  if (!platformWalletId) {
    console.log("\n• Creating PLATFORM Wallet…");
    const wallet = await mangopay.wallets.create({
      Owners: [platformUserId],
      Description: "PokeMarket platform escrow wallet",
      Currency: "EUR",
      Tag: "platform",
    });
    platformWalletId = wallet.Id;
    console.log(`  ✓ Platform Wallet Id: ${platformWalletId}`);
    console.log(
      `\n  >>> COPY this into .env.local as MANGOPAY_PLATFORM_WALLET_ID`,
    );
  } else {
    console.log(`\n• Reusing existing platform wallet ${platformWalletId}`);
  }

  console.log("\n• Creating a TEST buyer NaturalUser + Wallet…");
  const buyer = await mangopay.users.createNatural({
    FirstName: "Test",
    LastName: "Buyer",
    Email: `smoketest+${Date.now()}@pokemarket.fr`,
    Birthday: 946684800, // 2000-01-01
    Nationality: "FR",
    CountryOfResidence: "FR",
    Tag: "smoke-test-buyer",
  });
  console.log(`  ✓ Buyer Id: ${buyer.Id}`);

  console.log("\n• Creating CardRegistration…");
  const registration = await mangopay.cardRegistrations.create({
    UserId: buyer.Id,
    Currency: "EUR",
    CardType: "CB_VISA_MASTERCARD",
  });
  console.log(`  ✓ CardRegistration Id: ${registration.Id}`);

  console.log("\n• Tokenising test card via direct browser-style POST…");
  const formBody = new URLSearchParams({
    data: registration.PreregistrationData,
    accessKeyRef: registration.AccessKey,
    cardNumber: "4970103181088864",
    cardExpirationDate: "1230",
    cardCvx: "123",
  });
  const tokenRes = await fetch(registration.CardRegistrationURL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody.toString(),
  });
  const tokenText = (await tokenRes.text()).trim();
  if (!tokenText.startsWith("data=")) {
    throw new Error(`Tokenisation failed: ${tokenText}`);
  }
  console.log(`  ✓ Got registration data (${tokenText.length} bytes)`);

  console.log("\n• Finalising CardRegistration…");
  const finalized = await mangopay.cardRegistrations.finalize(registration.Id, {
    RegistrationData: tokenText,
  });
  if (!finalized.CardId) {
    throw new Error(`No CardId returned: status=${finalized.Status}`);
  }
  console.log(`  ✓ Card Id: ${finalized.CardId}`);

  console.log("\n• Creating direct card PayIn (100 EUR -> platform wallet)…");
  const payin = await mangopay.payins.createCardDirect(
    {
      AuthorId: buyer.Id,
      CreditedWalletId: platformWalletId,
      DebitedFunds: { Amount: 10000, Currency: "EUR" },
      Fees: { Amount: 0, Currency: "EUR" },
      CardId: finalized.CardId,
      SecureMode: "DEFAULT",
      SecureModeReturnURL: "https://pokemarket.fr/checkout/3ds-return",
      Browser: {
        AcceptHeader: "text/html",
        JavaEnabled: false,
        Language: "fr-FR",
        ColorDepth: 24,
        ScreenHeight: 1080,
        ScreenWidth: 1920,
        TimeZoneOffset: "-60",
        UserAgent: "smoke-test",
        JavascriptEnabled: true,
      },
      IpAddress: "127.0.0.1",
    },
    `smoke-payin-${Date.now()}`,
  );

  console.log(`  ✓ PayIn ${payin.Id} status=${payin.Status}`);
  if (payin.Status === "FAILED") {
    console.error(
      `  ✗ PayIn failed: code=${payin.ResultCode} msg=${payin.ResultMessage}`,
    );
    process.exit(1);
  }

  console.log("\n• Verifying platform wallet balance…");
  const updatedWallet = await mangopay.wallets.get(platformWalletId);
  console.log(
    `  ✓ Wallet balance: ${updatedWallet.Balance.Amount / 100} ${updatedWallet.Balance.Currency}`,
  );

  console.log("\n✅ Smoke test passed!\n");

  if (!cfg.platformUserId || !cfg.platformWalletId) {
    console.log("⚠️  Reminder: copy these into .env.local before next run:");
    console.log(`   MANGOPAY_PLATFORM_USER_ID=${platformUserId}`);
    console.log(`   MANGOPAY_PLATFORM_WALLET_ID=${platformWalletId}`);
  }
}

main().catch((err) => {
  console.error("\n❌ Smoke test failed:");
  console.error(err);
  process.exit(1);
});
