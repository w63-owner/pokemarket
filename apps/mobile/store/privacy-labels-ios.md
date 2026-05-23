# Apple Privacy Nutrition Labels — déclaration

> Source de vérité pour le formulaire **App Privacy** dans App Store Connect.
> À mettre à jour à chaque ajout/suppression d'un type de donnée collectée.
> Toutes les déclarations doivent matcher la politique de confidentialité
> publiée sur https://pokemarket.app/legal/privacy.

## Vue d'ensemble

| Catégorie Apple | Données                                | Lié à l'identité | Suivi cross-app | Finalités                           |
| --------------- | -------------------------------------- | ---------------- | --------------- | ----------------------------------- |
| Contact Info    | Email, Nom, Adresse postale, Téléphone | ✅               | ❌              | App Functionality, Customer Support |
| Financial Info  | Payment Info                           | ✅               | ❌              | App Functionality                   |
| User Content    | Photos (cartes), Messages              | ✅               | ❌              | App Functionality                   |
| Identifiers     | User ID                                | ✅               | ❌              | App Functionality, Analytics        |
| Identifiers     | Device ID (push token Expo)            | ✅               | ❌              | App Functionality                   |
| Usage Data      | Product Interaction (vues écran, taps) | ❌               | ❌              | Analytics                           |
| Diagnostics     | Crash Data, Performance Data           | ❌               | ❌              | Analytics                           |

`Tracking: NO` — PokeMarket ne fait **pas** de cross-app/site tracking
au sens d'ATT (App Tracking Transparency). Aucun SDK pub, aucun ID partagé
avec d'autres app/sites.

## Détail par catégorie

### Contact Info — Email

- Collectée : oui (signup + connexions)
- Linked to user : oui (clé primaire du profil)
- Tracking : non
- Purposes : `App Functionality`, `Customer Support`

### Contact Info — Name

- Collectée : oui (profil public, nom affiché)
- Linked to user : oui
- Purposes : `App Functionality`

### Contact Info — Physical Address

- Collectée : oui (adresse de livraison)
- Linked to user : oui
- Purposes : `App Functionality` (expédition)

### Contact Info — Phone Number

- Collectée : optionnel (vendeurs)
- Linked to user : oui
- Purposes : `App Functionality`

### Financial Info — Payment Info

- Collectée : indirectement via Stripe (PCI-DSS).
- Linked to user : oui
- Purposes : `App Functionality`
- Note Apple : déclarer "Yes" même si tokenisé via Stripe
  (le user perçoit qu'on collecte sa CB via la PaymentSheet).

### User Content — Photos or Videos

- Collectée : oui (photos de cartes recto/verso)
- Linked to user : oui (vendeur)
- Purposes : `App Functionality`

### User Content — Customer Support

- Collectée : oui (messagerie entre acheteur ↔ vendeur, et avec le support)
- Linked to user : oui
- Purposes : `App Functionality`, `Customer Support`

### Identifiers — User ID

- Collectée : oui (UUID Supabase)
- Linked to user : oui
- Purposes : `App Functionality`, `Analytics`

### Identifiers — Device ID

- Collectée : oui (Expo Push Token)
- Linked to user : oui
- Purposes : `App Functionality` (envoyer les push notifications)

### Usage Data — Product Interaction

- Collectée : oui via Sentry Performance (sample rate 0.2)
- Linked to user : non (anonymisé côté Sentry)
- Purposes : `Analytics`

### Diagnostics — Crash Data

- Collectée : oui via Sentry React Native
- Linked to user : non (anonymisé)
- Purposes : `Analytics`

### Diagnostics — Performance Data

- Collectée : oui via Sentry traces (transactions HTTP, navigation)
- Linked to user : non
- Purposes : `Analytics`

## Données NON collectées

Pour mémoire (à cocher "No" dans le formulaire) :

- Health & Fitness, Sensitive Info, Contacts (carnet d'adresses),
  Browsing History, Search History (autre que dans l'app),
  Other Data Types, Audio Data, Gameplay Content.

## Procédure de mise à jour

1. Modifier ce fichier en PR si on ajoute/retire un SDK ou un endpoint qui
   change la collecte.
2. Mettre à jour `apps/web/src/app/(public)/legal/privacy/page.tsx` en
   miroir.
3. Mettre à jour le formulaire **App Privacy** dans App Store Connect
   _avant_ la prochaine release.
