# PLAN V1.1 — Audit 360° Fixes

> **Généré le :** 24 mars 2026
> **Source :** `.cursor/plans/pokemarket_360_audit_5f6a702e.plan.md`
> **Objectif :** Résoudre l'intégralité de la dette technique, des failles de sécurité et des fonctionnalités manquantes identifiées dans l'audit 360° de la V1.

---

## Sprint 1 : 🚨 Hotfixes Sécurité & Légal (Priorité CRITIQUE)

> **Durée estimée :** 2-3 jours
> **Objectif :** Éliminer les vulnérabilités exploitables immédiatement et couvrir le minimum légal.

### 1.1 — Rotation des clés Supabase & nettoyage du `.env.local.example`

Les vrais JWT (anon key + service_role key) pointant vers `qevmnveyjdovupyveoqc.supabase.co` sont commités en clair. Un attaquant peut bypasser toute la RLS avec le service_role.

- [ ] **Rotation des clés** dans le Supabase Dashboard (Settings → API → Regenerate keys)
- [ ] **Remplacer** les vraies clés par des placeholders dans `.env.local.example`
- [ ] **Vérifier** que `.env.local` est bien dans `.gitignore` (et `.env*` en général)
- [ ] **Auditer l'historique git** : vérifier si d'autres secrets ont fuité dans des commits précédents (`git log -p -- .env*`)
- [ ] Mettre à jour les variables d'environnement sur Vercel / l'hébergeur de production avec les nouvelles clés

**Fichiers cibles :**

- `.env.local.example` — remplacer les valeurs par des placeholders
- `.gitignore` — vérifier la présence des patterns `.env*`

---

### 1.2 — Sécurisation de l'endpoint `/api/ocr` (Auth Supabase requise)

L'endpoint est public : aucun `getUser()`. N'importe qui peut consommer le quota OpenAI (GPT-4o-mini Vision) et potentiellement abuser de l'URL d'image passée à l'API.

