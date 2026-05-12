# React Native Migration — PokeMarket

Plan de migration de la PWA Next.js 16 vers une application mobile cross-platform (iOS + Android) basée sur **Expo + React Native**, dans un **monorepo** réutilisant un maximum de code.

> Document vivant. Lis et applique les skills `.cursor/skills/react-native-migration` pour les détails opérationnels.

---

## Pourquoi React Native (et pas autre chose)

| Option | Verdict |
|---|---|
| **React Native + Expo** | ✅ Choisi. Réutilise TS/React/Zod/RHF/React Query, vraie expérience native, écosystème mature 2026. |
| Capacitor (wrapper PWA) | Bonne option de court terme. Limites Apple Pay sans plugin natif. À envisager si on veut shipper vite. |
| Flutter | Réécriture totale en Dart, perd l'écosystème JS et l'IA Cursor. Mauvais ROI. |
| PWABuilder (TWA) | Quick win Play Store, risqué côté App Store. À utiliser comme passerelle court-terme uniquement. |

Détail des trade-offs dans le chat de planification.

---

## Architecture cible

```
pokemarket/
├── apps/
│   ├── web/          ← Next.js 16 (UI web + backend /api/* + webhooks)
│   └── mobile/       ← Expo SDK 52+ (iOS + Android)
├── packages/
│   └── shared/       ← code TypeScript partagé (types, validations, query keys, helpers purs)
├── turbo.json
├── package.json      ← workspaces npm
└── tsconfig.base.json
```

**Principe directeur :**

