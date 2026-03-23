# PLAN-TCGDEX-EXHAUSTIF.md — Migration vers un catalogue TCGdex 100% exhaustif

> **Objectif :** Refactoring complet des tables `tcgdex_series`, `tcgdex_sets`, `tcgdex_cards` pour que notre miroir Supabase soit fidèle à 100% à la structure de l'API TCGdex v2.
>
> **Auteur :** Senior Data Engineer & Next.js Expert
>
> **Date :** 23 mars 2026
>
> **Statut :** En attente de validation

---

## Table des matières

1. [Audit de l'existant](#1-audit-de-lexistant)
2. [Cible : Mapping TCGdex v2 → PostgreSQL](#2-cible--mapping-tcgdex-v2--postgresql)
3. [Étape 1 — Migration SQL Supabase](#3-étape-1--migration-sql-supabase)
4. [Étape 2 — Types TypeScript](#4-étape-2--types-typescript)
5. [Étape 3 — Refonte du script de Seed](#5-étape-3--refonte-du-script-de-seed)
6. [Étape 4 — Impact sur le code existant (OCR, Recherche, UI)](#6-étape-4--impact-sur-le-code-existant)
7. [Étape 5 — Index & Performance](#7-étape-5--index--performance)
8. [Étape 6 — Validation & Rollback](#8-étape-6--validation--rollback)
9. [Estimation des volumes](#9-estimation-des-volumes)

---

## 1. Audit de l'existant

### Schéma actuel (`00009_tcgdex_catalog.sql`)

| Table           | Colonnes                                                                               | Manques identifiés                                                                                                                                                                                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tcgdex_series` | `language`, `id`, `name`                                                               | Logo de la série absent                                                                                                                                                                                                                                                                   |
| `tcgdex_sets`   | `language`, `id`, `name`, `series_id`, `logo`, `release_date`                          | `symbol`, `card_count`, `legal`, `tcg_online_code` absents                                                                                                                                                                                                                                |
| `tcgdex_cards`  | `language`, `id`, `card_key` (generated), `name`, `set_id`, `hp`, `rarity`, `variants` | 15+ champs manquants : `category`, `local_id`, `illustrator`, `image`, `types`, `evolve_from`, `description`, `stage`, `attacks`, `weaknesses`, `retreat`, `regulation_mark`, `legal`, `dex_id`, `level`, `suffix`, `effect`, `trainer_type`, `energy_type`, `item`, `pricing`, `updated` |

### Script de seed actuel (`scripts/seed-tcgdex.ts`)

- Supporte 3 langues (`fr`, `en`, `ja`)
- Stratégie : fetch `/sets` → fetch détail de chaque set → collecte des `card refs` → fetch détail de chaque carte
- **Problème** : le `CardDetail` local ne récupère que `id`, `name`, `hp`, `rarity`, `set.id`, `variants` → perte de 80% des données
- Concurrency : 15 requêtes parallèles, batching DB de 500

### Fichiers impactés identifiés

| Fichier                                    | Usage TCGdex                                                                   | Impact                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------ | --------------------------------------------------- |
| `src/app/api/ocr/route.ts`                 | Query `tcgdex_cards` (name, set_id, hp, rarity, card_key) + join `tcgdex_sets` | Champs renommés/ajoutés, scoring améliorable        |
| `src/app/(public)/price-checking/page.tsx` | Query `tcgdex_cards` (card_key, name, set_id, rarity)                          | Accès à `image`, `category`, nouveaux champs        |
| `src/types/database.ts`                    | Types manuels `tcgdex_cards`, `tcgdex_sets`, `tcgdex_series`                   | Refonte complète des types TCGdex                   |
| `src/types/index.ts`                       | Exports `TcgdexCard`, `TcgdexSet`, `TcgdexSeries`                              | Ajout de types JSONB + re-export                    |
| `src/types/api.ts`                         | `OcrCandidate` type                                                            | Enrichir avec nouveaux champs (image_url, category) |
| `src/lib/validations.ts`                   | `ocrCandidateSchema`                                                           | Mettre à jour le schéma Zod                         |
| `src/lib/query-keys.ts`                    | `tcgdex.cards`, `tcgdex.sets`, `tcgdex.series`                                 | Inchangé (clés ok)                                  |
| `next.config.ts`                           | `assets.tcgdex.net` dans `remotePatterns`                                      | Inchangé                                            |

---

## 2. Cible : Mapping TCGdex v2 → PostgreSQL

### Philosophie de typage

| Type de donnée                                            | Stratégie PostgreSQL                | Justification                                                           |
| --------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------- |
| Scalaires simples (category, illustrator, hp, retreat...) | **Colonnes typées** (TEXT, INTEGER) | Indexable, filtrable, requêtes SQL simples                              |
| `local_id` (string ou number dans l'API)                  | **TEXT**                            | Certaines cartes ont des localId non numériques (ex: "SV001")           |
| Tableaux de primitives (types, dex_id)                    | **JSONB**                           | Tableau simple, pas besoin de jointure                                  |
| Objets imbriqués complexes (attacks, weaknesses, item)    | **JSONB**                           | Lecture seule catalogue, structure variable selon la carte              |
| Objets de configuration (variants, legal)                 | **JSONB**                           | Objets à 2-5 clés, parfait pour JSONB                                   |
| Données de marché (pricing)                               | **JSONB**                           | Structure très imbriquée et variable, mise à jour indépendante possible |
| `card_count` (sets)                                       | **JSONB**                           | Objet à 5-6 clés, lecture seule                                         |
| `image` URL                                               | **TEXT**                            | Reconstituable depuis l'id, mais on stocke pour éviter la logique       |
| `updated` (ISO 8601)                                      | **TIMESTAMPTZ**                     | Tri natif, comparaison temporelle                                       |

### Mapping détaillé `tcgdex_cards`

| Champ TCGdex API | Colonne PostgreSQL | Type PG        | Nullable | Notes                                   |
| ---------------- | ------------------ | -------------- | -------- | --------------------------------------- |
| `id`             | `id`               | TEXT           | NOT NULL | PK composite (language, id)             |
| `localId`        | `local_id`         | TEXT           | NOT NULL | Numéro dans le set                      |
| `name`           | `name`             | TEXT           | NULL     | Nom officiel                            |
| `category`       | `category`         | TEXT           | NOT NULL | "Pokemon", "Trainer", "Energy"          |
| `illustrator`    | `illustrator`      | TEXT           | NULL     | Artiste                                 |
| `image`          | `image`            | TEXT           | NULL     | URL de base (sans extension)            |
| `rarity`         | `rarity`           | TEXT           | NULL     | Rareté localisée                        |
| `set.id`         | `set_id`           | TEXT           | NULL     | FK logique vers tcgdex_sets             |
| `variants`       | `variants`         | JSONB          | NULL     | `{normal, reverse, holo, firstEdition}` |
| `hp`             | `hp`               | INTEGER        | NULL     | Points de vie (Pokémon uniquement)      |
| `types`          | `types`            | JSONB          | NULL     | `["Fire", "Water"]`                     |
| `evolveFrom`     | `evolve_from`      | TEXT           | NULL     | Nom du Pokémon pré-évolution            |
| `description`    | `description`      | TEXT           | NULL     | Texte de saveur                         |
| `stage`          | `stage`            | TEXT           | NULL     | "Basic", "Stage1", "Stage2", etc.       |
| `attacks`        | `attacks`          | JSONB          | NULL     | `[{cost, name, effect, damage}]`        |
| `weaknesses`     | `weaknesses`       | JSONB          | NULL     | `[{type, value}]`                       |
| `retreat`        | `retreat`          | INTEGER        | NULL     | Coût de retraite                        |
| `regulationMark` | `regulation_mark`  | TEXT           | NULL     | Lettre de régulation (D, E, F, G, H)    |
| `legal`          | `legal`            | JSONB          | NULL     | `{standard: bool, expanded: bool}`      |
| `dexId`          | `dex_id`           | JSONB          | NULL     | `[162]` (tableau d'entiers)             |
| `level`          | `level`            | TEXT           | NULL     | Niveau (cartes LV.X)                    |
| `suffix`         | `suffix`           | TEXT           | NULL     | Suffixe (ex, VMAX, V, etc.)             |
| `item`           | `item`             | JSONB          | NULL     | `{name, effect}` (objets Pokémon)       |
| `effect`         | `effect`           | TEXT           | NULL     | Effet (Trainer/Energy)                  |
| `trainerType`    | `trainer_type`     | TEXT           | NULL     | Type de dresseur                        |
| `energyType`     | `energy_type`      | TEXT           | NULL     | "Basic" ou "Special"                    |
| `pricing`        | `pricing`          | JSONB          | NULL     | Données cardmarket + tcgplayer          |
| `updated`        | `updated_at`       | TIMESTAMPTZ    | NULL     | Dernière mise à jour TCGdex             |
| _(generated)_    | `card_key`         | TEXT GENERATED | NOT NULL | `language \|\| '-' \|\| id`             |

### Mapping détaillé `tcgdex_sets`

| Champ TCGdex API | Colonne PostgreSQL | Type PG | Nullable | Notes                                                     |
| ---------------- | ------------------ | ------- | -------- | --------------------------------------------------------- |
| `id`             | `id`               | TEXT    | NOT NULL | PK composite (language, id)                               |
| `name`           | `name`             | TEXT    | NOT NULL | Nom du set                                                |
| `logo`           | `logo`             | TEXT    | NULL     | URL du logo                                               |
| `symbol`         | `symbol`           | TEXT    | NULL     | **NOUVEAU** — URL du symbole                              |
| `serie.id`       | `series_id`        | TEXT    | NULL     | FK logique vers tcgdex_series                             |
| `releaseDate`    | `release_date`     | DATE    | NULL     | Format yyyy-mm-dd                                         |
| `cardCount`      | `card_count`       | JSONB   | NULL     | **NOUVEAU** — `{total, official, holo, reverse, firstEd}` |
| `legal`          | `legal`            | JSONB   | NULL     | **NOUVEAU** — `{standard, expanded}`                      |
| `tcgOnline`      | `tcg_online_code`  | TEXT    | NULL     | **NOUVEAU** — Code PTCGO                                  |

### Mapping détaillé `tcgdex_series`

| Champ TCGdex API                       | Colonne PostgreSQL | Type PG | Nullable | Notes                             |
| -------------------------------------- | ------------------ | ------- | -------- | --------------------------------- |
| `id`                                   | `id`               | TEXT    | NOT NULL | PK composite (language, id)       |
| `name`                                 | `name`             | TEXT    | NOT NULL | Nom de la série                   |
| _(pas de logo dans l'API série brief)_ | —                  | —       | —        | La série TCGdex n'a que id + name |

> **Note :** La table `tcgdex_series` n'a besoin que de `language`, `id`, `name` — pas de changement structurel.

---

## 3. Étape 1 — Migration SQL Supabase

### 3.1 Fichier de migration

- [x] **Créer `supabase/migrations/00026_tcgdex_exhaustive_catalog.sql`**

### 3.2 Migration `tcgdex_sets` — Ajout de colonnes

- [x] `ALTER TABLE tcgdex_sets ADD COLUMN symbol TEXT;`
- [x] `ALTER TABLE tcgdex_sets ADD COLUMN card_count JSONB;`
- [x] `ALTER TABLE tcgdex_sets ADD COLUMN legal JSONB;`
- [x] `ALTER TABLE tcgdex_sets ADD COLUMN tcg_online_code TEXT;`

### 3.3 Migration `tcgdex_cards` — Ajout de colonnes

Données scalaires Pokémon :

- [x] `ALTER TABLE tcgdex_cards ADD COLUMN local_id TEXT;`
- [x] `ALTER TABLE tcgdex_cards ADD COLUMN category TEXT;`
- [x] `ALTER TABLE tcgdex_cards ADD COLUMN illustrator TEXT;`
- [x] `ALTER TABLE tcgdex_cards ADD COLUMN image TEXT;`
- [x] `ALTER TABLE tcgdex_cards ADD COLUMN evolve_from TEXT;`
- [x] `ALTER TABLE tcgdex_cards ADD COLUMN description TEXT;`
- [x] `ALTER TABLE tcgdex_cards ADD COLUMN stage TEXT;`
- [x] `ALTER TABLE tcgdex_cards ADD COLUMN retreat INTEGER;`
- [x] `ALTER TABLE tcgdex_cards ADD COLUMN regulation_mark TEXT;`
- [x] `ALTER TABLE tcgdex_cards ADD COLUMN level TEXT;`
- [x] `ALTER TABLE tcgdex_cards ADD COLUMN suffix TEXT;`

Données scalaires Trainer/Energy :

- [x] `ALTER TABLE tcgdex_cards ADD COLUMN effect TEXT;`
- [x] `ALTER TABLE tcgdex_cards ADD COLUMN trainer_type TEXT;`
- [x] `ALTER TABLE tcgdex_cards ADD COLUMN energy_type TEXT;`

Données JSONB :

- [x] `ALTER TABLE tcgdex_cards ADD COLUMN types JSONB;`
- [x] `ALTER TABLE tcgdex_cards ADD COLUMN attacks JSONB;`
- [x] `ALTER TABLE tcgdex_cards ADD COLUMN weaknesses JSONB;`
- [x] `ALTER TABLE tcgdex_cards ADD COLUMN legal JSONB;`
- [x] `ALTER TABLE tcgdex_cards ADD COLUMN dex_id JSONB;`
- [x] `ALTER TABLE tcgdex_cards ADD COLUMN item JSONB;`
- [x] `ALTER TABLE tcgdex_cards ADD COLUMN pricing JSONB;`

Timestamp :

- [x] `ALTER TABLE tcgdex_cards ADD COLUMN updated_at TIMESTAMPTZ;`

### 3.4 Ajout de commentaires SQL sur les colonnes JSONB

- [x] Ajouter des `COMMENT ON COLUMN` pour documenter la structure attendue de chaque JSONB (aide les développeurs et le futur `supabase gen types`)

```sql
COMMENT ON COLUMN tcgdex_cards.attacks IS
  'Array of {cost: string[], name: string, effect?: string, damage?: string|number}';
COMMENT ON COLUMN tcgdex_cards.weaknesses IS
  'Array of {type: string, value: string}';
COMMENT ON COLUMN tcgdex_cards.variants IS
  '{normal: bool, reverse: bool, holo: bool, firstEdition: bool, wPromo?: bool}';
COMMENT ON COLUMN tcgdex_cards.legal IS
  '{standard: boolean, expanded: boolean}';
COMMENT ON COLUMN tcgdex_cards.pricing IS
  '{cardmarket?: {...}, tcgplayer?: {...}} — full pricing data from TCGdex';
```

### 3.5 Politique RLS (vérification)

- [x] Vérifier que la politique RLS existante `SELECT = true` (lecture publique) sur `tcgdex_cards` et `tcgdex_sets` couvre les nouvelles colonnes (elle le fait par défaut, car c'est un `FOR SELECT USING (true)`)

---

## 4. Étape 2 — Types TypeScript

### 4.1 Interfaces JSONB dans `src/types/index.ts`

- [x] **Créer l'interface `CardAttack`**

  ```typescript
  type CardAttack = {
    cost: string[];
    name: string;
    effect?: string;
    damage?: string | number;
  };
  ```

- [x] **Créer l'interface `CardWeakness`**

  ```typescript
  type CardWeakness = {
    type: string;
    value: string;
  };
  ```

- [x] **Créer l'interface `CardVariants`**

  ```typescript
  type CardVariants = {
    normal: boolean;
    reverse: boolean;
    holo: boolean;
    firstEdition: boolean;
    wPromo?: boolean;
  };
  ```

- [x] **Créer l'interface `CardLegal`**

  ```typescript
  type CardLegal = {
    standard: boolean;
    expanded: boolean;
  };
  ```

- [x] **Créer l'interface `CardItem`**

  ```typescript
  type CardItem = {
    name: string;
    effect: string;
  };
  ```

- [x] **Créer l'interface `SetCardCount`**

  ```typescript
  type SetCardCount = {
    total: number;
    official: number;
    reverse?: number;
    holo?: number;
    firstEd?: number;
    normal?: number;
  };
  ```

- [x] **Créer l'interface `CardPricing`** (optionnel, peut rester `Json` au départ)
  ```typescript
  type CardPricing = {
    cardmarket?: Record<string, number | string>;
    tcgplayer?: Record<string, unknown>;
  };
  ```

### 4.2 Mise à jour de `src/types/database.ts`

- [x] **Mettre à jour le type `tcgdex_cards.Row`** avec toutes les nouvelles colonnes :
  - `local_id: string | null`
  - `category: string | null`
  - `illustrator: string | null`
  - `image: string | null`
  - `evolve_from: string | null`
  - `description: string | null`
  - `stage: string | null`
  - `retreat: number | null`
  - `regulation_mark: string | null`
  - `level: string | null`
  - `suffix: string | null`
  - `effect: string | null`
  - `trainer_type: string | null`
  - `energy_type: string | null`
  - `types: Json | null`
  - `attacks: Json | null`
  - `weaknesses: Json | null`
  - `legal: Json | null`
  - `dex_id: Json | null`
  - `item: Json | null`
  - `pricing: Json | null`
  - `updated_at: string | null`

- [x] **Mettre à jour le type `tcgdex_cards.Insert`** (tous les nouveaux champs optionnels)

- [x] **Mettre à jour le type `tcgdex_sets.Row`** avec :
  - `symbol: string | null`
  - `card_count: Json | null`
  - `legal: Json | null`
  - `tcg_online_code: string | null`

- [x] **Mettre à jour le type `tcgdex_sets.Insert`** (nouveaux champs optionnels)

### 4.3 Mise à jour de `src/types/index.ts`

- [x] Re-exporter les nouveaux types (`CardAttack`, `CardWeakness`, etc.)
- [x] Vérifier que `TcgdexCard`, `TcgdexSet`, `TcgdexSeries` reflètent les nouveaux Row types
- [x] Créer un type helper `TcgdexCardTyped` qui cast les JSONB vers les interfaces exactes :
  ```typescript
  type TcgdexCardTyped = Omit<
    TcgdexCard,
    | "attacks"
    | "weaknesses"
    | "variants"
    | "legal"
    | "types"
    | "dex_id"
    | "item"
    | "pricing"
  > & {
    attacks: CardAttack[] | null;
    weaknesses: CardWeakness[] | null;
    variants: CardVariants | null;
    legal: CardLegal | null;
    types: string[] | null;
    dex_id: number[] | null;
    item: CardItem | null;
    pricing: CardPricing | null;
  };
  ```

---

## 5. Étape 3 — Refonte du script de Seed

### 5.1 Analyse du problème de data-fetching

L'endpoint `/cards` global de TCGdex ne renvoie qu'un **CardBrief** (id, localId, name, image). Pour obtenir les données exhaustives, il existe 3 stratégies :

| Stratégie                                                                                    | Avantages                                           | Inconvénients                                           |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------- |
| **A) Fetch chaque carte individuellement** (`GET /cards/{id}`)                               | Données 100% complètes                              | ~15 000+ requêtes HTTP par langue, rate-limiting        |
| **B) Fetch les cartes par set** (`GET /sets/{id}` → `cards[]` brief, puis `GET /cards/{id}`) | Réutilise les détails du set, structure logique     | Même nombre de requêtes individuelles par carte         |
| **C) GraphQL TCGdex**                                                                        | Potentiellement moins de requêtes, champs sélectifs | Nécessite de construire les queries, support à vérifier |

**Stratégie retenue : B (par Set) — c'est la stratégie actuelle, optimisée.**

Le script actuel fait déjà B mais ne récupère pas tous les champs lors du fetch détail de la carte. La correction est minimale : enrichir l'interface `CardDetail` et le mapping d'insertion.

### 5.2 Refonte du fichier `scripts/seed-tcgdex.ts`

- [ ] **Mettre à jour l'interface `SetDetail`** pour inclure les nouveaux champs :

  ```typescript
  interface SetDetail {
    id: string;
    name: string;
    logo?: string;
    symbol?: string;
    releaseDate?: string;
    serie?: { id: string; name: string };
    cards?: Array<{
      id: string;
      localId: string;
      name: string;
      image?: string;
    }>;
    cardCount?: {
      total: number;
      official: number;
      reverse?: number;
      holo?: number;
      firstEd?: number;
      normal?: number;
    };
    legal?: { standard: boolean; expanded: boolean };
    tcgOnline?: string;
  }
  ```

- [ ] **Refondre complètement l'interface `CardDetail`** pour capturer 100% de l'API :

  ```typescript
  interface CardDetail {
    id: string;
    localId: string;
    name?: string;
    category: string;
    illustrator?: string;
    image?: string;
    rarity?: string;
    set?: { id: string };
    variants?: Record<string, boolean>;
    hp?: number | string;
    types?: string[];
    evolveFrom?: string;
    description?: string;
    stage?: string;
    attacks?: Array<{
      cost: string[];
      name: string;
      effect?: string;
      damage?: string | number;
    }>;
    weaknesses?: Array<{ type: string; value: string }>;
    retreat?: number;
    regulationMark?: string;
    legal?: { standard: boolean; expanded: boolean };
    dexId?: number[];
    level?: string;
    suffix?: string;
    item?: { name: string; effect: string };
    effect?: string;
    trainerType?: string;
    energyType?: string;
    pricing?: Record<string, unknown>;
    updated?: string;
  }
  ```

- [ ] **Mettre à jour `seedSets()`** : mapper les nouveaux champs du set (symbol, card_count, legal, tcg_online_code) dans la row d'upsert

- [ ] **Mettre à jour `seedCards()`** : mapper tous les nouveaux champs dans la row d'upsert. Le mapping principal :
  ```typescript
  const row = {
    language: lang,
    id: detail.id,
    local_id: detail.localId ?? ref.localId,
    name: detail.name ?? ref.name ?? null,
    category: detail.category ?? null,
    illustrator: detail.illustrator ?? null,
    image: detail.image ?? null,
    set_id: detail.set?.id ?? extractSetId(ref.id, ref.localId),
    hp: parseHp(detail.hp),
    rarity: detail.rarity ?? null,
    variants: detail.variants ?? null,
    types: detail.types ?? null,
    evolve_from: detail.evolveFrom ?? null,
    description: detail.description ?? null,
    stage: detail.stage ?? null,
    attacks: detail.attacks ?? null,
    weaknesses: detail.weaknesses ?? null,
    retreat: detail.retreat ?? null,
    regulation_mark: detail.regulationMark ?? null,
    legal: detail.legal ?? null,
    dex_id: detail.dexId ?? null,
    level: detail.level ?? null,
    suffix: detail.suffix ?? null,
    item: detail.item ?? null,
    effect: detail.effect ?? null,
    trainer_type: detail.trainerType ?? null,
    energy_type: detail.energyType ?? null,
    pricing: detail.pricing ?? null,
    updated_at: detail.updated ?? null,
  };
  ```

### 5.3 Optimisation du rate-limiting

- [ ] **Réduire la concurrence de 15 à 10** requêtes parallèles (marge de sécurité supplémentaire avec les payloads plus gros)
- [ ] **Augmenter le délai entre batches de 250ms à 500ms** pour éviter le 429 sur les gros sets
- [ ] **Ajouter un backoff exponentiel amélioré** : sur 429, attendre `attempt * 3000ms` (au lieu de `attempt * 2000ms`)
- [ ] **Ajouter un compteur de rate-limit hits** dans les logs pour monitoring
- [ ] **Ajouter un mode `--dry-run`** qui affiche les stats sans écrire en base (utile pour valider)

### 5.4 Gestion du pricing (optionnel, phase 2)

- [ ] **Ajouter un flag `--include-pricing`** : le pricing n'est pas toujours disponible et alourdit significativement les données (~2x la taille). Par défaut, le seeder le récupère car il est dans la réponse, mais un flag `--skip-pricing` pourrait être ajouté pour accélérer les seeds de développement

### 5.5 Mode incrémental (optionnel, phase 2)

- [ ] **Ajouter un flag `--incremental`** qui ne re-fetch que les cartes dont `updated_at` est plus récent que notre version stockée (nécessite un SELECT préalable des `updated_at` existants)

---

## 6. Étape 4 — Impact sur le code existant

### 6.1 Route OCR (`src/app/api/ocr/route.ts`)

Le changement principal est que les colonnes sélectionnées dans la query Supabase doivent être mises à jour, et l'algorithme de scoring peut être enrichi.

- [ ] **Mettre à jour la query `tcgdex_cards`** : ajouter `local_id`, `category`, `image`, `types`, `stage` dans le `select()`
- [ ] **Améliorer `buildTcgdexImageUrl()`** : remplacer la logique de reconstruction manuelle par la colonne `image` stockée directement :
  ```typescript
  // Avant : reconstruction manuelle depuis setId/seriesId
  // Après : utiliser card.image directement
  function buildTcgdexImageUrl(
    image: string | null,
    language: string,
  ): string | null {
    if (!image) return null;
    return `${image}/low.webp`;
  }
  ```
- [ ] **Enrichir `computeConfidence()`** : utiliser `local_id` pour un matching plus précis avec `parsed.card_number` (au lieu de parser l'id composé)
- [ ] **Mettre à jour le type `OcrCandidate`** dans `src/types/api.ts` : ajouter `category`, `image_url` (maintenant fiable)

### 6.2 Route OCR — Mise à jour du schéma Zod (`src/lib/validations.ts`)

- [ ] **Mettre à jour `ocrCandidateSchema`** : ajouter `category: z.string().nullable()` et vérifier que tous les nouveaux champs retournés sont couverts

### 6.3 Page Price-Checking (`src/app/(public)/price-checking/page.tsx`)

- [ ] **Enrichir la query `tcgdex_cards`** : ajouter `image`, `category` dans le `select()` pour afficher la miniature de la carte
- [ ] **Mettre à jour le type `PriceResult`** : ajouter `image: string | null`, `category: string | null`
- [ ] **UI** : utiliser `next/image` pour afficher la miniature de la carte dans chaque résultat (avec `image` + `/low.webp`)

### 6.4 Formulaire de vente / Sell — OCR Results

- [ ] **Vérifier `src/components/sell/ocr-results.tsx`** : si ce composant affiche des candidats OCR, s'assurer qu'il utilise le nouveau type `OcrCandidate` avec l'image directe
- [ ] **Enrichir l'affichage** : utiliser `category`, `types`, `stage` pour un affichage plus riche des candidats

### 6.5 Feed / Recherche — Filtres potentiels

- [ ] **Évaluer l'ajout de nouveaux filtres** : avec les nouvelles données disponibles (types, stage, regulation_mark), il sera possible d'ajouter des filtres avancés au feed. **Ne pas implémenter maintenant** mais documenter comme amélioration future.

### 6.6 Listing Detail — Enrichissement

- [ ] **Évaluer l'enrichissement de `/listing/[id]`** : si la listing référence un `card_ref_id`, on pourra afficher les informations complètes de la carte (types, attaques, faiblesses, etc.). **Ne pas implémenter maintenant** mais documenter comme amélioration future.

---

## 7. Étape 5 — Index & Performance

### 7.1 Index existants (vérification)

Les tables `tcgdex_*` ont des PK composites `(language, id)` qui servent d'index primaire. Vérifier qu'aucun index supplémentaire n'est nécessaire pour les queries actuelles.

### 7.2 Nouveaux index recommandés

- [x] **Index GIN sur `tcgdex_cards.types`** (pour les futures requêtes de filtre par type) :

  ```sql
  CREATE INDEX idx_tcgdex_cards_types ON tcgdex_cards USING gin (types);
  ```

- [x] **Index sur `tcgdex_cards.category`** (pour filtrer Pokémon vs Trainer vs Energy) :

  ```sql
  CREATE INDEX idx_tcgdex_cards_category ON tcgdex_cards (language, category);
  ```

- [x] **Index sur `tcgdex_cards.set_id`** (pour les jointures par set, déjà peut-être couvert) :

  ```sql
  CREATE INDEX idx_tcgdex_cards_set_id ON tcgdex_cards (language, set_id);
  ```

- [x] **Index trigram sur `tcgdex_cards.name`** (pour la recherche ILIKE dans l'OCR et le price-checking) :
  ```sql
  CREATE INDEX idx_tcgdex_cards_name_trgm ON tcgdex_cards USING gin (name gin_trgm_ops);
  ```

> **Note :** Les index GIN sur JSONB sont coûteux en espace. Ne les ajouter que si les queries le justifient. L'index sur `types` est recommandé car il sera très utile pour les filtres avancés.

### 7.3 Estimation de l'espace disque

| Table           | Lignes estimées (3 langues) | Taille estimée par ligne     | Total estimé   |
| --------------- | --------------------------- | ---------------------------- | -------------- |
| `tcgdex_series` | ~90 (30 × 3)                | ~100 bytes                   | ~9 KB          |
| `tcgdex_sets`   | ~900 (300 × 3)              | ~500 bytes                   | ~450 KB        |
| `tcgdex_cards`  | ~60 000 (20 000 × 3)        | ~2-4 KB (avec pricing JSONB) | **120-240 MB** |

Le pricing JSONB est le champ le plus volumineux (~1-2 KB par carte). Sans pricing : ~60-80 MB.

---

## 8. Étape 6 — Validation & Rollback

### 8.1 Plan de test

- [ ] **Test local** : exécuter le seed sur une seule langue (`fr`) et un seul set pour valider le mapping
- [ ] **Validation exhaustive** : vérifier que le nombre de cartes insérées correspond au nombre total renvoyé par l'API
- [ ] **Spot check** : comparer manuellement 10 cartes (2 Pokémon, 2 Trainer, 2 Energy, 2 avec pricing, 2 anciennes cartes) entre l'API et la base
- [ ] **Test OCR** : exécuter la route OCR avec une image et vérifier que les candidats s'affichent correctement
- [ ] **Test Price-Checking** : vérifier que la page fonctionne avec les nouveaux champs
- [ ] **Test TypeScript** : `npx tsc --noEmit` doit passer sans erreur

### 8.2 Script de validation

- [ ] **Créer `scripts/validate-tcgdex.ts`** : script qui compare un échantillon de cartes entre l'API TCGdex et la base Supabase et reporte les différences

### 8.3 Plan de rollback

La migration étant **additive** (uniquement des `ALTER TABLE ADD COLUMN`), le rollback est sûr :

- [ ] **Préparer `supabase/migrations/00026_tcgdex_exhaustive_catalog_rollback.sql`** (ne pas exécuter, garder en cas de besoin) :
  ```sql
  ALTER TABLE tcgdex_cards DROP COLUMN IF EXISTS local_id, category, illustrator, ...;
  ALTER TABLE tcgdex_sets DROP COLUMN IF EXISTS symbol, card_count, legal, tcg_online_code;
  ```

> **Important :** Le rollback ne devrait jamais être nécessaire car la migration est non-destructive. Les anciennes colonnes et données restent intactes.

---

## 9. Estimation des volumes

### Temps de seed estimé

| Langue    | Sets | Cartes  | Requêtes HTTP | Temps estimé (10 concurrency, 500ms delay) |
| --------- | ---- | ------- | ------------- | ------------------------------------------ |
| `fr`      | ~300 | ~18 000 | ~18 300       | ~25-35 min                                 |
| `en`      | ~300 | ~20 000 | ~20 300       | ~30-40 min                                 |
| `ja`      | ~250 | ~15 000 | ~15 250       | ~20-30 min                                 |
| **Total** | ~850 | ~53 000 | ~53 850       | **~75-105 min**                            |

### Checklist de lancement

- [ ] 1. Appliquer la migration SQL sur Supabase (staging puis production)
- [ ] 2. Mettre à jour les types TypeScript
- [ ] 3. Mettre à jour le script de seed
- [ ] 4. Exécuter le seed `fr` seul → valider
- [ ] 5. Exécuter le seed `en` et `ja`
- [ ] 6. Mettre à jour les routes API (OCR, price-checking)
- [ ] 7. Vérifier `npx tsc --noEmit`
- [ ] 8. Exécuter `npx supabase gen types typescript` pour régénérer les types si besoin
- [ ] 9. Tester l'application end-to-end
- [ ] 10. Commit & deploy

---

## Résumé des fichiers à modifier

| Fichier                                                   | Action                                                 |
| --------------------------------------------------------- | ------------------------------------------------------ |
| `supabase/migrations/00026_tcgdex_exhaustive_catalog.sql` | **CRÉER** — Migration additive                         |
| `scripts/seed-tcgdex.ts`                                  | **MODIFIER** — Interfaces + mapping complet            |
| `src/types/database.ts`                                   | **MODIFIER** — Types tcgdex_cards + tcgdex_sets        |
| `src/types/index.ts`                                      | **MODIFIER** — Nouvelles interfaces JSONB + re-exports |
| `src/types/api.ts`                                        | **MODIFIER** — Enrichir `OcrCandidate`                 |
| `src/lib/validations.ts`                                  | **MODIFIER** — Mettre à jour `ocrCandidateSchema`      |
| `src/app/api/ocr/route.ts`                                | **MODIFIER** — Nouvelle query + scoring amélioré       |
| `src/app/(public)/price-checking/page.tsx`                | **MODIFIER** — Enrichir la query + affichage miniature |
| `scripts/validate-tcgdex.ts`                              | **CRÉER** — Script de validation post-seed             |

> **Priorité d'exécution :** Migration SQL → Types TS → Seed script → OCR route → Price-checking → Validation
