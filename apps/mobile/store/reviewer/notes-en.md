# App Review notes — Apple

> Coller le contenu ci-dessous dans App Store Connect → App Information →
> **App Review Information** → **Notes**. Mettre à jour à chaque submit
> si on change les credentials du compte démo (cf. `seed-reviewer-account.md`).

---

Hi App Review team,

Thank you for reviewing PokeMarket, a C2C marketplace dedicated to
collectible Pokémon trading cards.

## Demo account

A pre-seeded account is available so you can fully test buying, selling
and messaging without leaving the sandbox. The account already has:

- Purchase + sales history (multiple transactions)
- One graded card listed for sale
- One conversation with a pending offer
- A funded wallet (350.00 EUR available)

```
Email:    reviewer@pokemarket.app
Password: ReviewerPass2026!
```

## Walkthrough

1. **Browse** — Open the app, scroll the home feed. Tap any card to
   open the detail screen, swipe through photos, view price history.
2. **AI scan** — Tap the "Sell" tab → "Scan a card" → point the camera
   at any real Pokémon card. The OCR will pre-fill the form.
   (You can also tap "Skip" to enter manually.)
3. **Checkout with Apple Pay** — Open any listing → tap "Buy" →
   PaymentSheet appears. Apple Pay sandbox cards work normally.
   Test card if you prefer manual entry: `4242 4242 4242 4242`,
   any future date, any CVC, ZIP `75001`.
4. **Messaging** — Open the Inbox tab → tap any conversation. Send a
   message. Realtime delivery is < 500 ms.
5. **Wallet / KYC** — Open Profile → Wallet → "Activate payouts".
   Stripe Connect onboarding opens in an in-app browser
   (per Stripe and Apple guidelines). Use Stripe test SSN `000-00-0000`
   and DOB `1900-01-01` to skip KYC validation in test mode.

## Notes for specific guidelines

- **Guideline 3.1.1 (In-App Purchase)** — All transactions on PokeMarket
  are physical-goods (collectible cards shipped between users). They
  are explicitly **out of scope** of IAP per guideline 3.1.5(a). We use
  Apple Pay (via Stripe) for all checkouts.
- **Guideline 3.1.5 (Apple Pay)** — Apple Pay is implemented as the
  primary payment method on iOS and is the default offered in the
  PaymentSheet.
- **Guideline 4.0 (Design)** — The app is fully native React Native (Expo
  Bare workflow), with native cameras, biometrics, push notifications,
  haptics, deep links and Apple Pay.
- **Guideline 5.1.1 (Privacy)** — All required NSUsageDescription strings
  are present and explain in plain French why each capability is needed.
  Privacy policy is at https://pokemarket.app/legal/privacy.
- **Trademark — Pokémon** — PokeMarket is an independent C2C platform.
  We are not affiliated with The Pokémon Company / Nintendo / Game Freak
  / Creatures. The store description includes this disclaimer. We have
  the right to refer to the trademark for nominative use (cards being
  resold). No copyrighted artwork is reproduced beyond user-uploaded
  photos of cards they own.

## Contact

For any question during review:

- Email: review@pokemarket.app (monitored 24/7)
- Phone: +33 6 XX XX XX XX (PT lead, French + English)

Thank you!

— The PokeMarket team