- Le **backend reste sur Vercel** (Next.js API routes, webhooks Stripe/MangoPay, OCR, emails).
- **Aucune UI partagée** entre web et mobile (le coût de l'abstraction dépasse toujours le bénéfice).
- **Toute la logique pure** (validations Zod, types Supabase, query keys, formatting) vit dans `@pokemarket/shared` et est consommée par les deux apps.

---

## Stack mobile

| Concern | Choix |
|---|---|
| Framework | Expo SDK 52+ (managed workflow, EAS Build) |
| Routing | Expo Router v4 (file-based) |
| Styling | NativeWind v4 (Tailwind syntax) |
| UI primitives | react-native-reusables (équivalent Shadcn) |
| Animations | Reanimated 3 + Moti |
| Data | `@tanstack/react-query` (identique au web) |
| Auth/DB | `@supabase/supabase-js` + AsyncStorage |
| Payments | `@stripe/stripe-react-native` (Apple Pay / Google Pay natifs) |
| Forms | `react-hook-form` + `zod` (identique) |
| Push | `expo-notifications` (APNs + FCM) |
| Camera (OCR) | `expo-camera` + `expo-image-manipulator` |
| Icons | `lucide-react-native` |
| Images | `expo-image` |

Voir `.cursor/skills/react-native-migration/tech-mapping.md` pour la table complète web↔mobile.

---

## Plan en 6 sprints

### Sprint 0 — Préparation monorepo (1 semaine)

- [ ] Brancher `chore/monorepo-migration`
- [ ] Convertir le repo en workspaces npm + Turborepo
- [ ] Déplacer le code Next.js dans `apps/web/` (avec `git mv` pour préserver l'historique)
- [ ] Créer `packages/shared/` (squelette vide)
- [ ] Créer `apps/mobile/` via `npx create-expo-app@latest`
- [ ] Configurer NativeWind, Supabase client mobile (avec AsyncStorage), React Query
- [ ] Configurer EAS Build (`eas.json` avec profils dev/preview/production)
- [ ] Vérifier : login Supabase + écran "Hello, {user.email}" sur iOS sim + Android emu

→ Voir `.cursor/skills/react-native-migration/setup-monorepo.md` pour les commandes exactes.

### Sprint 1 — Foundations partagées (3-5 jours)

Extraire vers `packages/shared` :

- [ ] `src/types/database.ts`
- [ ] `src/lib/validations.ts`
- [ ] `src/lib/constants.ts`
- [ ] `src/lib/query-keys.ts`
- [ ] `src/lib/pricing.ts`
- [ ] `src/lib/shipping.ts`
- [ ] `src/lib/utils.ts` (helpers purs uniquement)
- [ ] `src/lib/mangopay/types.ts` + `errors.ts`

Pour chaque extraction, utiliser la skill `extract-shared-code`.

Vérification : `npm run type-check && npm run test && npm run lint` passent partout.

### Sprint 2 — Read-only flows (2 semaines)

Lowest-risk, highest-learning. Porter dans `apps/mobile/` :

- [ ] Auth screens (login, register, OTP)
- [ ] Bottom tab navigator (Feed, Search, Sell, Inbox, Profile)
- [ ] Feed (FlashList avec infinite scroll)
- [ ] Listing detail (carousel, prix, vendeur)
- [ ] Favorites
- [ ] Public profile

Pour chaque composant : skill `port-component-to-rn`.

### Sprint 3 — Design system mobile (1 semaine)

Construire `apps/mobile/components/ui/` en miroir de `apps/web/src/components/ui/`. Même API de props, mêmes noms de composants.

À porter (basé sur les composants UI actuels) :

- [ ] `button.tsx`
- [ ] `card.tsx`
- [ ] `input.tsx`
- [ ] `textarea.tsx`
- [ ] `dialog.tsx`
- [ ] `sheet.tsx`
- [ ] `tabs.tsx`
- [ ] `select.tsx`
- [ ] `checkbox.tsx`
- [ ] `radio-group.tsx`
- [ ] `switch.tsx`
- [ ] `badge.tsx`
- [ ] `avatar.tsx`
- [ ] `skeleton.tsx`
- [ ] `separator.tsx`
- [ ] Toast / Sonner equivalent
- [ ] `popover.tsx`
- [ ] `dropdown-menu.tsx`

Base : react-native-reusables.

### Sprint 4 — Transactionnel (3-4 semaines)

- [ ] Stripe PaymentSheet (Apple Pay + Google Pay natifs) — uplift conversion +30-50% attendu
- [ ] Sell flow multi-steps (formulaire de création de listing)
- [ ] Scan caméra (`expo-camera`) → POST vers `/api/ocr` existant
- [ ] Messaging (Supabase Realtime)
- [ ] Système d'offres
- [ ] Wallet / Mangopay (KYC, payouts)

### Sprint 5 — Native polish (2 semaines)

- [ ] Push notifications (APNs + FCM via `expo-notifications`)
- [ ] Adapter le serveur push pour gérer aussi des tokens Expo
- [ ] Deep links / Universal Links (`expo-linking` + apple-app-site-association)
- [ ] Biometric login (`expo-local-authentication`)
- [ ] Haptics sur interactions clés (achat, like)
- [ ] Onboarding flow + permissions (caméra, notifications)
- [ ] Sentry React Native (DSN dédié)

### Sprint 6 — Ship (2-4 semaines)

- [ ] Configuration App Store Connect + Play Console
- [ ] Assets : icônes, splash screens, screenshots, descriptions FR/EN
- [ ] EAS Submit production
- [ ] Beta TestFlight (iOS) + closed track (Play Store)
- [ ] Itérations sur retours bêta
- [ ] Soumission review Apple (1-3 semaines)
- [ ] Soumission Play Store (~3 jours)
- [ ] Lancement public

**Total réaliste : ~3 mois en solo + Cursor**, plus court à plusieurs.

---

## Ce qui reste exclusivement côté web (Next.js)

Ces modules ne migrent PAS, et ne sont PAS partagés :

- Toutes les routes API (`apps/web/src/app/api/...`)
- Webhooks Stripe (`webhooks/stripe/route.ts`) et Mangopay
- Server Actions (`apps/web/src/actions/`)
- `src/lib/admin/*` (audit log, auth admin)
- `src/lib/stripe/*` (post-payment, reconcile, handlers webhook)
- `src/lib/mangopay/server.ts`
- `src/lib/emails/*` (Resend + React Email)
- `src/lib/push/*` (web-push, VAPID)
- `src/lib/rate-limit.ts` (Upstash)
- `src/lib/env.ts` (validation env serveur)
- Middleware Next.js

Le mobile consomme ces backends via `fetch` vers `https://pokemarket.app/api/*` (auth via Bearer token Supabase).

---

## Risques connus & mitigations

| Risque | Mitigation |
|---|---|
| Apple rejette l'app pour "wrapper minimal" | Avoir au moins 3 features natives clés (caméra, push, biométrie, Apple Pay) avant la review |
| Stripe Apple Pay échoue en WebView | Utiliser `@stripe/stripe-react-native` PaymentSheet — natif |
| Sessions Supabase non persistées | Configurer l'adapter AsyncStorage (cf. `setup-monorepo.md`) |
| `web-push` ne marche pas sur iOS | Ajouter APNs via `expo-notifications`, garder `web-push` pour la PWA |
| Performance liste feed dégradée | Utiliser `<FlashList>` partout, jamais `.map()` dans `<ScrollView>` |
| Tailwind `grid` non supporté en NativeWind | Refactoriser les grids en flex (`flex-row flex-wrap`) |
| Drift de types Supabase entre apps | Régénérer dans `packages/shared/src/types/database.ts` après chaque migration |

---

## Outils Cursor à disposition

Trois skills sont configurées pour t'aider :

| Skill | Quand l'invoquer |
|---|---|
| `react-native-migration` | Setup initial, planning, décisions d'architecture |
| `extract-shared-code` | Pour déplacer un fichier de `apps/web/src/lib/` vers `packages/shared/` |
| `port-component-to-rn` | Pour porter un composant React/Tailwind vers RN/NativeWind |

Et trois rules s'appliquent automatiquement selon le dossier où tu travailles :

| Rule | Scope |
|---|---|
| `monorepo-structure.mdc` | Toujours active (conventions globales) |
| `react-native-mobile.mdc` | `apps/mobile/**` (interdit Next.js, HTML, framer-motion) |
| `shared-package.mdc` | `packages/shared/**` (interdit Next.js, RN, server SDKs) |

---

## Première action

Quand tu seras prêt à démarrer :

```bash
git checkout -b chore/monorepo-migration
```

Puis demande à Cursor : *"Lance la skill react-native-migration et exécute la phase 0 (setup monorepo)."*

L'agent suivra les étapes de `setup-monorepo.md`.
