# PokeMarket -- Master Plan d'Execution V1

Marketplace C2C de cartes Pokemon TCG
Chaque tache (- [ ]) est atomique et realisable en un seul prompt Cursor.
Document de reference : PRD.md

## Phase 1 -- Initialisation du Projet (Stack, Tooling, Design System)

- [x] 1.1.1 Creer le projet Next.js 16 avec TypeScript, Tailwind, App Router, src directory. Configurer tsconfig.json.
- [x] 1.1.2 Configurer next.config.ts : domaines images Supabase, headers PWA, output standalone.
- [x] 1.1.3 Initialiser Git, creer .gitignore, faire le commit initial.
- [x] 1.2.1 Configurer ESLint 9 flat config.
- [x] 1.2.2 Configurer Prettier. Ajouter scripts lint, format, type-check.
- [x] 1.2.3 Installer et configurer Husky + lint-staged.
- [x] 1.3.1 Installer et initialiser Shadcn/UI.
- [x] 1.3.2 Definir tous les design tokens dans src/styles/globals.css.
- [x] 1.3.3 Configurer les fonts via next/font/google.
- [x] 1.3.4 Implementer le ThemeProvider.
- [x] 1.3.5 Installer Framer Motion et Lucide Icons.
- [x] 1.4.1 Ajouter les composants Shadcn/UI : Button, Input, Label, Card.
- [x] 1.4.2 Ajouter les composants Shadcn/UI : Dialog, Sheet, Tabs.
- [x] 1.4.3 Ajouter les composants Shadcn/UI : Toast, Skeleton, Badge, Avatar.
- [x] 1.4.4 Ajouter les composants Shadcn/UI : Select, Checkbox, Switch, Textarea, Separator, DropdownMenu, Popover.
- [x] 1.5.1 Creer l'arborescence de dossiers.
- [x] 1.5.2 Creer src/lib/constants.ts.
- [x] 1.5.3 Creer src/lib/pricing.ts.
- [x] 1.5.4 Creer src/lib/utils.ts.
- [x] 1.5.5 Creer src/lib/validations.ts (Zod schemas).
- [x] 1.5.6 Creer src/app/layout.tsx (Root Layout).
- [x] 1.5.7 Creer src/components/layout/providers.tsx.
- [x] 1.5.8 Configurer TanStack Query v5.
- [x] 1.5.9 Creer .env.local.example.
- [x] 1.6.1 Creer public/manifest.json.
- [x] 1.6.2 Creer public/offline.html.
- [x] 1.6.3 Creer public/sw.js.
- [x] 1.6.4 Enregistrer le Service Worker.
- [x] 1.7.1 Creer les route groups et layouts.
- [x] 1.7.2 Creer src/app/not-found.tsx et src/app/error.tsx.

## Phase 2 -- Modelisation des Donnees (Supabase)

- [x] 2.1.1 à 2.1.6 Setup clients Supabase (browser, server, middleware, admin).
- [x] 2.2.1 à 2.2.10 Migrations du schema initial (tables profiles, listings, etc.).
- [x] 2.3.1 à 2.3.5 Migrations RLS Policies.
- [x] 2.4.1 à 2.4.3 Migrations Index.
- [x] 2.5.1 à 2.5.2 Migrations Fonctions & Triggers.
- [x] 2.6.1 Migration RPC Feed.
- [x] 2.7.1 Migration Storage buckets.
- [x] 2.8.1 à 2.8.2 Seed Data.
- [x] 2.8.3 Script d'import massif TCGdex (scripts/seed-tcgdex.ts) : fetch series, sets, cards depuis l'API TCGdex v2, upsert dans Supabase. Multi-langue (fr, en, ja). FR: 19 series, 182 sets, 20789 cartes. EN: 19 series, 182 sets, 22755 cartes. JA: 13 series, 156 sets, 5552 cartes.
- [x] 2.9.1 à 2.9.2 Types TypeScript generes.

## Phase 3 -- Authentification & Profils

- [x] 3.1.1 à 3.1.3 Middleware & Auth Guard.
- [x] 3.2.1 à 3.2.4 Pages Auth (Login, Register, Reset, Callback).
- [x] 3.3.1 à 3.3.4 Navigation Principale (Tab Bar mobile, Header desktop).
- [x] 3.4.1 à 3.4.4 Hub Profil & Edition.
- [x] 3.5.1 à 3.5.2 Profil Public Vendeur.

## Phase 4 -- Marketplace Core (Feed, Recherche, Detail)

