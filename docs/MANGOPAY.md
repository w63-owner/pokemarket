# MangoPay Setup & Operations Runbook

## Vue d'ensemble

PokeMarket utilise MangoPay (licence EMI europeenne) pour gerer tous les flux financiers :
- KYC progressif (NONE → LIGHT → REGULAR)
- Wallets escrow (acheteur paie → wallet plateforme → wallet vendeur apres confirmation)
- Payouts SEPA vers IBAN vendeur
- Gestion DAC7 et conformite AMLD5

## 0. Prerequis manuels (a faire AVANT toute integration)

### 0.1 Creer un compte sandbox MangoPay

1. Aller sur https://hub.mangopay.com/signup
2. Creer un compte avec l'email pro de PokeMarket
3. Choisir "Marketplace" comme business type
4. Verifier l'email et se connecter au dashboard
5. Recuperer dans **Developers > API Keys** :
   - `Client ID`
   - `API Key` (sandbox)
6. Note : le sandbox est gratuit et instant

### 0.2 Lancer la demande d'approbation production (CRITICAL PATH 2-6 semaines)

1. Dans le dashboard sandbox, ouvrir **Production Access**
2. Remplir le formulaire commercial avec :
   - Business plan / pitch deck
   - URL de l'app (peut etre un soft launch landing page)
   - Estimation volume mensuel (GMV) sur 12 mois
   - Pays cible (FR initialement)
   - MCC souhaite : 7372 (Computer Software / Marketplaces) ou 5945 (Hobby/Toy)
3. Documents KYC plateforme requis :
   - CNI ou passeport du dirigeant
   - K-bis (< 3 mois)
   - Statuts signes
   - RIB de la societe
4. Premiere reponse commerciale sous 5-10 jours ouvres
5. Validation finale + creation de l'environnement prod : 2-6 semaines

### 0.3 Wallet plateforme

Apres signup sandbox, creer (UNE FOIS) un wallet plateforme via le smoke test (`scripts/mangopay-smoke-test.ts`) ou directement via API :

```bash
curl -X POST https://api.sandbox.mangopay.com/v2.01/{client_id}/users/natural \
  -H "Authorization: Basic ..." \
  -d '{"FirstName":"PokeMarket","LastName":"Platform",...}'
```

Recuperer le `Id` retourne et le mettre dans `MANGOPAY_PLATFORM_USER_ID`. Pareil pour le wallet plateforme dans `MANGOPAY_PLATFORM_WALLET_ID`.

## 1. Variables d'environnement

| Variable | Utilisation | Sandbox | Production |
|---|---|---|---|
| `MANGOPAY_CLIENT_ID` | Identifiant client API | depuis dashboard sandbox | depuis dashboard prod |
| `MANGOPAY_API_KEY` | Cle secrete API | depuis dashboard sandbox | depuis dashboard prod |
| `MANGOPAY_BASE_URL` | URL API | `https://api.sandbox.mangopay.com` | `https://api.mangopay.com` |
| `MANGOPAY_WEBHOOK_SECRET` | Secret HMAC signature webhook | a generer et configurer | idem |
| `MANGOPAY_PLATFORM_USER_ID` | Id du NaturalUser plateforme (PokeMarket) | depuis smoke test | depuis setup prod |
| `MANGOPAY_PLATFORM_WALLET_ID` | Id du wallet plateforme (recoit les PayIns) | depuis smoke test | depuis setup prod |
| `NEXT_PUBLIC_MANGOPAY_CLIENT_ID` | Expose au client pour CardRegistration | meme valeur que serveur | meme valeur que serveur |

## 2. Configuration des webhooks

MangoPay envoie un webhook par event type (different de Stripe qui regroupe tout sur un endpoint).

### En dev (avec ngrok)

```bash
ngrok http 3000
# Recuperer l'URL https publique : https://abcd1234.ngrok-free.app
```

Puis configurer chaque event dans le dashboard MangoPay avec l'URL :
`https://abcd1234.ngrok-free.app/api/webhooks/mangopay?eventType={EVENT_TYPE}`

