# Google Play — Data Safety form

> Source de vérité pour la section **Sécurité des données** du Play
> Console. Doit matcher exactement le formulaire iOS (privacy-labels-ios.md)
> et la politique de confidentialité publique.

## 1. Data collection and security

| Question                                                                      | Réponse                                                               |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Does your app collect or share any of the required user data types?           | **Oui**                                                               |
| Is all of the user data collected by your app encrypted in transit?           | **Oui** (HTTPS/TLS partout)                                           |
| Do you provide a way for users to request that their data be deleted?         | **Oui** (depuis Profil > Paramètres + email à privacy@pokemarket.app) |
| Has your app been independently validated against a global security standard? | Non (V1)                                                              |

## 2. Data types collected

### Personal info

| Type          | Collected | Shared | Optional       | Purposes                              |
| ------------- | --------- | ------ | -------------- | ------------------------------------- |
| Name          | ✅        | ❌     | ✅             | App functionality                     |
| Email address | ✅        | ❌     | ❌             | App functionality, Account management |
| User IDs      | ✅        | ❌     | ❌             | App functionality, Analytics          |
| Address       | ✅        | ❌     | ✅ (acheteurs) | App functionality (livraison)         |
| Phone number  | ✅        | ❌     | ✅             | App functionality                     |
| Other info    | ❌        | —      | —              | —                                     |

### Financial info

| Type             | Collected       | Shared                 | Optional | Purposes          |
| ---------------- | --------------- | ---------------------- | -------- | ----------------- |
| Payment info     | ✅ (via Stripe) | ✅ (Stripe processeur) | ❌       | App functionality |
| Purchase history | ✅              | ❌                     | ❌       | App functionality |

> "Shared" pour Stripe car le paiement est traité par un sous-traitant
> distinct (PCI-DSS).

### Messages

| Type            | Collected | Shared | Optional | Purposes          |
| --------------- | --------- | ------ | -------- | ----------------- |
| In-app messages | ✅        | ❌     | ❌       | App functionality |

### Photos and videos

| Type   | Collected | Shared | Optional | Purposes                               |
| ------ | --------- | ------ | -------- | -------------------------------------- |
| Photos | ✅        | ❌     | ❌       | App functionality (annonces de cartes) |

### App activity

| Type                         | Collected              | Shared | Optional | Purposes           |
| ---------------------------- | ---------------------- | ------ | -------- | ------------------ |
| App interactions             | ✅                     | ❌     | ❌       | Analytics (Sentry) |
| In-app search history        | ✅                     | ❌     | ❌       | App functionality  |
| Other user-generated content | ✅ (annonces, reviews) | ❌     | ❌       | App functionality  |

### Device and other identifiers

| Type                                  | Collected | Shared                 | Optional | Purposes          |
| ------------------------------------- | --------- | ---------------------- | -------- | ----------------- |
| Device or other IDs (push token Expo) | ✅        | ✅ (Expo Push Service) | ❌       | App functionality |

### App info and performance

| Type                       | Collected | Shared      | Optional | Purposes  |
| -------------------------- | --------- | ----------- | -------- | --------- |
| Crash logs                 | ✅        | ✅ (Sentry) | ❌       | Analytics |
| Diagnostics                | ✅        | ✅ (Sentry) | ❌       | Analytics |
| Other app performance data | ✅        | ✅ (Sentry) | ❌       | Analytics |

## 3. Data NOT collected

À cocher explicitement comme "Not collected" :

- Location (precise + approximate)
- Web browsing history
- Health and fitness
- Audio
- Files and docs (autres que les images)
- Calendar
- Contacts
- Race / ethnicity / political opinions / religion / sexual orientation
  / gender / Other personal info sensitives

## 4. Notes complémentaires

- Tous les transferts vers les sous-traitants (Stripe, Sentry, Expo Push)
  sont régis par des **DPA** (Data Processing Agreements) signés.
- Hébergement principal : Supabase EU (Francfort).
- Les sourcemaps Sentry n'incluent pas les variables d'environnement.
- Push tokens : nettoyés automatiquement quand Expo retourne
  `DeviceNotRegistered` (cf. `apps/web/src/lib/push/send.ts`).