- [x] 4.1.1 à 4.1.5 Composants Partages (ConditionBadge, PriceDisplay, StarRating, EmptyState, ErrorBanner).
- [x] 4.2.1 à 4.2.3 Listing Card & Skeleton & Favorite Button.
- [x] 4.3.1 à 4.3.4 Feed Marketplace (Logique API & Infinite Scroll).
- [x] 4.4.1 à 4.4.4 Filtres & Recherche (Synchronisation URL).
- [x] 4.5.1 Pull-to-Refresh.
- [x] 4.6.1 à 4.6.6 Detail d'Annonce (Carousel, SSR, Vendeur block).
- [x] 4.7.1 à 4.7.3 API Favoris & Optimistic UI.

## Phase 5 -- Hub Favoris & Creation d'Annonce

- [x] 5.1.1 à 5.1.4 Hub Favoris (Tabs Annonces, Recherches, Vendeurs).
- [x] 5.2.1 à 5.2.2 Upload d'Images Annonces (Compression Client + WebP).
- [x] 5.3.1 à 5.3.3 OCR & Matching (OpenAI Vision + TCGdex).
- [x] 5.4.1 à 5.4.3 Formulaire de Vente (Orchestration complète).
- [x] 5.5.1 Gestion des Annonces (Profil).

## Phase 6 -- Messagerie Temps Reel & Offres

- [x] 6.1.1 à 6.1.2 Infrastructure Realtime.
- [x] 6.2.1 à 6.2.3 Inbox (Liste des conversations).
- [x] 6.3.1 à 6.3.7 Thread de Conversation (Bulles, Auto-read, Optimistic UI).
- [x] 6.4.1 à 6.4.5 Negociation (Barre d'Offres dans le Thread).
- [x] 6.5.1 à 6.5.3 Commerce Post-Achat dans le Thread (Expedition & Reception).
- [x] 6.6.1 Dashboard des Offres (Tabs Reçues / Envoyées).
- [x] 6.8.1 Badge Messages Non-Lus (Global).

## Phase 7 -- Paiement & Escrow (Stripe)

- [x] 7.1.1 Setup Stripe (server, client, webhooks).
- [x] 7.2.1 Implementer src/app/api/checkout/route.ts.
- [x] 7.2.2 Creer src/components/checkout/order-summary.tsx.
- [x] 7.2.3 Creer src/components/checkout/countdown-timer.tsx.
- [x] 7.2.4 Implementer src/app/(protected)/checkout/[listingId]/page.tsx.
- [x] 7.3.1 Implementer src/app/api/webhooks/stripe/route.ts.
- [x] 7.3.2 Handler checkout.session.completed.
- [x] 7.3.3 Handler checkout.session.expired et async_payment_failed.
- [x] 7.4.1 Implementer src/app/(protected)/orders/[id]/success/page.tsx.
- [x] 7.5.1 Implementer src/app/api/cron/release-expired/route.ts.
- [x] 7.5.2 Implementer src/app/api/cron/housekeeping/route.ts.
- [x] 7.6.1 Implementer API Stripe Connect Onboard.
- [x] 7.6.2 à 7.6.4 Pages Wallet & Retour Onboarding.
- [x] 7.7.1 à 7.7.2 Moyens de paiement.
- [x] 7.8.1 à 7.8.2 Historique des Transactions & Ventes.
- [x] 7.9.1 à 7.9.2 Emails Transactionnels (Resend).

## Phase 8 -- PWA, Optimisations, Polish & Production

- [x] 8.1.2 PWA Install Prompt (bannière beforeinstallprompt).
- [ ] 8.1.3 PWA Update Prompt.
- [x] 8.1.4 Page Offline (/offline avec design empathique).
- [x] 8.2.1 à 8.2.3 Animations Polish.
- [x] 8.3.2 à 8.3.4 Performance (LCP priority, Code Splitting, Reduced Motion).
- [ ] 8.3.1 Performance Lighthouse audit.
- [x] 8.4.1 à 8.4.3 SEO (Metadata, sitemap, JSON-LD).
- [x] 8.5.1 Litiges.
- [x] 8.6.1 Referentiel de Prix.
- [x] 8.7.1 à 8.7.2 Tests (Vitest, Playwright).
- [x] 8.8.1 à 8.8.2 CI/CD (GitHub Actions, Vercel).
- [x] 8.9.1 à 8.9.2 Monitoring (Sentry, Analytics).
- [ ] 8.10.1 à 8.10.2 Documentation & Cursor Rules.