Events a enregistrer :
- `KYC_SUCCEEDED`, `KYC_FAILED`, `KYC_OUTDATED`
- `IDENTITY_PROOF_VALIDATED`, `IDENTITY_PROOF_REFUSED`
- `PAYIN_NORMAL_SUCCEEDED`, `PAYIN_NORMAL_FAILED`, `PAYIN_NORMAL_CREATED`
- `TRANSFER_NORMAL_SUCCEEDED`, `TRANSFER_NORMAL_FAILED`
- `PAYOUT_NORMAL_SUCCEEDED`, `PAYOUT_NORMAL_FAILED`
- `REFUND_NORMAL_SUCCEEDED`, `REFUND_NORMAL_FAILED`
- `DISPUTE_CREATED`, `DISPUTE_FUNDS_CHECKED_OUT`, `DISPUTE_CLOSED`

### En production

Meme principe avec l'URL de prod : `https://pokemarket.fr/api/webhooks/mangopay?eventType=...`.

Configurer le **secret HMAC** dans MangoPay (Developers > Webhooks > Secret) et le copier dans `MANGOPAY_WEBHOOK_SECRET`.

## 3. Cartes de test sandbox

| Numero | Comportement |
|---|---|
| `4970103181088864` | Paiement OK, pas de 3DS |
| `4970107111111119` | Paiement OK avec 3DS challenge |
| `4970109999999979` | Paiement refuse (insufficient funds) |

Date d'expiration : nimporte quelle date future. CVV : `123`.

Pour le 3DS challenge en sandbox : code `1234`.

## 4. KYC en sandbox

En sandbox, MangoPay accepte n'importe quel document image valide (PNG/JPG < 7Mo). Pour les tests :
- Upload n'importe quelle photo de CNI (peut etre un faux)
- L'analyse retourne `VALIDATION_ASKED` puis manuellement on peut force `VALIDATED` via API

En production, validation reelle par les analystes MangoPay (24-48h).

## 5. Debug commun

### Le webhook ne se declenche pas

1. Verifier dans dashboard > Developers > Webhooks que l'URL est bien enregistree pour ce type d'event
2. Verifier les logs : `Logs > Hooks` pour voir les tentatives + reponses HTTP
3. MangoPay retry 3 fois sur 24h si non-200

### "Invalid signature"

1. Verifier que `MANGOPAY_WEBHOOK_SECRET` correspond a celui configure dans le dashboard
2. Verifier qu'on lit `req.text()` AVANT toute parsing JSON (sinon body re-encode != signature)
3. Le header est `X-Mangopay-Signature` (case-insensitive en JS standard)

### "Resource not found" sur PayIn

1. Verifier que le `CardId` n'est pas expire (les cartes sandbox expirent rapidement)
2. Verifier que le `CreditedWalletId` correspond bien au wallet plateforme prod/sandbox du bon environnement

## 6. Smoke test sandbox

Avant chaque deploiement majeur, lancer :

```bash
tsx scripts/mangopay-smoke-test.ts
```

Ce script verifie :
- Authentification OAuth
- Creation NaturalUser
- Creation Wallet
- CardRegistration + tokenisation
- PayIn 100 EUR avec carte test
- Lookup PayIn -> verification statut SUCCEEDED

## 7. Migration depuis Stripe (historique)

Cette migration est documentee dans `docs/adr/001-stripe-to-mangopay.md`. Resume :
- Greenfield migration (pas de donnees prod a migrer)
- Tous les `stripe_*` ID ont ete supprimes via migrations 00048-00054
- L'integration Stripe a ete supprimee dans la Phase 9 du plan

## 8. Conformite

### DAC7

Voir `docs/COMPLIANCE.md` pour le runbook annuel d'export DAC7 et la procedure DGFiP.

### KYC progressif

| Niveau | Limite cumulative 12 mois | Documents requis |
|---|---|---|
| `NONE` | 2500 EUR cumulative | email + telephone verifies |
| `LIGHT` | 5000 EUR / 12 mois | + adresse + selfie |
| `REGULAR` | Illimite | + CNI + justif domicile |

Les wallets MangoPay refusent les depots qui depasseraient le seuil.

### PCI-DSS

PokeMarket utilise le pattern **CardRegistration** : les donnees carte sont envoyees **directement** depuis le navigateur vers MangoPay (jamais via notre serveur). Cela nous garde en scope **SAQ-A** (le moins exigeant). Verifier que :
- `cardNumber`, `cardExpirationDate`, `cardCvx` ne transitent JAMAIS par nos APIs
- Le formulaire envoie via `fetch(cardRegistrationURL, ...)` ou via le SDK MangoPay JS officiel
