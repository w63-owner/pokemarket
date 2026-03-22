# PokeMarket — PRD Définitif V1

> **Marketplace C2C de cartes Pokémon TCG**
> Document de Référence Produit — Version définitive
> Dernière mise à jour : 22 mars 2026

---

## Table des matières

1. [Vision Produit](#1-vision-produit)
2. [Arborescence & Navigation](#2-arborescence--navigation)
3. [Fonctionnalités Exhaustives](#3-fonctionnalités-exhaustives)
4. [Modèle de Données & State Management](#4-modèle-de-données--state-management)
5. [Logique Métier & PWA](#5-logique-métier--pwa)
6. [UX/UI — Design System & Animations](#6-uxui--design-system--animations)
7. [Architecture Technique — Scalabilité 100K MAU](#7-architecture-technique--scalabilité-100k-mau)
8. [Plan d'Exécution](#8-plan-dexécution)

---

## 1. Vision Produit

### 1.1 Pitch

**PokeMarket** est une marketplace C2C (Consumer-to-Consumer) permettant aux collectionneurs de cartes Pokémon TCG d'acheter et de vendre leurs cartes entre particuliers. L'application offre un système de paiement sécurisé via escrow (Stripe Connect), une négociation par offres, et une messagerie temps réel intégrée.

L'application est une **PWA française, mobile-first**, construite sur :

- **Next.js 16** (App Router, React 19, Server Components)
- **Supabase** (Auth, PostgreSQL, Realtime, Storage, Edge Functions)
- **Stripe** (Checkout, Connect pour l'escrow vendeur)

### 1.2 Utilisateur cible

| Attribut           | Détail                                            |
| ------------------ | ------------------------------------------------- |
| Profil             | Collectionneur de cartes Pokémon TCG francophone  |
| Comportement       | Particulier, achète et vend depuis son mobile     |
| Fréquence          | 3-5 sessions/semaine, 5-10 min par session        |
| Motivation         | Trouver des cartes rares, monétiser sa collection |
| Appareil principal | Smartphone (80%+), Desktop secondaire             |

### 1.3 Métriques de succès V1

| KPI                                 | Objectif 6 mois | Objectif 12 mois |
| ----------------------------------- | --------------- | ---------------- |
| MAU (Monthly Active Users)          | 10 000          | 100 000          |
| Annonces actives                    | 50 000          | 500 000          |
| Taux de conversion (visite → achat) | 2%              | 3.5%             |
| Temps moyen de vente                | < 7 jours       | < 4 jours        |
| NPS                                 | > 40            | > 55             |
| Crash-free rate                     | > 99.5%         | > 99.8%          |
| LCP (Largest Contentful Paint)      | < 2.5s          | < 1.8s           |
| INP (Interaction to Next Paint)     | < 200ms         | < 150ms          |

### 1.4 Principes directeurs

1. **Mobile-first, toujours** — chaque écran est conçu pour le pouce d'abord
2. **Vitesse perçue** — optimistic UI partout, skeleton loaders, transitions fluides
3. **Confiance** — paiement sécurisé, vérification KYC, système d'avis
4. **Simplicité** — 3 taps pour publier une annonce, 2 taps pour acheter
5. **Beauté** — design world-class, micro-interactions soignées, état d'art UX

---

## 2. Arborescence & Navigation

### 2.1 Navigation principale — Tab Bar

La navigation est composée de 5 onglets affichés en barre fixe en bas (mobile) et en header (desktop) :

| Icône | Label     | Route        | Description                              |
| ----- | --------- | ------------ | ---------------------------------------- |
| 🔍    | Recherche | `/`          | Feed principal / marketplace             |
| ❤️    | Favoris   | `/favorites` | Annonces, recherches et vendeurs favoris |
| ➕    | Vendre    | `/sell`      | Création d'annonce                       |
| 💬    | Messages  | `/messages`  | Inbox conversations (avec badge non-lus) |
| 👤    | Profil    | `/profile`   | Hub du compte utilisateur                |

**Masquage de la tab bar** sur : `/sell`, `/search`, `/listing/*`, `/messages/[conversationId]` pour maximiser l'espace écran.

### 2.2 Arborescence complète

```
/                                    # Feed marketplace (public)
/search                              # Recherche avancée (public)
/listing/[id]                        # Détail d'une annonce (public)
/price-checking                      # Référentiel de prix (public)

/auth                                # Connexion / Inscription
/auth/forgot-password                # Mot de passe oublié
/auth/reset-password                 # Réinitialisation mot de passe
/auth/callback                       # Callback OAuth Supabase

/favorites                           # Hub favoris (3 onglets)

/sell                                # Formulaire création d'annonce

/messages                            # Liste des conversations
/messages/[conversationId]           # Thread de conversation
/messages/[conversationId]/profile   # Profil de l'interlocuteur

/checkout/[listingId]                # Tunnel de paiement
/orders/[id]/success                 # Confirmation commande

/offers                              # Dashboard offres reçues/envoyées

/profile                             # Hub paramètres du compte
/profile/profile                     # Édition du profil
/profile/listings                    # Mes annonces publiées
/profile/transactions                # Historique achats/ventes
/profile/sales                       # Liste des ventes
/profile/sales/[id]                  # Détail d'une vente
/profile/wallet                      # Résumé du portefeuille
/profile/payments                    # Moyens de paiement
/profile/payments/new                # Ajouter une carte
/profile/notifications               # Paramètres notifications push

/wallet                              # Portefeuille & virements (Stripe Connect)
/wallet/return                       # Retour onboarding Stripe Connect

/u/[username]                        # Profil public d'un vendeur

/offline                             # Page hors-ligne (fallback PWA)
```

### 2.3 Protection des routes

| Type             | Routes                                                                 | Comportement                                     |
| ---------------- | ---------------------------------------------------------------------- | ------------------------------------------------ |
| **Public**       | `/`, `/search`, `/price-checking`, `/listing/*`, `/auth/*`, `/offline` | Accessible sans compte                           |
| **Protégé**      | Toutes les autres                                                      | Redirige vers `/auth?next=<url>` si non connecté |
| **Auth inversé** | `/auth`                                                                | Redirige vers `/profile` si déjà connecté        |

---

## 3. Fonctionnalités Exhaustives

> Reprise intégrale de la section 3 du PRD initial — chaque page/vue documentée.

### 3.1 `/` — Feed Marketplace (Home)

**Actions utilisateur :**

- Parcourir un flux infini d'annonces actives (infinite scroll, pagination keyset)
- Pull-to-refresh (mobile)
- Filtrer les annonces via une barre de filtres collapsible :
  - Recherche textuelle (`q`)
  - Extension/Set (`set`)
  - Rareté (`rarity`)
  - État (`condition`)
  - Gradée ou non (`is_graded`), note min/max (`grade_min`, `grade_max`)
  - Prix min/max (`price_min`, `price_max`)
  - Tri : date décroissante (défaut), prix croissant/décroissant, note décroissante
- Ajouter/retirer une annonce de ses favoris (si connecté)
- Sauvegarder une recherche (bouton flottant quand des filtres sont actifs, si connecté)
- Cliquer sur une annonce pour accéder à son détail

**Empty states :**

- Aucun résultat pour les filtres actifs
- Feed vide (aucune annonce en ligne)
- Bannière d'erreur si le chargement échoue

### 3.2 `/search` — Recherche avancée

**Actions utilisateur :**

- Saisir et modifier des critères de recherche (formulaire dédié, mobile-first)
- Accéder à ses recherches sauvegardées (si connecté)
- Retourner au feed avec les paramètres

### 3.3 `/listing/[id]` — Détail d'une annonce

**Actions utilisateur :**

- Voir le carrousel d'images (recto/verso) avec zoom pinch-to-zoom
- Voir le prix affiché, l'état, la note de grade (si gradée), l'extension
- Voir le bloc vendeur (avatar, username, note moyenne, nombre d'avis)
- Voir un historique de prix (graphique basé sur les annonces de la même carte)
- **Acheteur** : Cliquer "Acheter" (→ checkout) ou "Contacter le vendeur" (→ crée/ouvre conversation)
- **Acheteur** : Ajouter/retirer des favoris
- **Vendeur (propriétaire)** : Modifier le prix, supprimer l'annonce
- Voir les bannières contextuelles : "Vendue", "Réservée", "En cours d'achat"

**Query params / toasts :**

- `?error=...` → toast d'erreur
- `?checkout=cancelled` → toast "Paiement annulé"
- `?saved=1` → toast "Annonce sauvegardée"

### 3.4 `/favorites` — Hub favoris

**Trois onglets :**

**Onglet "Annonces favorites" :**

- Liste des annonces mises en favori
- Retirer un favori (swipe-to-delete ou bouton)
- Cliquer pour accéder au détail
- Empty state : "Vous n'avez pas encore d'annonces favorites"

**Onglet "Recherches sauvegardées" :**

- Liste des recherches avec nom et compteur de nouveaux résultats
- Relancer une recherche
- Supprimer une recherche
- Listener realtime pour mise à jour des compteurs
- Empty state : "Aucune recherche sauvegardée"

**Onglet "Vendeurs favoris" :**

- Liste des vendeurs suivis
- Se désabonner
- Cliquer pour accéder au profil public
- Empty state : "Aucun vendeur favori"

### 3.5 `/sell` — Création d'annonce

**Actions utilisateur :**

- Prendre/uploader des photos (recto obligatoire, verso obligatoire)
- Lancer une reconnaissance OCR de la carte (via OpenAI Vision) :
  - L'OCR extrait le nom, HP, numéros, langue, rareté, etc.
  - Le système propose des candidats issus du catalogue TCGdex
  - L'utilisateur sélectionne le bon candidat (ou aucun)
- Remplir le titre (3–140 caractères)
- Saisir le prix affiché — le système calcule en interne le `price_seller` net
- Sélectionner l'état de la carte (MINT → POOR)
- Cocher "Carte gradée" → sélectionner l'organisme + note (1–10)
- Choisir la catégorie de poids d'envoi (XS, S, M, L, XL)
- Publier l'annonce (statut ACTIVE immédiat)

**Validation :**

- Photos recto et verso requises
- Titre 3–140 caractères
- Prix > 0
- Si gradée : organisme + note obligatoires
- Si non gradée : état obligatoire

### 3.6 `/messages` — Inbox

**Actions utilisateur :**

- Voir la liste de toutes ses conversations
- Pour chaque conversation : photo de la carte, nom interlocuteur, aperçu du dernier message, compteur de non-lus
- Messages système traduits en aperçu
- Cliquer pour ouvrir un thread
- Realtime : la liste se rafraîchit automatiquement

**Empty state :** "Aucun message pour le moment."

### 3.7 `/messages/[conversationId]` — Thread de conversation

**Page la plus riche de l'application.**

**Messagerie :**

- Envoyer des messages texte (max 2000 caractères)
- Envoyer des images (JPEG, PNG, WebP) → bucket `message_attachments`
- Messages entrants en temps réel (Supabase Realtime)
- Lecture automatique (IntersectionObserver, marquage par batch)
- Charger les messages plus anciens (pagination 50/page)
- Reconnexion automatique avec rattrapage des messages manqués

**Messages système :**

- `offer_accepted` — Offre acceptée
- `offer_cancelled_by_buyer` — Offre annulée
- `payment_completed` — Paiement complété
- `order_shipped` — Commande expédiée
- `sale_completed` — Vente terminée

**Commerce dans le thread :**

- **Barre d'offre (acheteur)** : Proposer une offre (min 60% du prix affiché)
- **Barre d'offre (vendeur)** : Accepter/Rejeter une offre inline
- **Bouton "Acheter" (acheteur)** : Checkout depuis le thread
- **Bouton "Expédier" (vendeur)** : Modal d'expédition (saisie tracking)
- **Bouton "Confirmer réception" (acheteur)** : Note (1–5 étoiles) + complétion
- **Carte de suivi** : Numéro de suivi + lien tracking

**Header :** Nom interlocuteur, miniature carte, bouton retour.

### 3.8 `/offers` — Dashboard des offres

**Colonne "Offres reçues" (vendeur) :**

- Voir toutes les offres reçues
- Accepter (→ listing RESERVED, autres offres rejetées)
- Rejeter

**Colonne "Offres envoyées" (acheteur) :**

- Voir ses offres envoyées
- Annuler une offre PENDING ou ACCEPTED
- "Payer cette offre" pour une offre acceptée (→ checkout)

**Empty states :** par colonne si aucune offre.

### 3.9 `/checkout/[listingId]` — Tunnel de paiement

**Actions utilisateur :**

- Voir le récapitulatif : carte, prix affiché, frais de protection, frais de livraison, total
- Sélectionner le pays de livraison (FR, BE, ES, CH, LU, DE, IT)
- Adresse pré-remplie depuis localStorage
- Compte à rebours de 30 minutes (durée du verrouillage)
- Confirmer et payer (→ Stripe Checkout)
- Le listing est verrouillé (LOCKED) pendant le checkout

**Calculs :**

- Prix carte = `display_price`
- Frais de protection = `display_price - price_seller` (5% + 0.70€)
- Livraison = `shipping_matrix` (origine × destination × poids)
- Total = `display_price + shipping`

### 3.10 `/orders/[id]/success` — Confirmation de commande

- Voir le statut (en attente / payé)
- Poll automatique si encore pending
- Récapitulatif de la commande
- Liens vers la conversation et l'historique

### 3.11 `/auth` — Connexion / Inscription

- Formulaire email + mot de passe (login ou register)
- Lien "Mot de passe oublié"
- Messages : `?error=...`, `?confirmed=true`

### 3.12 `/auth/forgot-password` et `/auth/reset-password`

- Saisir l'email → envoi du lien
- Saisir le nouveau mot de passe

### 3.13 `/profile` — Hub du compte

- Liens vers : Mon profil, Mes annonces, Mes transactions, Mon portefeuille, Moyens de paiement, Notifications
- Basculer thème clair/sombre
- Se déconnecter
- Suppression de compte (placeholder)

### 3.14 `/profile/profile` — Édition du profil

- Modifier avatar, username, bio, liens réseaux sociaux, pays
- Badge KYC affiché

### 3.15 `/profile/listings` — Mes annonces

- Liste des 50 dernières annonces
- Empty state : "Aucune annonce publiée."

### 3.16 `/profile/transactions` — Historique

- Onglet Achats et Onglet Ventes
- Empty states par onglet

### 3.17 `/profile/sales/[id]` — Détail d'une vente

- Récapitulatif, bouton "Expédier" si PAID, suivi après expédition

### 3.18 `/profile/wallet` — Portefeuille (résumé)

- Solde disponible et en attente
- Liste des mouvements
- Lien "Transférer" vers `/wallet`

### 3.19 `/wallet` — Portefeuille & Virements

- Soldes, bouton "Demander un virement", bouton "Compléter KYC"

### 3.20–3.22 Paiements & Notifications

- `/profile/payments` : liste des cartes, ajout via `/profile/payments/new`
- `/profile/notifications` : toggle push, souscription VAPID

### 3.23 `/u/[username]` — Profil public vendeur

- Avatar, username, bio, liens réseaux, annonces actives, avis reçus
- Suivre/ne plus suivre

### 3.24 `/price-checking` — Référentiel de prix

- Recherche sur les estimations de prix
- Liste avec prix estimé, set, source

### 3.25 `/offline` — Page hors-ligne

- Message d'absence de connexion, bouton "Recharger"

---

## 4. Modèle de Données & State Management

### 4.1 Schéma des entités

#### profiles

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL CHECK (char_length(username) BETWEEN 3 AND 30),
  avatar_url TEXT,
  country_code CHAR(2) DEFAULT 'FR',
  bio TEXT,
  instagram_url TEXT,
  facebook_url TEXT,
  tiktok_url TEXT,
  stripe_account_id TEXT,
  stripe_customer_id TEXT,
  kyc_status TEXT DEFAULT 'UNVERIFIED'
    CHECK (kyc_status IN ('UNVERIFIED','PENDING','REQUIRED','VERIFIED','REJECTED')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### wallets

```sql
CREATE TABLE wallets (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  available_balance NUMERIC(10,2) DEFAULT 0 CHECK (available_balance >= 0),
  pending_balance NUMERIC(10,2) DEFAULT 0 CHECK (pending_balance >= 0),
  currency CHAR(3) DEFAULT 'EUR'
);
```

#### listings

```sql
CREATE TABLE listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES profiles(id),
  card_ref_id TEXT,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 140),
  price_seller NUMERIC(10,2) NOT NULL CHECK (price_seller > 0),
  display_price NUMERIC(10,2) GENERATED ALWAYS AS (
    round(price_seller * 1.05 + 0.70, 2)
  ) STORED,
  condition TEXT CHECK (condition IN (
    'MINT','NEAR_MINT','EXCELLENT','GOOD','LIGHT_PLAYED','PLAYED','POOR'
  )),
  is_graded BOOLEAN DEFAULT FALSE,
  grading_company TEXT CHECK (grading_company IN (
    'PSA','PCA','BGS','CGC','SGC','ACE','OTHER'
  )),
  grade_note NUMERIC(3,1) CHECK (grade_note BETWEEN 1 AND 10),
  status TEXT DEFAULT 'ACTIVE' CHECK (status IN (
    'DRAFT','ACTIVE','LOCKED','RESERVED','SOLD'
  )),
  delivery_weight_class TEXT DEFAULT 'S' CHECK (delivery_weight_class IN (
    'XS','S','M','L','XL'
  )),
  cover_image_url TEXT,
  back_image_url TEXT,
  reserved_for UUID REFERENCES profiles(id),
  reserved_price NUMERIC(10,2),
  card_series TEXT,
  card_block TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### transactions

```sql
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id),
  buyer_id UUID NOT NULL REFERENCES profiles(id),
  seller_id UUID NOT NULL REFERENCES profiles(id),
  total_amount NUMERIC(10,2) NOT NULL,
  fee_amount NUMERIC(10,2) NOT NULL,
  shipping_cost NUMERIC(10,2) DEFAULT 0,
  status TEXT DEFAULT 'PENDING_PAYMENT' CHECK (status IN (
    'PENDING_PAYMENT','PAID','CANCELLED','EXPIRED','REFUNDED',
    'SHIPPED','COMPLETED','DISPUTED'
  )),
  stripe_checkout_session_id TEXT,
  expiration_date TIMESTAMPTZ DEFAULT now() + INTERVAL '30 minutes',
  listing_title TEXT,
  tracking_number TEXT,
  tracking_url TEXT,
  shipped_at TIMESTAMPTZ,
  shipping_address_line TEXT,
  shipping_address_city TEXT,
  shipping_address_postcode TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### offers

```sql
CREATE TABLE offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id),
  buyer_id UUID NOT NULL REFERENCES profiles(id),
  offer_amount NUMERIC(10,2) NOT NULL CHECK (offer_amount > 0),
  status TEXT DEFAULT 'PENDING' CHECK (status IN (
    'PENDING','ACCEPTED','REJECTED','EXPIRED','CANCELLED'
  )),
  expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '24 hours',
  conversation_id UUID REFERENCES conversations(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### conversations

```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id),
  buyer_id UUID NOT NULL REFERENCES profiles(id),
  seller_id UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT buyer_not_seller CHECK (buyer_id != seller_id),
  CONSTRAINT unique_conversation UNIQUE (listing_id, buyer_id, seller_id)
);
```

#### messages

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id),
  sender_id UUID NOT NULL REFERENCES profiles(id),
  content TEXT CHECK (char_length(content) BETWEEN 1 AND 2000),
  message_type TEXT DEFAULT 'text' CHECK (message_type IN (
    'text','offer','system','image'
  )),
  offer_id UUID REFERENCES offers(id),
  metadata JSONB,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### reviews

```sql
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID UNIQUE NOT NULL REFERENCES transactions(id),
  reviewer_id UUID NOT NULL REFERENCES profiles(id),
  reviewee_id UUID NOT NULL REFERENCES profiles(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### disputes

```sql
CREATE TABLE disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID UNIQUE NOT NULL REFERENCES transactions(id),
  opened_by UUID NOT NULL REFERENCES profiles(id),
  reason TEXT CHECK (reason IN (
    'DAMAGED_CARD','WRONG_CARD','EMPTY_PACKAGE','OTHER'
  )),
  description TEXT CHECK (char_length(description) >= 10),
  status TEXT DEFAULT 'OPEN' CHECK (status IN (
    'OPEN','IN_REVIEW','RESOLVED'
  )),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### Favoris & Recherches sauvegardées

```sql
CREATE TABLE favorite_listings (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  listing_id UUID REFERENCES listings(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);

CREATE TABLE favorite_sellers (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  seller_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, seller_id)
);

CREATE TABLE saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  search_params JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### Catalogue TCGdex (miroir)

```sql
CREATE TABLE tcgdex_series (
  language TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (language, id)
);

CREATE TABLE tcgdex_sets (
  language TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  series_id TEXT,
  logo TEXT,
  release_date DATE,
  PRIMARY KEY (language, id)
);

CREATE TABLE tcgdex_cards (
  language TEXT NOT NULL,
  id TEXT NOT NULL,
  card_key TEXT GENERATED ALWAYS AS (language || '-' || id) STORED,
  name TEXT,
  set_id TEXT,
  hp INTEGER,
  rarity TEXT,
  variants JSONB,
  PRIMARY KEY (language, id)
);
```

#### Tables utilitaires

```sql
CREATE TABLE shipping_matrix (
  id SERIAL PRIMARY KEY,
  origin_country CHAR(2) NOT NULL,
  dest_country CHAR(2) NOT NULL,
  weight_class TEXT NOT NULL,
  price NUMERIC(6,2) NOT NULL,
  currency CHAR(3) DEFAULT 'EUR'
);

CREATE TABLE price_estimations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_name TEXT NOT NULL,
  set_name TEXT,
  estimated_price NUMERIC(10,2),
  currency CHAR(3) DEFAULT 'EUR',
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE ocr_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  listing_id UUID REFERENCES listings(id),
  selected_card_ref_id TEXT,
  raw_text TEXT,
  parsed JSONB,
  candidates JSONB,
  confidence NUMERIC(5,4),
  provider TEXT DEFAULT 'openai',
  model TEXT DEFAULT 'gpt-4o',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE stripe_webhooks_processed (
  stripe_event_id TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ DEFAULT now()
);
```

### 4.2 Stockage des données

| Type                    | Mécanisme                                                       |
| ----------------------- | --------------------------------------------------------------- |
| Données métier          | Supabase PostgreSQL (via SDK JS)                                |
| Authentification        | Supabase Auth (email/password)                                  |
| Images annonces         | Supabase Storage — bucket `listing-images` (public)             |
| Pièces jointes messages | Supabase Storage — bucket `message_attachments` (privé)         |
| Paiements               | Stripe (Checkout Sessions, Customers, Connect)                  |
| Emails transactionnels  | Resend                                                          |
| OCR                     | OpenAI Vision API (gpt-4o / gpt-4.1-mini)                       |
| Préférences UI          | localStorage (`profile_theme_dark`, `profile_details_{userId}`) |
| Cache client            | React Query (@tanstack/react-query)                             |
| Cache SW                | Service Worker : cache statique minimal                         |

### 4.3 Temps réel (Supabase Realtime)

Utilisation **ciblée** pour maîtriser les coûts :

| Canal              | Table            | Filtre                            | Usage                                   |
| ------------------ | ---------------- | --------------------------------- | --------------------------------------- |
| Thread messages    | `messages`       | `conversation_id = X`             | Messages entrants dans un thread ouvert |
| Conversations list | `conversations`  | `buyer_id = me OR seller_id = me` | Mise à jour de l'inbox                  |
| Saved searches     | `saved_searches` | `user_id = me`                    | Compteur de nouveaux résultats          |

Aucun Realtime sur les listings (trop volumineux) — React Query polling avec `staleTime` intelligent.

### 4.4 Row Level Security (RLS)

Toutes les tables ont le RLS activé. Optimisation critique : **toujours wrapper `auth.uid()` dans un `(SELECT ...)`** pour éviter l'appel par ligne.

```sql
-- Pattern optimisé (auth.uid() appelé une seule fois)
CREATE POLICY "profiles_read" ON profiles
  FOR SELECT USING (true);  -- lecture publique pour auth

CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE USING ((SELECT auth.uid()) = id);

-- Listings : lecture publique pour ACTIVE
CREATE POLICY "listings_read_active" ON listings
  FOR SELECT USING (status = 'ACTIVE');

CREATE POLICY "listings_read_own" ON listings
  FOR SELECT USING ((SELECT auth.uid()) = seller_id);

-- Messages : accès participants uniquement
CREATE POLICY "messages_read" ON messages
  FOR SELECT USING (
    conversation_id IN (
      SELECT id FROM conversations
      WHERE buyer_id = (SELECT auth.uid())
         OR seller_id = (SELECT auth.uid())
    )
  );
```

**Résumé des politiques :**

- **Profils** : lecture publique (auth) ; écriture sur sa propre ligne
- **Annonces** : lecture publique pour ACTIVE ; lecture étendue pour vendeur, acheteur réservataire, participants
- **Transactions** : lecture par les participants ; update partiel par le vendeur (shipping)
- **Offres** : lecture acheteur/vendeur ; création acheteur uniquement
- **Messages/Conversations** : participants uniquement
- **Favoris/Recherches** : propriétaire uniquement
- **Catalogue TCGdex** : lecture publique
- **Reviews** : lecture auth ; écriture service_role
- **Disputes** : lecture participants ; écriture service_role
- **Storage** : `listing-images` lecture publique, écriture dossier=user_id ; `message_attachments` privé participants

---

## 5. Logique Métier & PWA

### 5.1 Calcul des prix

```
MARKETPLACE_PERCENT_FEE = 5% (0.05)
MARKETPLACE_FIXED_FEE   = 0.70€

display_price  = round(price_seller × 1.05 + 0.70, 2)
price_seller   = max(0.01, round((display_price - 0.70) / 1.05, 2))
fee_amount     = max(0, round(display_price - price_seller, 2))
total_buyer    = display_price + shipping_cost
seller_credit  = total_amount - fee_amount
```

### 5.2 Cycle de vie d'une annonce

```
DRAFT → ACTIVE → RESERVED (offre acceptée) → LOCKED (checkout) → SOLD
                    ↓                              ↓
                  ACTIVE ←──── (annulation) ──── ACTIVE (expiration paiement)
```

### 5.3 Cycle de vie d'une transaction

```
PENDING_PAYMENT → PAID → SHIPPED → COMPLETED
      ↓               ↓
  CANCELLED        DISPUTED
  EXPIRED          REFUNDED
```

### 5.4 Verrouillage au checkout

- L'annonce passe en `LOCKED` pendant 30 minutes
- Cron toutes les 10 min : `release_expired_locked_transactions`
- Cron horaire : `run_hourly_housekeeping` (nettoyage global + expiration offres PENDING)

### 5.5 Règles des offres

- Maximum 10 offres par acheteur par jour (trigger DB)
- Montant minimum : 70% du `display_price` (trigger DB) — UI utilise 60%
- Expiration par défaut : 24h
- Acceptation : listing → RESERVED, `reserved_for` = acheteur, `reserved_price` = montant ; autres offres PENDING rejetées
- Annulation acheteur : listing revient ACTIVE, réservation effacée

### 5.6 Crédit vendeur

- Au paiement : montant net crédité en `pending_balance`
- À la confirmation réception : transfert `pending` → `available` ; transaction → COMPLETED ; review créée

### 5.7 Webhook Stripe

- Idempotence via `stripe_webhooks_processed` (clé = `stripe_event_id`)
- `checkout.session.completed` (paid) → PAID, listing SOLD, expire offres, crédite wallet, emails, message système
- `checkout.session.expired` / `async_payment_failed` → CANCELLED, listing déverrouillé

### 5.8 OCR & Matching de cartes

- OpenAI Vision extrait les informations de la carte
- Algorithme de scoring heuristique pour matcher avec TCGdex
- Seuils de confiance pour candidats "stricts"
- Sélection manuelle par le vendeur

### 5.9 Feed & Recherche

- RPC PostgreSQL `search_listings_feed` avec pagination keyset
- Support LIKE escape pour la recherche textuelle
- Exclusion des propres annonces du vendeur connecté
- Filtres combinables : texte, set, rareté, état, gradée, note, prix, tri
- Page size max : 50

### 5.10 PWA

**Installation :** Interception `beforeinstallprompt`, bouton flottant, appel `prompt()`.

**Service Worker (`sw.js`) :**

- Network-first pour les navigations (fallback cache → `/offline.html`)
- Cache-first pour les assets statiques (`/icons/*`, CSS/JS)
- Jamais de cache pour `/_next/*` (évite les chunks stale)
- Network-only pour les API/données
- Gestion SKIP_WAITING (UI "Mettre à jour l'app")

**Notifications Push :**

- Abonnement VAPID → `push_subscriptions`
- Envoi via `web-push` (Node)
- Déclencheurs : nouveau message texte, image envoyée, nouvelle offre

**Hors ligne :** `/offline.html` statique, page d'accueil pré-cachée.

---

## 6. UX/UI — Design System & Animations

### 6.1 Philosophie de Design

PokeMarket s'inspire des meilleures apps de marketplace mobile (StockX, Vinted, GOAT) avec une identité visuelle unique centrée sur l'univers Pokémon sans être enfantine. L'objectif est une application **premium, fluide, et addictive**.

**Principes UX fondamentaux :**

1. **Thumb-zone first** — Toutes les actions primaires sont accessibles dans la zone naturelle du pouce (bas de l'écran)
2. **Progressive disclosure** — Ne montrer que l'essentiel, révéler les détails au besoin
3. **Feedback instantané** — Chaque action a un retour visuel immédiat (< 100ms)
4. **Skeleton-first loading** — Jamais d'écran blanc ; toujours un squelette morphologique
5. **Forgiveness** — Undo sur les actions destructives, confirmations sur les actions irréversibles

### 6.2 Stack Design System

| Outil               | Rôle                                                   |
| ------------------- | ------------------------------------------------------ |
| **Tailwind CSS v4** | Utility-first CSS, tokens custom, responsive           |
| **Shadcn/UI**       | Composants accessibles (Radix primitives) customisés   |
| **Framer Motion**   | Animations déclaratives, layout animations, gestures   |
| **Lucide Icons**    | Iconographie cohérente, tree-shakable                  |
| **next/font**       | Chargement optimisé des polices (Inter + display font) |

### 6.3 Tokens de Design

```css
/* Palette — Mode clair */
--color-bg-primary: #ffffff;
--color-bg-secondary: #f8f9fa;
--color-bg-tertiary: #f1f3f5;
--color-text-primary: #1a1a2e;
--color-text-secondary: #6b7280;
--color-text-muted: #9ca3af;
--color-brand-primary: #e63946; /* Rouge Pokéball */
--color-brand-secondary: #1d3557; /* Bleu profond */
--color-brand-accent: #f4a261; /* Or/Ambre */
--color-success: #10b981;
--color-warning: #f59e0b;
--color-error: #ef4444;

/* Palette — Mode sombre */
--color-bg-primary: #0f0f1a;
--color-bg-secondary: #1a1a2e;
--color-bg-tertiary: #2a2a3e;
--color-text-primary: #f1f3f5;
--color-text-secondary: #9ca3af;
--color-brand-primary: #ff4d5a;

/* Espacement (échelle 4px) */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;
--space-16: 64px;

/* Rayons */
--radius-sm: 8px;
--radius-md: 12px;
--radius-lg: 16px;
--radius-xl: 24px;
--radius-full: 9999px;

/* Ombres */
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
--shadow-md:
  0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
--shadow-lg:
  0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.04);
--shadow-card: 0 2px 8px rgba(0, 0, 0, 0.08);

/* Typographie */
--font-display: "Plus Jakarta Sans", sans-serif;
--font-body: "Inter", sans-serif;
--font-mono: "JetBrains Mono", monospace;
```

### 6.4 Composants Clés et Micro-interactions

#### Card Listing (Carte d'annonce dans le feed)

```
┌─────────────────────────┐
│  ┌───────────────────┐  │
│  │                   │  │  ← Image avec blur-up placeholder
│  │   [Image carte]   │  │    ratio 4:5, lazy loaded
│  │                   │  │    Tap → scale(0.97) → release → navigate
│  │              ❤️   │  │  ← Bouton favori (coin bas-droit)
│  └───────────────────┘  │    Animation: heart pulse + confetti particles
│  Pikachu VMAX           │  ← Titre (1 ligne, ellipsis)
│  Évolutions Éthérées    │  ← Nom du set (text-secondary)
│  ★★★★★ MINT             │  ← Condition avec badge couleur
│  24,50 €                │  ← Prix (font-display, bold, brand-primary)
└─────────────────────────┘
```

**Animations :**

- `whileTap={{ scale: 0.97 }}` sur la card entière
- Image : fade-in 300ms depuis blur placeholder (CSS `image-rendering`)
- Favori : `spring` animation (scale 0→1.3→1) + micro-confetti (3-5 particules)
- Entrée dans le viewport : `staggerChildren` fade-up avec 50ms de délai entre chaque carte

#### Skeleton Loader

Chaque composant a son skeleton morphologique exact :

- Cards : rectangles gris animés (shimmer gradient 45° qui se déplace)
- Texte : lignes de hauteur correcte avec coins arrondis
- Avatar : cercle
- Animation : `background-position` infini, 1.5s ease-in-out

```tsx
// Pattern : skeleton qui épouse exactement la forme du contenu réel
<motion.div
  className="animate-shimmer from-muted via-muted/50 to-muted bg-gradient-to-r"
  style={{ backgroundSize: "200% 100%" }}
/>
```

#### Pull-to-Refresh

- Geste : tirage vers le bas > 60px déclenche le refresh
- Indicateur : spinner circulaire qui se remplit proportionnellement au tirage
- Retour haptique simulé : micro-vibration (Vibration API) au seuil de déclenchement
- Animation de release : `spring({ damping: 20, stiffness: 300 })`

#### Transitions de Page

Utilisation de `AnimatePresence` + layout animations de Framer Motion :

- Listing → Detail : shared layout animation sur l'image de la carte (morphing fluide)
- Changement d'onglet (favorites) : slide horizontal avec `direction` dynamique
- Overlay (modals, bottom sheets) : slide-up avec backdrop blur progressif
- Navigation retour : slide inverse avec velocity-based duration

#### Bottom Sheet

Composant réutilisable pour toutes les actions contextuelles mobile :

- Drag handle en haut
- Snap points : 50%, 85%, fermé
- Gesture-driven : fling vers le bas pour fermer
- Backdrop : blur(8px) + opacity 0.4
- Spring animation : `damping: 30, stiffness: 400`

#### Toast Notifications

- Position : bas de l'écran (au-dessus de la tab bar)
- Animation : slide-up + fade-in, auto-dismiss 4s
- Types : success (vert), error (rouge), info (bleu), warning (ambre)
- Swipe-to-dismiss horizontal
- Stack : max 3 toasts visibles, les anciens collapsent

### 6.5 États UX

#### Loading States

- **Initial load** : Full-page skeleton (morphologique)
- **Infinite scroll** : Spinner en bas du feed + 2 skeleton cards
- **Action en cours** : Bouton avec spinner inline + texte "En cours..."
- **Image upload** : Progress bar circulaire avec pourcentage

#### Empty States

Chaque empty state a une illustration dédiée (SVG léger) + texte empathique + CTA :

- Feed vide : illustration Pokéball vide → "Le marché se remplit bientôt !"
- Favoris vides : illustration cœur → "Explorez le marché pour trouver vos pépites"
- Messages vides : illustration bulle → "Vos futures conversations apparaîtront ici"
- Recherche sans résultat : illustration loupe → "Aucun résultat. Essayez d'autres filtres."

#### Error States

- **Erreur réseau** : Banner fixe en haut avec icône wifi barré + bouton "Réessayer"
- **Erreur serveur** : Illustration empathique + message clair + bouton retry
- **Erreur de validation** : Inline sous chaque champ, avec shake animation sur le champ

### 6.6 Responsive Breakpoints

| Breakpoint | Nom       | Layout                                       |
| ---------- | --------- | -------------------------------------------- |
| 0–639px    | `mobile`  | 2 colonnes feed, tab bar bas, bottom sheets  |
| 640–1023px | `tablet`  | 3 colonnes feed, tab bar bas, modals         |
| 1024px+    | `desktop` | 4 colonnes feed, header navigation, sidebars |

### 6.7 Mode Clair/Sombre

- Toggle dans `/profile`, persisté en `localStorage`
- Transition fluide : `transition: background-color 300ms ease, color 200ms ease`
- Respect de `prefers-color-scheme` au premier chargement
- Tailwind `darkMode: 'class'` avec classe `.dark` sur `<html>`
- Les images de cartes ne sont pas inversées (préservation des couleurs)

### 6.8 Accessibilité (A11y)

- Tous les composants Shadcn/UI sont basés sur Radix (ARIA-compliant)
- Focus visible avec outline personnalisé (2px offset, brand-primary)
- Contraste minimum WCAG AA (4.5:1 pour le texte, 3:1 pour les éléments graphiques)
- Labels sur tous les inputs, `aria-live` sur les régions dynamiques
- Réduction des animations si `prefers-reduced-motion: reduce`

---

## 7. Architecture Technique — Scalabilité 100K MAU

### 7.1 Stack Technique

| Couche          | Technologie         | Version | Justification                               |
| --------------- | ------------------- | ------- | ------------------------------------------- |
| **Framework**   | Next.js             | 16      | App Router, RSC, streaming, middleware      |
| **Runtime**     | React               | 19      | Server Components, `use()`, `useOptimistic` |
| **Langage**     | TypeScript          | 5.7+    | Type safety end-to-end                      |
| **Styling**     | Tailwind CSS        | v4      | Utility-first, CSS-in-build                 |
| **Composants**  | Shadcn/UI           | latest  | Radix primitives, customisable              |
| **Animations**  | Framer Motion       | 12+     | Déclaratif, layout animations, gestures     |
| **State/Cache** | TanStack Query      | v5      | Cache client, dedup, optimistic updates     |
| **Backend**     | Supabase            | latest  | Auth, DB, Realtime, Storage, Edge Fns       |
| **Paiement**    | Stripe              | latest  | Checkout, Connect, Elements                 |
| **Email**       | Resend              | latest  | Emails transactionnels                      |
| **OCR**         | OpenAI API          | gpt-4o  | Vision pour reconnaissance de cartes        |
| **Catalogue**   | TCGdex API          | v2      | Données des cartes Pokémon                  |
| **Linting**     | ESLint + Prettier   | latest  | Code quality                                |
| **Tests**       | Vitest + Playwright | latest  | Unit + E2E                                  |
| **Déploiement** | Vercel              | -       | Edge Network, auto-scaling                  |

### 7.2 Architecture Next.js — Server vs Client Components

**Règle d'or : Server Component par défaut, Client Component uniquement pour l'interactivité.**

```
app/
├── layout.tsx                    # Server — HTML shell, fonts, metadata
├── (public)/
│   ├── page.tsx                  # Server — Feed SSR initial
│   ├── listing/[id]/page.tsx     # Server — Detail SSR (SEO)
│   └── search/page.tsx           # Server — Search shell
├── (auth)/
│   └── auth/page.tsx             # Client — Formulaire interactif
├── (protected)/
│   ├── favorites/page.tsx        # Server — Shell + data prefetch
│   ├── sell/page.tsx             # Client — Formulaire complet
│   ├── messages/page.tsx         # Client — Realtime
│   ├── messages/[id]/page.tsx    # Client — Realtime + gestures
│   ├── checkout/[id]/page.tsx    # Client — Stripe + timer
│   ├── offers/page.tsx           # Client — Interactive
│   └── profile/
│       ├── page.tsx              # Server — Hub statique
│       └── profile/page.tsx      # Client — Formulaire édition
└── api/
    ├── webhooks/stripe/route.ts  # Server — Webhook handler
    ├── ocr/route.ts              # Server — OpenAI Vision
    ├── checkout/route.ts         # Server — Create Stripe session
    └── push/send/route.ts        # Server — Send push notifications
```

**Stratégie de rendu par page :**

| Page            | Rendu                       | Justification                     |
| --------------- | --------------------------- | --------------------------------- |
| `/` (Feed)      | SSR + Client hydration      | SEO + infinite scroll client      |
| `/listing/[id]` | SSR avec `generateMetadata` | SEO critique, Open Graph          |
| `/u/[username]` | SSR                         | SEO profil vendeur                |
| `/search`       | Client                      | Interactivité pure (filtres)      |
| `/sell`         | Client                      | Formulaire complexe, OCR, uploads |
| `/messages/*`   | Client                      | Realtime obligatoire              |
| `/checkout/*`   | Client                      | Stripe Elements, timer            |
| `/profile/*`    | Hybride                     | Shell server, formulaires client  |

### 7.3 Gestion d'état — TanStack Query (React Query v5)

**Architecture du cache client :**

```typescript
// Query keys factory — typage fort
export const queryKeys = {
  listings: {
    all: ["listings"] as const,
    feed: (filters: FeedFilters) => ["listings", "feed", filters] as const,
    detail: (id: string) => ["listings", "detail", id] as const,
    mine: () => ["listings", "mine"] as const,
  },
  conversations: {
    all: ["conversations"] as const,
    list: () => ["conversations", "list"] as const,
    detail: (id: string) => ["conversations", "detail", id] as const,
    messages: (id: string) => ["conversations", "messages", id] as const,
  },
  offers: {
    received: () => ["offers", "received"] as const,
    sent: () => ["offers", "sent"] as const,
  },
  profile: {
    me: () => ["profile", "me"] as const,
    public: (username: string) => ["profile", "public", username] as const,
  },
  favorites: {
    listings: () => ["favorites", "listings"] as const,
    sellers: () => ["favorites", "sellers"] as const,
    searches: () => ["favorites", "searches"] as const,
  },
} as const;
```

**Politiques de cache :**

| Donnée             | `staleTime`      | `gcTime` | Raison                           |
| ------------------ | ---------------- | -------- | -------------------------------- |
| Feed listings      | 30s              | 5min     | Données fréquemment mises à jour |
| Listing detail     | 60s              | 10min    | Stabilité relative               |
| Conversations list | 0 (always stale) | 5min     | Realtime complète                |
| Messages thread    | 0                | 10min    | Realtime complète                |
| Profile (me)       | 5min             | 30min    | Rarement modifié                 |
| Profile (public)   | 2min             | 10min    | Semi-statique                    |
| Favorites          | 60s              | 10min    | Action locale + sync             |
| Catalogue TCGdex   | 24h              | 7j       | Quasi-statique                   |
| Shipping matrix    | 1h               | 24h      | Configuration stable             |

**Optimistic Updates :**

```typescript
// Pattern : mutation optimiste pour les favoris
const toggleFavorite = useMutation({
  mutationFn: (listingId: string) => api.toggleFavorite(listingId),
  onMutate: async (listingId) => {
    await queryClient.cancelQueries({
      queryKey: queryKeys.favorites.listings(),
    });
    const previous = queryClient.getQueryData(queryKeys.favorites.listings());
    // Toggle local immédiat
    queryClient.setQueryData(queryKeys.favorites.listings(), (old) =>
      old?.includes(listingId)
        ? old.filter((id) => id !== listingId)
        : [...(old ?? []), listingId],
    );
    return { previous };
  },
  onError: (err, listingId, context) => {
    queryClient.setQueryData(queryKeys.favorites.listings(), context?.previous);
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.favorites.listings() });
  },
});
```

Actions avec optimistic UI :

- Toggle favori (listing, vendeur)
- Envoi de message
- Marquage de lecture
- Accepter/rejeter une offre

### 7.4 Base de données — Optimisation PostgreSQL

#### Index SQL critiques

```sql
-- Feed marketplace : index composite pour la recherche paginée
CREATE INDEX idx_listings_active_created
  ON listings (created_at DESC, id)
  WHERE status = 'ACTIVE';

CREATE INDEX idx_listings_active_price_asc
  ON listings (display_price ASC, id)
  WHERE status = 'ACTIVE';

CREATE INDEX idx_listings_active_price_desc
  ON listings (display_price DESC, id)
  WHERE status = 'ACTIVE';

-- Recherche par vendeur
CREATE INDEX idx_listings_seller_status
  ON listings (seller_id, status);

-- Recherche textuelle (trigram pour le LIKE)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_listings_title_trgm
  ON listings USING gin (title gin_trgm_ops);

-- Conversations par participant
CREATE INDEX idx_conversations_buyer
  ON conversations (buyer_id);
CREATE INDEX idx_conversations_seller
  ON conversations (seller_id);

-- Messages par conversation (pagination keyset)
CREATE INDEX idx_messages_conversation_created
  ON messages (conversation_id, created_at DESC, id);

-- Messages non lus
CREATE INDEX idx_messages_unread
  ON messages (conversation_id, sender_id, read_at)
  WHERE read_at IS NULL;

-- Offres par listing
CREATE INDEX idx_offers_listing_status
  ON offers (listing_id, status);

-- Offres par acheteur (limite quotidienne)
CREATE INDEX idx_offers_buyer_daily
  ON offers (buyer_id, created_at);

-- Transactions par participant
CREATE INDEX idx_transactions_buyer
  ON transactions (buyer_id, created_at DESC);
CREATE INDEX idx_transactions_seller
  ON transactions (seller_id, created_at DESC);

-- Transactions expirant (pour le cron)
CREATE INDEX idx_transactions_pending_expiration
  ON transactions (expiration_date)
  WHERE status = 'PENDING_PAYMENT';

-- Favoris (déjà PK composites, pas d'index supplémentaire nécessaire)

-- Reviews par reviewee (pour calcul note moyenne)
CREATE INDEX idx_reviews_reviewee
  ON reviews (reviewee_id, rating);

-- RLS performance : index sur colonnes utilisées dans les policies
CREATE INDEX idx_listings_reserved_for
  ON listings (reserved_for)
  WHERE reserved_for IS NOT NULL;
```

#### RPC optimisée pour le feed

```sql
CREATE OR REPLACE FUNCTION search_listings_feed(
  p_query TEXT DEFAULT NULL,
  p_set TEXT DEFAULT NULL,
  p_rarity TEXT DEFAULT NULL,
  p_condition TEXT DEFAULT NULL,
  p_is_graded BOOLEAN DEFAULT NULL,
  p_grade_min NUMERIC DEFAULT NULL,
  p_grade_max NUMERIC DEFAULT NULL,
  p_price_min NUMERIC DEFAULT NULL,
  p_price_max NUMERIC DEFAULT NULL,
  p_sort TEXT DEFAULT 'date_desc',
  p_cursor_created_at TIMESTAMPTZ DEFAULT NULL,
  p_cursor_id UUID DEFAULT NULL,
  p_cursor_price NUMERIC DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  p_exclude_seller UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  seller_id UUID,
  title TEXT,
  display_price NUMERIC,
  condition TEXT,
  is_graded BOOLEAN,
  grade_note NUMERIC,
  cover_image_url TEXT,
  card_series TEXT,
  created_at TIMESTAMPTZ,
  seller_username TEXT,
  seller_avatar_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.id, l.seller_id, l.title, l.display_price,
    l.condition, l.is_graded, l.grade_note,
    l.cover_image_url, l.card_series, l.created_at,
    p.username AS seller_username,
    p.avatar_url AS seller_avatar_url
  FROM public.listings l
  JOIN public.profiles p ON p.id = l.seller_id
  WHERE l.status = 'ACTIVE'
    AND (p_exclude_seller IS NULL OR l.seller_id != p_exclude_seller)
    AND (p_query IS NULL OR l.title ILIKE '%' || p_query || '%')
    AND (p_set IS NULL OR l.card_series = p_set)
    AND (p_rarity IS NULL OR EXISTS (
      SELECT 1 FROM public.tcgdex_cards tc
      WHERE tc.id = l.card_ref_id AND tc.rarity = p_rarity
    ))
    AND (p_condition IS NULL OR l.condition = p_condition)
    AND (p_is_graded IS NULL OR l.is_graded = p_is_graded)
    AND (p_grade_min IS NULL OR l.grade_note >= p_grade_min)
    AND (p_grade_max IS NULL OR l.grade_note <= p_grade_max)
    AND (p_price_min IS NULL OR l.display_price >= p_price_min)
    AND (p_price_max IS NULL OR l.display_price <= p_price_max)
    AND (
      CASE p_sort
        WHEN 'date_desc' THEN
          p_cursor_created_at IS NULL
          OR (l.created_at, l.id) < (p_cursor_created_at, p_cursor_id)
        WHEN 'price_asc' THEN
          p_cursor_price IS NULL
          OR (l.display_price, l.id) > (p_cursor_price, p_cursor_id)
        WHEN 'price_desc' THEN
          p_cursor_price IS NULL
          OR (l.display_price, l.id) < (p_cursor_price, p_cursor_id)
        ELSE TRUE
      END
    )
  ORDER BY
    CASE WHEN p_sort = 'date_desc' THEN l.created_at END DESC,
    CASE WHEN p_sort = 'price_asc' THEN l.display_price END ASC,
    CASE WHEN p_sort = 'price_desc' THEN l.display_price END DESC,
    l.id
  LIMIT LEAST(p_limit, 50);
END;
$$;
```

#### Connection Pooling

- Utiliser **Supavisor** (pooler intégré Supabase) en mode **Transaction**
- Configurer le SDK Supabase avec l'URL du pooler (`pool.supabase.com:6543`)
- Pool size recommandé : `(CPU cores × 2) + 1` = ~10 connexions pour l'instance Supabase
- Les Server Components Next.js et les Route Handlers utilisent le pooler
- Les clients Realtime utilisent la connexion directe (websocket, pas de pooling)

### 7.5 Optimisation des Images

**Pipeline d'optimisation :**

```
Upload utilisateur (JPEG/PNG)
  ↓
Client-side resize (max 1200px largeur, canvas API)
  ↓
Conversion WebP côté client (si supporté)
  ↓
Upload Supabase Storage (bucket listing-images)
  ↓
Serveur transformations Supabase (resize on-the-fly)
  ↓
CDN Supabase (cache edge, headers cache-control: max-age=31536000)
```

**Stratégies de chargement :**

| Contexte            | Taille image | Qualité  | Technique                  |
| ------------------- | ------------ | -------- | -------------------------- |
| Feed (grid card)    | 300×375px    | 75% WebP | Lazy load + blur-up LQIP   |
| Listing detail      | 600×750px    | 85% WebP | Priority load (above fold) |
| Listing detail zoom | 1200×1500px  | 90% WebP | Load on pinch/tap          |
| Message attachment  | 400×400px    | 80% WebP | Lazy load                  |
| Avatar (petit)      | 48×48px      | 80% WebP | Eager load                 |
| Avatar (profil)     | 200×200px    | 85% WebP | Priority load              |

**Blur-up LQIP (Low Quality Image Placeholder) :**

- Générer un placeholder de 20×25px (base64) au moment de l'upload
- Stocker le hash dans la colonne `cover_image_blur` (optionnel) ou générer via `next/image` blur
- L'image floue est affichée instantanément, l'image réelle fade-in en 300ms

**Utilisation de `next/image` :**

```tsx
<Image
  src={supabaseImageUrl}
  alt={listing.title}
  width={300}
  height={375}
  quality={75}
  placeholder="blur"
  blurDataURL={listing.cover_image_blur}
  sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 25vw"
  className="rounded-lg object-cover"
/>
```

### 7.6 Performance Budget

| Métrique                  | Budget       | Stratégie                                |
| ------------------------- | ------------ | ---------------------------------------- |
| First Contentful Paint    | < 1.2s       | SSR + streaming + font preload           |
| Largest Contentful Paint  | < 2.5s       | Priority images + preconnect CDN         |
| Interaction to Next Paint | < 200ms      | RSC + code splitting + optimistic UI     |
| Cumulative Layout Shift   | < 0.1        | Aspect ratios fixes, skeleton dimensions |
| Total JS bundle (initial) | < 150KB gzip | Tree shaking, dynamic imports            |
| Time to Interactive       | < 3.5s       | Hydration sélective, lazy components     |

**Stratégies de performance :**

- `next/dynamic` pour les composants lourds (image zoom, chart, Stripe Elements)
- Route-level code splitting automatique (App Router)
- Preconnect aux domaines critiques : Supabase, Stripe, CDN
- Font subsetting (latin uniquement pour Plus Jakarta Sans + Inter)
- Service Worker pour cache statique (icons, manifest)

### 7.7 Architecture des API Routes

```
app/api/
├── webhooks/
│   └── stripe/route.ts          # POST — Stripe webhook handler
├── checkout/
│   └── route.ts                 # POST — Create Stripe Checkout session
├── ocr/
│   └── route.ts                 # POST — OpenAI Vision OCR
├── push/
│   └── send/route.ts            # POST — Send push notification
├── cron/
│   ├── release-expired/route.ts # POST — Release expired locked transactions
│   └── housekeeping/route.ts    # POST — Hourly housekeeping
└── stripe-connect/
    └── onboard/route.ts         # POST — Create Stripe Connect onboarding link
```

### 7.8 Sécurité

| Domaine       | Mesure                                                         |
| ------------- | -------------------------------------------------------------- |
| Auth          | Supabase Auth (bcrypt, JWT, refresh tokens)                    |
| RLS           | Activé sur toutes les tables, policies optimisées              |
| CSRF          | Tokens CSRF via middleware Next.js                             |
| XSS           | React escaping natif + CSP headers                             |
| Injection SQL | Parameterized queries via Supabase SDK                         |
| Rate limiting | Middleware Next.js (10 req/min sur les mutations sensibles)    |
| Webhook       | Signature verification Stripe (HMAC SHA-256)                   |
| Upload        | Validation MIME type + taille max (5MB images)                 |
| Secrets       | Variables d'environnement Vercel (jamais exposées côté client) |

### 7.9 Monitoring & Observabilité

| Outil                 | Usage                                     |
| --------------------- | ----------------------------------------- |
| Vercel Analytics      | Core Web Vitals, trafic                   |
| Vercel Speed Insights | Performance par page                      |
| Sentry                | Error tracking (frontend + API routes)    |
| Supabase Dashboard    | DB metrics, Realtime connections, Storage |
| Stripe Dashboard      | Paiements, Connect, webhooks              |

### 7.10 Structure du projet

```
pokemarket/
├── .github/
│   └── workflows/
│       ├── ci.yml                # Lint + Type check + Tests
│       └── deploy.yml            # Deploy preview + production
├── .cursor/
│   └── rules/                    # Cursor rules pour l'AI
├── public/
│   ├── icons/                    # PWA icons (192, 512)
│   ├── manifest.json             # PWA manifest
│   ├── sw.js                     # Service Worker
│   └── offline.html              # Fallback hors-ligne
├── src/
│   ├── app/
│   │   ├── layout.tsx            # Root layout (fonts, providers, metadata)
│   │   ├── not-found.tsx         # 404 page
│   │   ├── error.tsx             # Error boundary
│   │   ├── (public)/             # Routes publiques
│   │   │   ├── page.tsx          # Feed marketplace
│   │   │   ├── search/page.tsx
│   │   │   ├── listing/[id]/page.tsx
│   │   │   ├── price-checking/page.tsx
│   │   │   └── u/[username]/page.tsx
│   │   ├── (auth)/               # Routes auth
│   │   │   └── auth/
│   │   │       ├── page.tsx
│   │   │       ├── forgot-password/page.tsx
│   │   │       ├── reset-password/page.tsx
│   │   │       └── callback/route.ts
│   │   ├── (protected)/          # Routes protégées
│   │   │   ├── favorites/page.tsx
│   │   │   ├── sell/page.tsx
│   │   │   ├── messages/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [conversationId]/
│   │   │   │       ├── page.tsx
│   │   │   │       └── profile/page.tsx
│   │   │   ├── checkout/
│   │   │   │   └── [listingId]/page.tsx
│   │   │   ├── orders/[id]/success/page.tsx
│   │   │   ├── offers/page.tsx
│   │   │   ├── profile/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── profile/page.tsx
│   │   │   │   ├── listings/page.tsx
│   │   │   │   ├── transactions/page.tsx
│   │   │   │   ├── sales/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── [id]/page.tsx
│   │   │   │   ├── wallet/page.tsx
│   │   │   │   ├── payments/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── new/page.tsx
│   │   │   │   └── notifications/page.tsx
│   │   │   └── wallet/
│   │   │       ├── page.tsx
│   │   │       └── return/page.tsx
│   │   └── api/
│   │       ├── webhooks/stripe/route.ts
│   │       ├── checkout/route.ts
│   │       ├── ocr/route.ts
│   │       ├── push/send/route.ts
│   │       ├── cron/
│   │       │   ├── release-expired/route.ts
│   │       │   └── housekeeping/route.ts
│   │       └── stripe-connect/onboard/route.ts
│   ├── components/
│   │   ├── ui/                   # Shadcn/UI components
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── sheet.tsx         # Bottom sheet
│   │   │   ├── tabs.tsx
│   │   │   ├── toast.tsx
│   │   │   ├── skeleton.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── avatar.tsx
│   │   │   └── ...
│   │   ├── layout/
│   │   │   ├── tab-bar.tsx       # Navigation mobile
│   │   │   ├── header.tsx        # Navigation desktop
│   │   │   ├── auth-guard.tsx    # Protection des routes
│   │   │   └── providers.tsx     # QueryClient, Theme, etc.
│   │   ├── feed/
│   │   │   ├── listing-card.tsx
│   │   │   ├── listing-card-skeleton.tsx
│   │   │   ├── feed-grid.tsx
│   │   │   ├── feed-filters.tsx
│   │   │   └── pull-to-refresh.tsx
│   │   ├── listing/
│   │   │   ├── image-carousel.tsx
│   │   │   ├── seller-block.tsx
│   │   │   ├── price-chart.tsx
│   │   │   └── listing-actions.tsx
│   │   ├── messages/
│   │   │   ├── conversation-list.tsx
│   │   │   ├── message-bubble.tsx
│   │   │   ├── message-input.tsx
│   │   │   ├── offer-bar.tsx
│   │   │   ├── system-message.tsx
│   │   │   └── tracking-card.tsx
│   │   ├── sell/
│   │   │   ├── image-uploader.tsx
│   │   │   ├── ocr-results.tsx
│   │   │   └── sell-form.tsx
│   │   ├── checkout/
│   │   │   ├── order-summary.tsx
│   │   │   └── countdown-timer.tsx
│   │   ├── shared/
│   │   │   ├── empty-state.tsx
│   │   │   ├── error-banner.tsx
│   │   │   ├── favorite-button.tsx
│   │   │   ├── star-rating.tsx
│   │   │   ├── price-display.tsx
│   │   │   ├── condition-badge.tsx
│   │   │   └── page-transition.tsx
│   │   └── pwa/
│   │       ├── install-prompt.tsx
│   │       └── update-prompt.tsx
│   ├── hooks/
│   │   ├── use-auth.ts
│   │   ├── use-supabase.ts
│   │   ├── use-realtime.ts
│   │   ├── use-infinite-feed.ts
│   │   ├── use-optimistic-favorite.ts
│   │   ├── use-pull-to-refresh.ts
│   │   ├── use-intersection-observer.ts
│   │   ├── use-countdown.ts
│   │   └── use-media-query.ts
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts         # Browser client
│   │   │   ├── server.ts         # Server client (RSC)
│   │   │   ├── middleware.ts     # Middleware client
│   │   │   └── admin.ts          # Service role client
│   │   ├── stripe/
│   │   │   ├── client.ts
│   │   │   └── server.ts
│   │   ├── api/
│   │   │   ├── listings.ts       # Query functions
│   │   │   ├── conversations.ts
│   │   │   ├── offers.ts
│   │   │   ├── favorites.ts
│   │   │   ├── profile.ts
│   │   │   └── transactions.ts
│   │   ├── query-keys.ts         # TanStack Query key factory
│   │   ├── pricing.ts            # Calculs de prix
│   │   ├── validations.ts        # Zod schemas
│   │   ├── constants.ts          # Constantes métier
│   │   └── utils.ts              # Helpers
│   ├── types/
│   │   ├── database.ts           # Types générés par Supabase CLI
│   │   ├── api.ts                # Types API
│   │   └── index.ts              # Types partagés
│   └── styles/
│       └── globals.css           # Tailwind directives + CSS custom
├── supabase/
│   ├── config.toml               # Supabase local config
│   ├── migrations/               # SQL migrations ordonnées
│   │   ├── 00001_initial_schema.sql
│   │   ├── 00002_rls_policies.sql
│   │   ├── 00003_indexes.sql
│   │   ├── 00004_functions_triggers.sql
│   │   ├── 00005_rpc_feed.sql
│   │   ├── 00006_storage_buckets.sql
│   │   └── 00007_seed_shipping_matrix.sql
│   └── seed.sql                  # Données de test
├── tests/
│   ├── unit/                     # Vitest
│   └── e2e/                      # Playwright
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── .env.local.example
├── .eslintrc.json
├── .prettierrc
└── README.md
```

---

## 8. Plan d'Exécution

### Phase 1 — Configuration Initiale (Stack, Linting, Design System)

> **Objectif :** Socle technique prêt, chaque développeur peut commencer à coder.
> **Durée estimée :** 2-3 jours

#### 1.1 Initialisation du projet

- [ ] Créer le projet Next.js 16 (`npx create-next-app@latest --typescript --tailwind --app --src-dir`)
- [ ] Configurer `tsconfig.json` (strict mode, path aliases `@/`)
- [ ] Configurer `next.config.ts` (images domains Supabase, PWA headers)
- [ ] Initialiser Git + `.gitignore`

#### 1.2 Outillage qualité

- [ ] Configurer ESLint (next/core-web-vitals + rules custom)
- [ ] Configurer Prettier (semi, singleQuote, trailingComma)
- [ ] Configurer Husky + lint-staged (pre-commit hook)
- [ ] Ajouter les scripts npm (`lint`, `format`, `type-check`, `test`)

#### 1.3 Design System

- [ ] Installer et configurer Tailwind CSS v4
- [ ] Initialiser Shadcn/UI (`npx shadcn@latest init`)
- [ ] Définir les tokens de design (couleurs, espacement, typographie) dans `globals.css`
- [ ] Configurer les fonts (Plus Jakarta Sans + Inter via `next/font/google`)
- [ ] Implémenter le mode clair/sombre (ThemeProvider + localStorage + `prefers-color-scheme`)
- [ ] Installer Framer Motion
- [ ] Installer Lucide Icons
- [ ] Créer les composants Shadcn/UI de base : Button, Input, Card, Dialog, Sheet, Tabs, Toast, Skeleton, Badge, Avatar

#### 1.4 Architecture de base

- [ ] Créer la structure de dossiers (`components/`, `hooks/`, `lib/`, `types/`, `styles/`)
- [ ] Créer le Root Layout (`app/layout.tsx`) avec fonts, metadata, ThemeProvider
- [ ] Créer le fichier `providers.tsx` (QueryClientProvider, ThemeProvider)
- [ ] Configurer TanStack Query v5 (`QueryClient` avec defaults)
- [ ] Créer les fichiers `.env.local.example` avec toutes les variables requises
- [ ] Créer le fichier `lib/constants.ts` avec les constantes métier

#### 1.5 PWA Foundation

- [ ] Créer `public/manifest.json` (nom, icônes, theme_color, display: standalone)
- [ ] Créer les icônes PWA (192x192, 512x512) — placeholder
- [ ] Créer `public/offline.html` — page hors-ligne statique
- [ ] Créer `public/sw.js` — Service Worker de base (cache-first assets, network-first navigation)
- [ ] Enregistrer le Service Worker dans le Root Layout

---

### Phase 2 — Modélisation & Base de Données (Supabase)

> **Objectif :** Schéma complet, RLS, index, fonctions, triggers — tout est prêt pour recevoir des données.
> **Durée estimée :** 3-4 jours

#### 2.1 Setup Supabase

- [ ] Créer le projet Supabase (Dashboard ou CLI)
- [ ] Installer Supabase CLI + `supabase init`
- [ ] Configurer `config.toml` (auth, storage, realtime)
- [ ] Créer les fichiers clients Supabase (`lib/supabase/client.ts`, `server.ts`, `middleware.ts`, `admin.ts`)
- [ ] Générer les types TypeScript (`supabase gen types typescript`)

#### 2.2 Migration : Schéma initial

- [ ] `00001_initial_schema.sql` : Toutes les tables (profiles, wallets, listings, transactions, offers, conversations, messages, reviews, disputes, favoris, saved_searches, catalogue TCGdex, shipping_matrix, price_estimations, ocr_attempts, push_subscriptions, stripe_webhooks_processed)
- [ ] Activer les extensions nécessaires (`pg_trgm`, `uuid-ossp`)

#### 2.3 Migration : RLS Policies

- [ ] `00002_rls_policies.sql` : Activer RLS sur toutes les tables
- [ ] Écrire les policies optimisées (`(SELECT auth.uid())` pattern) pour chaque table
- [ ] Tester les policies avec des requêtes test

#### 2.4 Migration : Index

- [ ] `00003_indexes.sql` : Tous les index définis dans la section 7.4
- [ ] Index partiels pour les listings ACTIVE
- [ ] Index composite pour les recherches multi-colonnes
- [ ] Index trigram pour la recherche textuelle

#### 2.5 Migration : Fonctions & Triggers

- [ ] `00004_functions_triggers.sql` :
  - Trigger `handle_new_user` : crée automatiquement `profiles` + `wallets` à l'inscription
  - Trigger `check_offer_daily_limit` : max 10 offres/jour par acheteur
  - Trigger `check_offer_minimum` : montant min 70% du display_price
  - Trigger `update_updated_at` : mise à jour automatique du champ `updated_at`

#### 2.6 Migration : RPC Feed

- [ ] `00005_rpc_feed.sql` : Fonction `search_listings_feed` (pagination keyset, filtres combinables)

#### 2.7 Migration : Storage

- [ ] `00006_storage_buckets.sql` :
  - Bucket `listing-images` (public read, private write par user_id)
  - Bucket `message_attachments` (private, accès participants conversation)
  - Policies storage

#### 2.8 Migration : Seed data

- [ ] `00007_seed_shipping_matrix.sql` : Matrice de livraison (FR, BE, ES, CH, LU, DE, IT × poids)
- [ ] `seed.sql` : Données de test (profils, annonces, conversations)

#### 2.9 Types TypeScript

- [ ] Générer et vérifier les types Supabase
- [ ] Créer les types custom (`types/index.ts`, `types/api.ts`)
- [ ] Créer les schemas Zod de validation (`lib/validations.ts`)

---

### Phase 3 — Core Auth & Profil

> **Objectif :** Un utilisateur peut s'inscrire, se connecter, et gérer son profil.
> **Durée estimée :** 3-4 jours

#### 3.1 Auth Flow

- [ ] Créer le composant `AuthGuard` (protection des routes protégées)
- [ ] Créer le middleware Next.js (`middleware.ts`) pour le refresh des sessions
- [ ] Implémenter la page `/auth` (login / register, formulaire email+password)
- [ ] Implémenter `/auth/forgot-password` (envoi du lien)
- [ ] Implémenter `/auth/reset-password` (nouveau mot de passe)
- [ ] Implémenter `/auth/callback` (OAuth callback Supabase)
- [ ] Hook `useAuth` (session, user, signIn, signUp, signOut, loading)
- [ ] Redirection auto : `/auth` → `/profile` si connecté, routes protégées → `/auth?next=` si déconnecté

#### 3.2 Profil

- [ ] Implémenter `/profile` (Hub du compte avec liens + toggle thème + déconnexion)
- [ ] Implémenter `/profile/profile` (Édition : avatar, username, bio, réseaux, pays, badge KYC)
- [ ] Upload d'avatar vers Supabase Storage
- [ ] Hook `useProfile` avec React Query

#### 3.3 Profil Public

- [ ] Implémenter `/u/[username]` (avatar, bio, réseaux, annonces actives, avis, follow/unfollow)
- [ ] SSR pour le SEO du profil vendeur

#### 3.4 Navigation

- [ ] Créer le composant `TabBar` (mobile, 5 onglets, badge messages non-lus)
- [ ] Créer le composant `Header` (desktop)
- [ ] Logique de masquage de la tab bar sur certaines routes
- [ ] Animations de transition entre onglets

---

### Phase 4 — Marketplace Core (Feed, Recherche, Détail)

> **Objectif :** Le cœur de l'application — l'utilisateur peut parcourir, rechercher et consulter les annonces.
> **Durée estimée :** 5-6 jours

#### 4.1 Feed Marketplace

- [ ] Implémenter le composant `ListingCard` (image, titre, set, condition, prix)
- [ ] Implémenter le composant `ListingCardSkeleton`
- [ ] Implémenter `FeedGrid` (grille responsive 2/3/4 colonnes)
- [ ] Hook `useInfiniteFeed` (TanStack Query `useInfiniteQuery` + RPC `search_listings_feed`)
- [ ] Implémenter l'infinite scroll (IntersectionObserver sur le dernier élément)
- [ ] Implémenter la page `/` avec le feed
- [ ] Animations d'entrée des cartes (staggerChildren fade-up)

#### 4.2 Filtres & Recherche

- [ ] Implémenter `FeedFilters` (barre collapsible avec tous les filtres)
- [ ] Synchronisation filtres ↔ URL query params
- [ ] Implémenter `/search` (formulaire de recherche avancée)
- [ ] Bouton "Sauvegarder la recherche" (flottant, si filtres actifs + connecté)

#### 4.3 Pull-to-Refresh

- [ ] Implémenter le composant `PullToRefresh` (geste + spinner + haptic feedback)
- [ ] Intégration avec React Query `refetch`

#### 4.4 Favoris (Listings)

- [ ] Implémenter le `FavoriteButton` (cœur animé avec micro-confetti)
- [ ] Hook `useOptimisticFavorite` (optimistic UI toggle)
- [ ] API : `toggleFavoriteListing`, `getFavoriteListings`

#### 4.5 Détail d'annonce

- [ ] Implémenter `/listing/[id]` (SSR avec `generateMetadata` pour OG tags)
- [ ] Composant `ImageCarousel` (recto/verso, swipe, pinch-to-zoom)
- [ ] Composant `SellerBlock` (avatar, username, note, avis, lien profil)
- [ ] Composant `PriceChart` (historique de prix — lazy loaded)
- [ ] Boutons d'action : "Acheter", "Contacter le vendeur", "Modifier" (si vendeur)
- [ ] Bannières contextuelles (Vendue, Réservée, En cours d'achat)
- [ ] Gestion des toasts via query params

#### 4.6 Empty States & Error States

- [ ] Créer le composant `EmptyState` générique (illustration + texte + CTA)
- [ ] Créer les illustrations SVG pour chaque contexte
- [ ] Créer le composant `ErrorBanner`
- [ ] Intégrer les empty/error states dans le feed, les filtres, le détail

---

### Phase 5 — Création d'annonce (Upload, OCR)

> **Objectif :** Le vendeur peut publier une annonce avec reconnaissance intelligente de la carte.
> **Durée estimée :** 4-5 jours

#### 5.1 Upload d'images

- [ ] Composant `ImageUploader` (prise photo / sélection galerie, recto + verso)
- [ ] Resize client-side (max 1200px, canvas API)
- [ ] Conversion WebP côté client
- [ ] Upload vers Supabase Storage (`listing-images/{user_id}/{uuid}`)
- [ ] Preview avec suppression/remplacement
- [ ] Progress bar d'upload

#### 5.2 OCR OpenAI Vision

- [ ] API Route `POST /api/ocr` (envoi image → OpenAI Vision → parsing structuré)
- [ ] Algorithme de matching heuristique avec le catalogue TCGdex
- [ ] Composant `OcrResults` (affichage des candidats avec score de confiance)
- [ ] Sélection manuelle du candidat par le vendeur
- [ ] Stockage du résultat dans `ocr_attempts`

#### 5.3 Formulaire de vente

- [ ] Implémenter `/sell` (formulaire complet)
- [ ] Champs : titre, prix (avec calcul display_price en temps réel), condition, gradée (organisme + note), poids d'envoi
- [ ] Validation Zod côté client + feedback inline
- [ ] Mutation de création avec React Query
- [ ] Animation de succès + redirection vers le détail

#### 5.4 Gestion des annonces

- [ ] Implémenter `/profile/listings` (liste des annonces)
- [ ] Modification du prix et suppression depuis le détail

---

### Phase 6 — Messagerie & Temps Réel

> **Objectif :** Messagerie complète avec négociation intégrée et expérience native.
> **Durée estimée :** 6-7 jours

#### 6.1 Infrastructure Realtime

- [ ] Hook `useRealtime` (wrapper Supabase Realtime avec reconnexion auto)
- [ ] Gestion du rattrapage des messages manqués après déconnexion

#### 6.2 Inbox (Liste des conversations)

- [ ] Implémenter `/messages` (liste des conversations)
- [ ] Composant `ConversationList` (photo carte, nom, aperçu, badge non-lus)
- [ ] Traduction des messages système en aperçu
- [ ] Realtime : rafraîchissement auto de la liste
- [ ] Empty state

#### 6.3 Thread de conversation

- [ ] Implémenter `/messages/[conversationId]`
- [ ] Composant `MessageBubble` (texte, image, système)
- [ ] Composant `MessageInput` (texte + envoi image)
- [ ] Envoi de messages texte (optimistic UI)
- [ ] Envoi d'images (upload + message type image)
- [ ] Réception en temps réel (Supabase Realtime sur `messages`)
- [ ] Pagination des anciens messages (scroll vers le haut, 50/page)
- [ ] Marquage de lecture automatique (IntersectionObserver, batch)
- [ ] Header : nom interlocuteur, miniature carte, bouton retour
- [ ] Composant `SystemMessage` (rendu stylé des messages système)

#### 6.4 Négociation (Offres dans le thread)

- [ ] Composant `OfferBar` acheteur (proposer une offre, min 60% du prix)
- [ ] Composant `OfferBar` vendeur (accepter/rejeter inline)
- [ ] Mutation "Proposer une offre" → crée offre + message système
- [ ] Mutation "Accepter l'offre" → listing RESERVED + reject autres offres + message système
- [ ] Mutation "Rejeter l'offre" → message système
- [ ] Bouton "Acheter" dans le thread (prix normal ou réservé)

#### 6.5 Commerce post-achat dans le thread

- [ ] Bouton "Expédier" (vendeur, si PAID) → modal saisie tracking
- [ ] Composant `TrackingCard` (numéro + lien tracking)
- [ ] Bouton "Confirmer réception" (acheteur, si SHIPPED) → note + completion
- [ ] Messages système pour chaque étape

#### 6.6 Dashboard des offres

- [ ] Implémenter `/offers` (2 colonnes : reçues / envoyées)
- [ ] Actions : accepter, rejeter, annuler, payer
- [ ] Empty states par colonne

#### 6.7 Notifications Push

- [ ] Implémenter l'abonnement VAPID côté client
- [ ] API Route `/api/push/send` (envoi via `web-push`)
- [ ] Gestion des notifications dans le Service Worker (affichage + click → navigation)
- [ ] Déclencheurs : nouveau message, nouvelle offre
- [ ] Implémenter `/profile/notifications` (toggle on/off)

---

### Phase 7 — Paiement & Escrow (Stripe)

> **Objectif :** Circuit de paiement complet et sécurisé.
> **Durée estimée :** 5-6 jours

#### 7.1 Setup Stripe

- [ ] Configurer Stripe (clés API, webhook endpoint)
- [ ] Installer le SDK Stripe côté serveur
- [ ] Installer `@stripe/stripe-js` + `@stripe/react-stripe-js` côté client

#### 7.2 Tunnel de paiement

- [ ] API Route `POST /api/checkout` :
  - Verrouiller le listing (LOCKED)
  - Créer la transaction (PENDING_PAYMENT, expiration 30min)
  - Créer la Stripe Checkout Session
  - Retourner l'URL de redirection
- [ ] Implémenter `/checkout/[listingId]` :
  - Récapitulatif (carte, prix, frais protection, livraison, total)
  - Sélection pays de livraison (calcul shipping dynamique)
  - Adresse pré-remplie (localStorage)
  - Compte à rebours 30min
  - Bouton "Payer" → redirection Stripe
- [ ] Composant `CountdownTimer`

#### 7.3 Webhook Stripe

- [ ] API Route `POST /api/webhooks/stripe` :
  - Vérification de la signature HMAC
  - Idempotence via `stripe_webhooks_processed`
  - `checkout.session.completed` → PAID, listing SOLD, wallet credit, emails, message système
  - `checkout.session.expired` → CANCELLED, listing déverrouillé
  - `async_payment_failed` → CANCELLED

#### 7.4 Confirmation de commande

- [ ] Implémenter `/orders/[id]/success` (statut, poll, récapitulatif, liens)

#### 7.5 Cron Jobs

- [ ] API Route `POST /api/cron/release-expired` (toutes les 10min — Vercel Cron)
- [ ] API Route `POST /api/cron/housekeeping` (toutes les heures)
- [ ] Configurer `vercel.json` avec les cron schedules

#### 7.6 Stripe Connect (Scaffolding)

- [ ] API Route `POST /api/stripe-connect/onboard` (lien onboarding Connect)
- [ ] Implémenter `/wallet` (soldes, bouton virement, bouton KYC)
- [ ] Implémenter `/wallet/return` (retour onboarding)
- [ ] Implémenter `/profile/wallet` (résumé portefeuille)

#### 7.7 Moyens de paiement

- [ ] Implémenter `/profile/payments` (liste des cartes Stripe)
- [ ] Implémenter `/profile/payments/new` (Stripe Elements)

#### 7.8 Historique des transactions

- [ ] Implémenter `/profile/transactions` (achats + ventes)
- [ ] Implémenter `/profile/sales` et `/profile/sales/[id]` (détail vente, expédition)

#### 7.9 Emails transactionnels

- [ ] Configurer Resend
- [ ] Templates : confirmation d'achat, notification de vente, expédition, litige
- [ ] Envoi depuis les webhooks et les API routes

---

### Phase 8 — PWA, Optimisations, Animations & Polish

> **Objectif :** Application prête pour la production avec une qualité world-class.
> **Durée estimée :** 5-6 jours

#### 8.1 PWA Complet

- [ ] Finaliser le Service Worker (stratégies de cache, SKIP_WAITING, nettoyage dev)
- [ ] Composant `InstallPrompt` (bouton flottant `beforeinstallprompt`)
- [ ] Composant `UpdatePrompt` (banner "Mettre à jour l'app")
- [ ] Page `/offline` (design soigné, bouton recharger)
- [ ] Tester l'installation sur iOS, Android, Desktop

#### 8.2 Animations Polish

- [ ] Page transitions (AnimatePresence, shared layout sur listing card → detail)
- [ ] Affiner les micro-interactions sur tous les composants interactifs
- [ ] Swipe gestures : swipe-to-delete sur les favoris, swipe-back navigation
- [ ] Pull-to-refresh avec retour haptique (Vibration API)
- [ ] Respect de `prefers-reduced-motion`
- [ ] Animations skeleton shimmer uniformes

#### 8.3 Performance

- [ ] Audit Lighthouse (objectif : score > 90 sur toutes les catégories)
- [ ] Vérifier les Core Web Vitals (LCP < 2.5s, INP < 200ms, CLS < 0.1)
- [ ] Optimiser les dynamic imports (`next/dynamic` pour composants lourds)
- [ ] Vérifier le bundle size (< 150KB gzip initial)
- [ ] Optimiser les images (blur placeholders, lazy loading, sizes)
- [ ] Preconnect aux domaines critiques

#### 8.4 SEO

- [ ] `generateMetadata` sur toutes les pages publiques (titre, description, OG image)
- [ ] `robots.txt` et `sitemap.xml` dynamiques
- [ ] Structured data (JSON-LD) pour les annonces

#### 8.5 Litiges

- [ ] Formulaire d'ouverture de litige (acheteur, si SHIPPED)
- [ ] API de création de litige (service_role pour la résolution)
- [ ] Email de notification au vendeur

#### 8.6 Référentiel de prix

- [ ] Implémenter `/price-checking` (recherche + liste avec prix estimés)

#### 8.7 Tests

- [ ] Tests unitaires Vitest (hooks, utils, pricing, validations)
- [ ] Tests E2E Playwright (parcours critique : inscription → publication → achat → expédition → confirmation)

#### 8.8 CI/CD

- [ ] GitHub Actions : lint + type-check + tests unitaires sur chaque PR
- [ ] Deploy preview Vercel sur chaque PR
- [ ] Deploy production sur merge dans `main`

#### 8.9 Monitoring

- [ ] Intégrer Sentry (error tracking frontend + API routes)
- [ ] Configurer Vercel Analytics + Speed Insights
- [ ] Vérifier les alertes Supabase (connexions, storage, realtime)

#### 8.10 Documentation

- [ ] README avec setup local, variables d'env, commandes
- [ ] `.env.local.example` à jour
- [ ] Cursor rules pour l'AI (conventions, patterns, architecture)

---

## Annexe A — Récapitulatif des dépendances npm

```json
{
  "dependencies": {
    "next": "^16.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@supabase/supabase-js": "^2.x",
    "@supabase/ssr": "^0.x",
    "@tanstack/react-query": "^5.x",
    "framer-motion": "^12.x",
    "stripe": "^17.x",
    "@stripe/stripe-js": "^5.x",
    "@stripe/react-stripe-js": "^3.x",
    "resend": "^4.x",
    "web-push": "^3.x",
    "zod": "^3.x",
    "lucide-react": "^0.x",
    "date-fns": "^4.x",
    "class-variance-authority": "^0.x",
    "clsx": "^2.x",
    "tailwind-merge": "^3.x"
  },
  "devDependencies": {
    "typescript": "^5.7",
    "tailwindcss": "^4.x",
    "@tailwindcss/postcss": "^4.x",
    "eslint": "^9.x",
    "eslint-config-next": "^16.x",
    "prettier": "^3.x",
    "prettier-plugin-tailwindcss": "^0.x",
    "husky": "^9.x",
    "lint-staged": "^15.x",
    "vitest": "^3.x",
    "@playwright/test": "^1.x",
    "supabase": "^2.x"
  }
}
```

## Annexe B — Variables d'environnement

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# OpenAI
OPENAI_API_KEY=

# Resend
RESEND_API_KEY=

# Push Notifications
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=

# App
NEXT_PUBLIC_APP_URL=
CRON_SECRET=
```

## Annexe C — Estimation des coûts Supabase (100K MAU)

| Service                  | Tier                             | Estimation mensuelle         |
| ------------------------ | -------------------------------- | ---------------------------- |
| Database (Pro)           | 8GB RAM, 100GB storage           | ~$25/mois                    |
| Auth                     | 100K MAU                         | Inclus dans Pro              |
| Storage                  | ~500GB (images)                  | ~$25/mois                    |
| Realtime                 | ~50K connexions simultanées peak | ~$25/mois                    |
| Edge Functions           | ~1M invocations                  | Inclus dans Pro              |
| **Total Supabase**       |                                  | **~$75/mois**                |
| Vercel Pro               |                                  | ~$20/mois                    |
| Stripe                   | 2.9% + 0.30€/transaction         | Variable                     |
| OpenAI (OCR)             | ~50K appels/mois                 | ~$50/mois                    |
| Resend                   | ~100K emails/mois                | ~$20/mois                    |
| **Total infrastructure** |                                  | **~$165/mois + Stripe fees** |

---

> **Ce PRD est le document de référence définitif pour PokeMarket V1.**
> Chaque phase du plan d'exécution est conçue pour être autonome et testable indépendamment.
> L'exécution se fera tâche par tâche, phase par phase.