- [x] Ajouter la vérification d'authentification Supabase (`createClient()` → `getUser()`) en tête du handler POST
- [x] Retourner une `401 Unauthorized` si l'utilisateur n'est pas connecté
- [x] Valider le format de `image_url` (URL Supabase Storage uniquement, pas d'URL arbitraire) pour prévenir les attaques SSRF
- [x] Logger le `user.id` dans les `ocr_attempts` pour traçabilité

**Fichiers cibles :**

- `src/app/api/ocr/route.ts` — ajout auth + validation URL
- `src/lib/supabase/server.ts` — réutilisation du helper `createClient()`

---

### 1.3 — Sécurisation de l'endpoint `/api/push/send` (Fix IDOR sur `user_id`)

L'endpoint vérifie l'authentification mais accepte n'importe quel `user_id` en body. Un utilisateur connecté peut envoyer des push notifications arbitraires à n'importe qui.

- [x] Ajouter une vérification de légitimité : l'appelant ne peut envoyer une notification qu'à un utilisateur avec qui il a une conversation active ou une transaction en cours
- [x] Requêter les tables `conversations` ou `transactions` pour valider la relation entre `caller.id` et `body.user_id`
- [x] Retourner une `403 Forbidden` si la relation n'existe pas
- [ ] Envisager de déplacer l'envoi de push en interne uniquement (appelé depuis les webhooks/server actions, jamais directement par le client)

**Fichiers cibles :**

- `src/app/api/push/send/route.ts` — ajout vérification de relation
- `src/lib/push/send.ts` — éventuellement internaliser la logique

---

### 1.4 — Création des pages légales (CGV, RGPD, Politique de confidentialité)

Aucune page légale n'existe. Pour un marketplace C2C opérant en France/UE, c'est une obligation impérative.

- [x] Créer la page **Conditions Générales de Vente (CGV)** — `/legal/cgv`
- [x] Créer la page **Politique de Confidentialité (RGPD)** — `/legal/privacy`
- [x] Créer la page **Conditions Générales d'Utilisation (CGU)** — `/legal/cgu`
- [x] Créer la page **Mentions Légales** — `/legal/mentions`
- [x] Ajouter les liens vers ces pages dans le footer / layout principal
- [x] Ajouter une bannière de consentement aux cookies (Supabase Auth utilise des cookies)

**Fichiers cibles :**

- `src/app/(public)/legal/cgv/page.tsx` — nouveau
- `src/app/(public)/legal/privacy/page.tsx` — nouveau
- `src/app/(public)/legal/cgu/page.tsx` — nouveau
- `src/app/(public)/legal/mentions/page.tsx` — nouveau
- `src/app/(public)/legal/layout.tsx` — layout partagé pour les pages légales (nouveau)
- `src/components/layout/tab-bar.tsx` ou footer — ajout liens légaux
- `src/components/shared/cookie-banner.tsx` — nouveau

---

## Sprint 2 : 🛡️ Robustesse Backend & Performance (Priorité ÉLEVÉE)

> **Durée estimée :** 3-4 jours
> **Objectif :** Colmater les brèches de sécurité restantes, corriger les problèmes de performance backend, et aligner les types avec la réalité du schéma.

### 2.1 — Ajout de la RLS sur `ocr_attempts` et `stripe_webhooks_processed`

Ces deux tables créées dans `00010_utility_tables.sql` n'ont jamais eu `ENABLE ROW LEVEL SECURITY`. Avec les grants par défaut de PostgREST, les rôles `anon`/`authenticated` peuvent les lire/écrire directement.

- [ ] Créer une nouvelle migration `00036_rls_utility_tables.sql`
- [ ] `ALTER TABLE ocr_attempts ENABLE ROW LEVEL SECURITY;`
- [ ] Policy `ocr_attempts` : un utilisateur authentifié ne peut voir que ses propres tentatives (colonne `user_id`)
- [ ] `ALTER TABLE stripe_webhooks_processed ENABLE ROW LEVEL SECURITY;`
- [ ] Policy `stripe_webhooks_processed` : **aucun accès** pour `anon`/`authenticated` (table interne, accès uniquement via `service_role`)
- [ ] Tester avec un client anon que les tables sont inaccessibles

**Fichiers cibles :**

- `supabase/migrations/00036_rls_utility_tables.sql` — nouveau
- `supabase/migrations/00010_utility_tables.sql` — référence (ne pas modifier, la RLS s'ajoute par migration incrémentale)

---

### 2.2 — Résolution de la requête N+1 dans l'endpoint OCR

`matchTcgdexCards` fait 3 requêtes séquentielles (cards → sets → series). Pour 20 cartes, c'est 3 round-trips inutiles.

- [ ] Créer une RPC PostgreSQL `match_tcgdex_cards(p_name TEXT, p_local_id TEXT)` qui fait le JOIN en une seule requête (cards JOIN sets JOIN series)
- [ ] Retourner directement les colonnes nécessaires au scoring de confiance
- [ ] Mettre à jour le handler OCR pour appeler la RPC au lieu des 3 `.select()` séquentiels
- [ ] Ajouter la migration SQL correspondante

**Fichiers cibles :**

- `supabase/migrations/00037_rpc_match_tcgdex.sql` — nouveau (RPC function)
- `src/app/api/ocr/route.ts` — remplacement de `matchTcgdexCards` par l'appel RPC

---

### 2.3 — Resynchronisation des types TypeScript avec le schéma SQL

Les types dans `database.ts` sont désynchronisés : colonnes manquantes sur `ocr_attempts`, tables absentes (`price_estimations`, `stripe_webhooks_processed`), signature de `search_listings_feed` obsolète.

- [ ] Exécuter `npx supabase gen types typescript --local > src/types/database.ts` (ou depuis le projet lié)
- [ ] Vérifier que les tables `ocr_attempts`, `price_estimations`, `stripe_webhooks_processed` apparaissent dans les types générés
- [ ] Vérifier que la signature de `search_listings_feed` correspond aux migrations `00031`/`00033`
- [ ] Corriger les erreurs TypeScript résultantes dans le codebase (imports, accès aux colonnes)
- [ ] Lancer `npm run type-check` et résoudre tous les échecs

**Fichiers cibles :**

- `src/types/database.ts` — regénéré
- `src/lib/api/listings.ts` — vérifier les types de retour du feed
- `src/app/api/ocr/route.ts` — vérifier les colonnes `ocr_attempts`
- Tout fichier qui importe `Database["public"]["Tables"]`

---

### 2.4 — Implémentation du Rate Limiting (OCR, Checkout, Push)

Aucune des 12 routes API n'a de rate limiting. L'endpoint OCR est particulièrement critique (coût OpenAI illimité).

- [ ] Installer `@upstash/ratelimit` + `@upstash/redis` (ou implémentation custom avec un Map en mémoire si pas de Redis en prod)
- [ ] Créer un helper `src/lib/rate-limit.ts` avec des tiers configurables par route
- [ ] Appliquer le rate limiter sur :
  - `/api/ocr` — 5 req/min/user
  - `/api/checkout` — 3 req/min/user
  - `/api/push/send` — 10 req/min/user
  - `/api/stripe-connect/onboard` — 2 req/min/user
- [ ] Retourner `429 Too Many Requests` avec header `Retry-After`
- [ ] Ajouter les variables d'env Upstash dans `.env.local.example`

**Fichiers cibles :**

- `src/lib/rate-limit.ts` — nouveau
- `src/app/api/ocr/route.ts` — intégration rate limiter
- `src/app/api/checkout/route.ts` — intégration rate limiter
- `src/app/api/push/send/route.ts` — intégration rate limiter
- `src/app/api/stripe-connect/onboard/route.ts` — intégration rate limiter
- `.env.local.example` — ajout `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- `package.json` — ajout dépendances

---

### 2.5 — Création de l'endpoint payout Stripe Connect

Le code client (`src/lib/api/wallet.ts`) appelle `POST /api/stripe-connect/payout`, mais cette route n'existe pas. Les vendeurs ne peuvent pas retirer leurs fonds.

- [ ] Créer la route `src/app/api/stripe-connect/payout/route.ts`
- [ ] Authentifier l'appelant et vérifier qu'il est le propriétaire du wallet
- [ ] Vérifier que le compte Stripe Connect du vendeur est `charges_enabled`
- [ ] Créer un Transfer Stripe depuis le compte plateforme vers le compte connecté
- [ ] Créer un Payout depuis le compte connecté vers le compte bancaire du vendeur
- [ ] Mettre à jour le solde du wallet en base (via `service_role`)
- [ ] Créer un enregistrement dans la table transactions pour traçabilité
- [ ] Gérer les erreurs Stripe (fonds insuffisants, compte pas encore activé, etc.)

**Fichiers cibles :**

- `src/app/api/stripe-connect/payout/route.ts` — nouveau
- `src/lib/stripe/server.ts` — ajout des helpers transfer/payout si nécessaire
- `src/lib/api/wallet.ts` — vérifier la compatibilité du client existant

---

### 2.6 — Fix try/catch sur `/api/stripe/payment-methods`

Les handlers GET et POST n'ont pas de try/catch. Si Stripe est down, c'est un 500 non contrôlé.

- [ ] Envelopper les handlers GET et POST dans un try/catch
- [ ] Retourner une erreur JSON structurée avec un message explicite
- [ ] Ajouter `Sentry.captureException(error)` dans le catch

**Fichiers cibles :**

- `src/app/api/stripe/payment-methods/route.ts` — ajout try/catch + Sentry

---

## Sprint 3 : ⚡ Caching, UX & Résilience (Priorité MOYENNE / ÉLEVÉE)

> **Durée estimée :** 3-4 jours
> **Objectif :** Améliorer drastiquement les temps de réponse, la résilience aux erreurs et l'expérience utilisateur pendant les chargements.

### 3.1 — Stratégie de cache : ISR + revalidation

Aucun cache, aucun `revalidatePath`/`revalidateTag`. Chaque page view reconstruit tout from scratch.

- [ ] Ajouter `export const revalidate = 60` sur les pages quasi-statiques :
  - `/listing/[id]/page.tsx` — les détails d'un listing changent rarement
  - `/u/[username]/page.tsx` — le profil public
- [ ] Implémenter `revalidatePath` / `revalidateTag` dans les mutations :
  - Après création/modification d'un listing → revalidate `/listing/[id]`
  - Après modification du profil → revalidate `/u/[username]`
  - Dans le webhook Stripe (après paiement) → revalidate le listing concerné
- [ ] Ajouter des headers `Cache-Control` sur les API routes publiques (price-history, etc.)
- [ ] Envisager `unstable_cache` pour les requêtes fréquentes côté serveur (catalogue TCGdex, shipping matrix)

**Fichiers cibles :**

- `src/app/(public)/listing/[id]/page.tsx` — ajout `revalidate`
- `src/app/(public)/u/[username]/page.tsx` — ajout `revalidate`
- `src/app/api/webhooks/stripe/route.ts` — ajout `revalidatePath` après paiement
- `src/lib/api/listings.server.ts` — ajout `revalidatePath` / `revalidateTag` après mutations
- `src/app/api/cards/[card_key]/price-history/route.ts` — ajout `Cache-Control`

---

### 3.2 — Ajout des `loading.tsx` dans les route groups

Aucun `loading.tsx` sauf des `Suspense` manuels sur la home. Les navigations vers les pages protégées n'ont pas de feedback serveur immédiat.

- [ ] Créer `loading.tsx` avec des Skeletons UI-matched pour chaque route group :
  - `(protected)/messages/loading.tsx` — skeleton liste de conversations
  - `(protected)/favorites/loading.tsx` — skeleton grille de cartes
  - `(protected)/offers/loading.tsx` — skeleton liste d'offres
  - `(protected)/profile/loading.tsx` — skeleton profil
  - `(protected)/sell/loading.tsx` — skeleton formulaire
  - `(protected)/checkout/[listingId]/loading.tsx` — skeleton checkout
  - `(protected)/wallet/loading.tsx` — skeleton wallet
  - `(public)/search/loading.tsx` — skeleton résultats recherche
  - `(public)/listing/[id]/loading.tsx` — skeleton fiche produit

**Fichiers cibles :**

- `src/app/(protected)/messages/loading.tsx` — nouveau
- `src/app/(protected)/favorites/loading.tsx` — nouveau
- `src/app/(protected)/offers/loading.tsx` — nouveau
- `src/app/(protected)/profile/loading.tsx` — nouveau
- `src/app/(protected)/sell/loading.tsx` — nouveau
- `src/app/(protected)/checkout/[listingId]/loading.tsx` — nouveau
- `src/app/(protected)/wallet/loading.tsx` — nouveau
- `src/app/(public)/search/loading.tsx` — nouveau
- `src/app/(public)/listing/[id]/loading.tsx` — nouveau

---

### 3.3 — Ajout des Error Boundaries granulaires

Un seul `error.tsx` global. Une erreur dans le checkout crash toute l'app.

- [ ] Créer `src/app/global-error.tsx` pour couvrir les erreurs dans le Root Layout
- [ ] Créer des `error.tsx` granulaires pour les routes critiques :
  - `(protected)/checkout/[listingId]/error.tsx` — erreur checkout avec CTA retry
  - `(protected)/messages/error.tsx` — erreur messagerie avec fallback
  - `(protected)/messages/[conversationId]/error.tsx` — erreur conversation
  - `(protected)/wallet/error.tsx` — erreur wallet
  - `(public)/listing/[id]/error.tsx` — erreur fiche produit
- [ ] Chaque `error.tsx` doit avoir un bouton "Réessayer" (`reset()`) et un design cohérent
- [ ] Ajouter `Sentry.captureException(error)` dans chaque error boundary

**Fichiers cibles :**

- `src/app/global-error.tsx` — nouveau
- `src/app/(protected)/checkout/[listingId]/error.tsx` — nouveau
- `src/app/(protected)/messages/error.tsx` — nouveau
- `src/app/(protected)/messages/[conversationId]/error.tsx` — nouveau
- `src/app/(protected)/wallet/error.tsx` — nouveau
- `src/app/(public)/listing/[id]/error.tsx` — nouveau

---

### 3.4 — Content-Security-Policy (CSP) dans `next.config.ts`

Les headers de sécurité sont partiels. Le CSP est le header le plus important contre les XSS.

- [ ] Définir une CSP stricte dans `next.config.ts` (section `headers`)
- [ ] Autoriser les domaines nécessaires :
  - `self` pour les scripts et styles
  - `*.supabase.co` pour les API et le storage
  - `*.stripe.com` pour Stripe.js
  - `*.sentry.io` pour Sentry
  - `fonts.googleapis.com` / `fonts.gstatic.com` pour les polices
- [ ] Utiliser `nonce` pour les scripts inline si Next.js le supporte (sinon `unsafe-inline` en dernier recours pour les styles Tailwind)
- [ ] Tester en mode `Content-Security-Policy-Report-Only` d'abord pour ne pas casser la prod
- [ ] Corriger l'injection JSON-LD : échapper les `<` en `\u003c` dans le `JSON.stringify`

**Fichiers cibles :**

- `next.config.ts` — ajout header CSP
- `src/app/(public)/listing/[id]/page.tsx` — fix JSON-LD (échappement `\u003c`)
- `src/app/(public)/u/[username]/page.tsx` — fix JSON-LD si présent

---

### 3.5 — Pagination du Sitemap

`sitemap.ts` charge toutes les listings + tous les profils sans `.limit()`. À 10 000 listings, c'est un payload de plusieurs Mo.

- [ ] Implémenter un **sitemap index** avec `sitemap.ts` retournant des liens vers des sous-sitemaps paginés
- [ ] Chaque sous-sitemap contient max 10 000 URLs (limite Google)
- [ ] Paginer les requêtes Supabase avec `.range(offset, offset + limit)`
- [ ] Ou utiliser la fonctionnalité native Next.js `generateSitemaps()` si disponible

**Fichiers cibles :**

- `src/app/sitemap.ts` — refactoring en sitemap index paginé (ou split en plusieurs fichiers)

---

### 3.6 — Ajout de `Sentry.captureException` explicite + réduction `tracesSampleRate`

`tracesSampleRate: 1.0` en production = 100% des transactions tracées → coûts élevés. Les catch blocks utilisent `console.error` au lieu de Sentry.

- [ ] Réduire `tracesSampleRate` à `0.1` en production (garder `1.0` en dev)
- [ ] Ajouter `Sentry.captureException(error)` dans tous les catch blocks des API routes :
  - `src/app/api/ocr/route.ts`
  - `src/app/api/checkout/route.ts`
  - `src/app/api/webhooks/stripe/route.ts`
  - `src/app/api/push/send/route.ts`
  - `src/app/api/stripe-connect/onboard/route.ts`
  - `src/app/api/stripe-connect/status/route.ts`
- [ ] Remplacer le `.catch(() => {})` silencieux du webhook Stripe (ligne ~195) par un `Sentry.captureException`
- [ ] Créer `src/instrumentation.ts` pour le server-side Node.js instrumentation si manquant

**Fichiers cibles :**

- `sentry.client.config.ts` — conditionner `tracesSampleRate`
- `sentry.server.config.ts` — conditionner `tracesSampleRate`
- `sentry.edge.config.ts` — conditionner `tracesSampleRate`
- `src/app/api/webhooks/stripe/route.ts` — fix `.catch(() => {})`
- Toutes les API routes listées ci-dessus — ajout `Sentry.captureException`
- `src/instrumentation.ts` — nouveau si manquant

---

## Sprint 4 : 🚀 Business, A11y & Next Steps (Priorité MOYENNE / BASSE)

> **Durée estimée :** 5-7 jours
> **Objectif :** Combler les fonctionnalités business manquantes, améliorer l'accessibilité, et poser les bases pour scaler.

### 4.1 — Dashboard Admin + Modération

Aucune interface d'administration. Modération, litiges, métriques business et suspension d'utilisateurs se font en SQL direct.

- [ ] Créer un route group `(admin)` protégé par un rôle `admin` dans la table `profiles`
- [ ] Ajouter une colonne `role` (enum: `user`, `admin`) dans `profiles` si absente
- [ ] Créer un middleware/guard admin vérifiant le rôle
- [ ] Page dashboard avec métriques : GMV, taux de conversion, commissions, nombre d'utilisateurs
- [ ] Page de modération des annonces : liste des signalements, actions (supprimer, suspendre)
- [ ] Page de gestion des litiges : voir les disputes, résoudre, rembourser via Stripe
- [ ] Page de gestion des utilisateurs : suspendre/bannir

**Fichiers cibles :**

- `src/app/(admin)/layout.tsx` — nouveau (avec guard admin)
- `src/app/(admin)/admin/page.tsx` — dashboard (nouveau)
- `src/app/(admin)/admin/listings/page.tsx` — modération (nouveau)
- `src/app/(admin)/admin/disputes/page.tsx` — litiges (nouveau)
- `src/app/(admin)/admin/users/page.tsx` — utilisateurs (nouveau)
- `supabase/migrations/00038_profiles_admin_role.sql` — nouveau (si colonne manquante)
- `src/components/layout/admin-guard.tsx` — nouveau

---

### 4.2 — Système de signalement d'annonces

Aucun mécanisme pour signaler une annonce frauduleuse, une contrefaçon ou un comportement abusif.

- [ ] Créer la table `reports` (migration SQL) avec : `id`, `reporter_id`, `listing_id`, `reason`, `description`, `status`, `created_at`
- [ ] Ajouter la RLS : un utilisateur ne peut voir que ses propres signalements
- [ ] Créer le composant "Signaler" (bouton + dialog avec raison + description)
- [ ] Intégrer le bouton sur la page listing (`listing-actions.tsx`)
- [ ] Afficher les signalements dans le dashboard admin (Sprint 4.1)

**Fichiers cibles :**

- `supabase/migrations/00039_reports.sql` — nouveau
- `src/components/listing/report-dialog.tsx` — nouveau
- `src/components/listing/listing-actions.tsx` — ajout bouton signaler
- `src/lib/api/reports.ts` — nouveau (fonctions CRUD)
- `src/lib/validations.ts` — ajout `reportSchema`

---

### 4.3 — Réputation vendeur visible sur les profils publics

La table `reviews` et le schema existent, mais la réputation agrégée (moyenne, nombre d'avis) n'est affichée nulle part.

- [ ] Créer une RPC `get_seller_reputation(p_seller_id UUID)` retournant `avg_rating`, `review_count`
- [ ] Afficher la réputation sur la page profil public `/u/[username]`
- [ ] Afficher la note moyenne sur le `seller-block.tsx` de la page listing
- [ ] Utiliser le composant `star-rating.tsx` existant en mode lecture

**Fichiers cibles :**

- `supabase/migrations/00040_rpc_seller_reputation.sql` — nouveau
- `src/app/(public)/u/[username]/page.tsx` — intégration réputation
- `src/components/listing/seller-block.tsx` — intégration note moyenne
- `src/components/shared/star-rating.tsx` — vérifier le mode lecture seule

---

### 4.4 — Accessibilité (a11y)

TabBar sans `aria-label`, graphique Recharts inaccessible, patterns ARIA inconsistants.

- [ ] Ajouter `aria-label="Navigation principale"` sur le `<nav>` du TabBar
- [ ] Ajouter `aria-live="polite"` sur les compteurs de badges (messages non lus)
- [ ] Ajouter un tableau de données caché (`sr-only`) ou un `aria-label` sur `price-history-chart.tsx`
- [ ] Auditer et corriger les `aria-*` sur `star-rating.tsx` (mode interactif), `feed-grid.tsx`, `camera-capture.tsx`

**Fichiers cibles :**

- `src/components/layout/tab-bar.tsx` — ajout `aria-label` + `aria-live`
- `src/components/listing/price-history-chart.tsx` — ajout accessibilité
- `src/components/shared/star-rating.tsx` — vérification ARIA
- `src/components/feed/feed-grid.tsx` — vérification ARIA

---

### 4.5 — Pagination sur `fetchMyListings` et listes profil

Plusieurs fonctions utilisent un `limit: 50` fixe sans pagination. Un vendeur actif avec 200+ listings ne voit que les 50 premiers.

- [ ] Implémenter une pagination par curseur (ou infinite scroll) sur `fetchMyListings`
- [ ] Appliquer le même pattern sur les pages :
  - `/profile/listings` — listings du vendeur
  - `/profile/transactions` — historique des transactions
  - `/profile/sales/[id]` — détails vente (si liste)
- [ ] Réutiliser le pattern `useInfiniteQuery` déjà en place sur le feed

**Fichiers cibles :**

- `src/lib/api/listings.ts` — modifier `fetchMyListings` pour supporter la pagination
- `src/lib/api/transactions-history.ts` — ajout pagination
- `src/app/(protected)/profile/listings/page.tsx` — intégration infinite scroll
- `src/app/(protected)/profile/transactions/page.tsx` — intégration infinite scroll

---

### 4.6 — Notifications email transactionnelles manquantes

Les templates existants couvrent la confirmation de commande, l'expédition et la notification de vente, mais il manque des emails critiques.

- [ ] Email de **bienvenue** à l'inscription (trigger après sign-up Supabase ou hook Auth)
- [ ] Email quand un **vendeur reçoit une offre**
- [ ] Email de **rappel d'expédition** (vendeur n'a pas expédié après X jours — cron)
- [ ] Email de **relance recherches sauvegardées** (nouveaux résultats — cron existant ou nouveau)

**Fichiers cibles :**

- `src/lib/emails/send.ts` — ajout des nouvelles fonctions d'envoi
- Templates email (React Email ou HTML) — nouveaux
- `src/app/api/cron/housekeeping/route.ts` — ajout rappel d'expédition
- Webhook/trigger Supabase Auth — email de bienvenue

---

### 4.7 — Migration vers Server Actions (mutations critiques)

0 Server Actions : toutes les mutations passent par des API routes ou des appels Supabase directs côté client. Plus de JS dans le bundle, pas de progressive enhancement.

- [ ] Identifier les mutations critiques à migrer en priorité :
  - Création de listing (`createListing`)
  - Suppression de listing (`deleteListing`)
  - Mise à jour du profil
  - Envoi de message
  - Création/acceptation/refus d'offre
- [ ] Créer `src/actions/listings.ts` (Server Actions pour CRUD listings)
- [ ] Créer `src/actions/profile.ts` (Server Actions pour profil)
- [ ] Créer `src/actions/offers.ts` (Server Actions pour offres)
- [ ] Mettre à jour les composants client pour utiliser les Server Actions (via `useActionState` ou appel direct)
- [ ] Vérifier que le progressive enhancement fonctionne (formulaires utilisables sans JS)

**Fichiers cibles :**

- `src/actions/listings.ts` — nouveau
- `src/actions/profile.ts` — nouveau
- `src/actions/offers.ts` — nouveau
- `src/actions/messages.ts` — nouveau
- Composants client utilisant les mutations — mise à jour des appels

---

### 4.8 — Amélioration du Service Worker (cache PWA)

Le SW ne cache que `offline.html` et `manifest.json`. Pas de cache d'images de cartes, pas de stale-while-revalidate.

- [ ] Ajouter une stratégie **stale-while-revalidate** pour les pages déjà visitées
- [ ] Ajouter une stratégie **cache-first** pour les images de cartes (Supabase Storage)
- [ ] Pré-cacher les assets critiques (CSS, JS, polices)
- [ ] Implémenter un cache avec limite de taille et expiration pour les images

**Fichiers cibles :**

- `public/sw.js` (ou le fichier Service Worker existant) — refactoring des stratégies de cache

---

### 4.9 — Tests unitaires et e2e

1 seul test unitaire (`pricing.test.ts`), 1 seul e2e (`home.spec.ts`). Aucun test sur les API routes critiques.

- [ ] Tests unitaires prioritaires :
  - API route `/api/checkout` — flow de paiement
  - API route `/api/webhooks/stripe` — traitement des events
  - API route `/api/ocr` — parsing et scoring
  - Helper `rate-limit.ts` — vérification des limites
  - Validations Zod — `validations.ts`
- [ ] Tests e2e Playwright prioritaires :
  - Flow d'authentification (sign-up, login, logout)
  - Flow de vente (créer un listing, publier)
  - Flow d'achat (parcourir le feed, checkout)
  - Messagerie (envoyer un message, recevoir)
- [ ] Configurer le coverage report dans Vitest

**Fichiers cibles :**

- `src/app/api/checkout/__tests__/route.test.ts` — nouveau
- `src/app/api/webhooks/stripe/__tests__/route.test.ts` — nouveau
- `src/app/api/ocr/__tests__/route.test.ts` — nouveau
- `src/lib/__tests__/rate-limit.test.ts` — nouveau
- `e2e/auth.spec.ts` — nouveau
- `e2e/sell.spec.ts` — nouveau
- `e2e/checkout.spec.ts` — nouveau
- `e2e/messages.spec.ts` — nouveau
- `vitest.config.ts` — ajout coverage

---

## Récapitulatif

| Sprint       | Nb tâches     | Priorité          | Durée est.       |
| ------------ | ------------- | ----------------- | ---------------- |
| **Sprint 1** | 4 tâches      | 🚨 CRITIQUE       | 2-3 jours        |
| **Sprint 2** | 6 tâches      | 🛡️ ÉLEVÉE         | 3-4 jours        |
| **Sprint 3** | 6 tâches      | ⚡ MOYENNE/ÉLEVÉE | 3-4 jours        |
| **Sprint 4** | 9 tâches      | 🚀 MOYENNE/BASSE  | 5-7 jours        |
| **Total**    | **25 tâches** |                   | **~13-18 jours** |

---

> **Note :** Ce plan ne couvre pas l'internationalisation (i18n), classée BASSE dans l'audit. Elle est repoussée à une V1.2 dédiée car elle nécessite un refactoring transversal de tous les composants et n'a pas d'impact sur la sécurité ni la stabilité.
