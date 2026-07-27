# Stripe — architecture financière et runbook

Stripe est l'unique prestataire de paiement de PokeMarket. La plateforme
encaisse les acheteurs puis transfère les fonds aux vendeurs après réception.

## Décisions non négociables

- PokeMarket est le `merchant of record` du paiement : la plateforme encaisse
  l'acheteur et porte les frais Stripe, remboursements, litiges et soldes
  négatifs. Le vendeur reste le vendeur juridique de la carte.
- Le modèle est `separate charges and transfers`. La commission est retenue
  dans le montant transféré ; aucun `application_fee_amount` n'est utilisé.
- Les comptes vendeurs cibles sont des Accounts v2 `recipient`, avec Dashboard
  Express et capability
  `configuration.recipient.capabilities.stripe_balance.stripe_transfers`.
- Stripe Tax reste désactivé jusqu'à validation écrite de la responsabilité
  TVA, des immatriculations nécessaires et du traitement des vendeurs
  particuliers et professionnels.
- Stripe n'est pas un service de séquestre réglementé. La temporisation avant
  transfert est une règle interne de disponibilité et de risque.

La formulation juridique des CGV doit être validée par un conseil avant le
go-live.

## Invariants financiers

| Invariant             | Contrôle attendu                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Unité monétaire       | Tout mouvement comptable est un entier en centimes ; aucune valeur flottante dans le futur ledger.                                  |
| Traçabilité           | Chaque mouvement Stripe produit exactement une écriture métier idempotente, référencée par ses identifiants Stripe et métier.       |
| Équilibre             | Une opération financière produit des écritures équilibrées ; la somme des débits et crédits vaut zéro.                              |
| Tentative active      | Une transaction possède au plus une tentative de paiement active ; toute tentative remplacée est expirée ou annulée.                |
| Source de vérité      | Seul un webhook Stripe signé finalise un paiement asynchrone ; une réponse client ne crédite jamais un vendeur.                     |
| Libération            | Le montant vendeur inclut prix et livraison dus, après commission, sans dépasser les fonds reçus.                                   |
| Transfert puis payout | Aucun payout bancaire n'est créé avant un transfert plateforme → compte connecté réussi et persisté.                                |
| Idempotence           | Customer, Checkout Session, PaymentIntent, refund, transfert et payout utilisent des clés stables dérivées des identifiants métier. |
| Échec                 | Une insuffisance ou un état incohérent échoue explicitement ; aucun warning ne vaut succès financier.                               |

## Version API

Le backend et les ephemeral keys PaymentSheet utilisent l'unique constante
`STRIPE_API_VERSION` dans `apps/web/src/lib/env.ts`, actuellement
`2026-06-24.dahlia`, version typée par `stripe@22.3.2`.

Les SDK mobiles Stripe sont compatibles avec les versions API backend sauf
mention contraire. Toute montée de version Node ou React Native doit mettre à
jour cette constante dans le même changement puis être validée en sandbox.
Aucun override de version par environnement n'est autorisé.

## Configuration cible Connect

- Dashboard : `express`
- Collecteur des frais : `application` (PokeMarket)
- Responsable des pertes/soldes négatifs : `application` (PokeMarket)
- Configuration : `recipient` uniquement
- Capability : `stripe_balance.stripe_transfers`
- Encaissement : plateforme PokeMarket
- Transfert : différé jusqu'à la réception
- Payout : seulement après transfert réussi

La readiness métier provient exclusivement de
`configuration.recipient.capabilities.stripe_balance.stripe_transfers.status`.
`charges_enabled`, `payouts_enabled` et `capabilities.transfers` ne sont jamais
consultés.

Le web expose `notification_banner`, `account_management` et `payouts` par une
Account Session courte durée, et utilise l'onboarding hébergé. Le mobile reste
sur l'onboarding hébergé afin de conserver la version Stripe officiellement
compatible avec Expo SDK 54 ; les retours HTTPS sont relayés vers
`pokemarket://wallet/return` et les liens expirés vers
`pokemarket://wallet/refresh`. L'accès mobile au Dashboard Express utilise un
login link à usage unique. Les URLs et secrets temporaires ne sont ni
persistés ni journalisés.

## Vérification sandbox

Vérifié le 26 juillet 2026 :

- [x] Sandbox PokeMarket distincte du mode test historique et du compte live.
- [x] `POST /v2/core/accounts` accessible sans activation préalable.
- [x] Recipient français jetable créé avec Dashboard Express,
      `fees_collector=application`, `losses_collector=application` et
      `stripe_balance.stripe_transfers`.
- [x] Après onboarding hébergé, `stripe_transfers` et `payouts` sont `active`;
      aucune exigence `currently_due` ou `past_due`.
- [x] Les comptes jetables ont été fermés après validation.

`requirements.summary.minimum_deadline.status` vaut `eventually_due`. Cette
situation n'empêche pas les transferts, mais impose d'écouter les changements
d'exigences et d'afficher le composant Connect `notification_banner`.

Événements Accounts v2 observés pour le parcours recipient :

- `v2.core.account.created`
- `v2.core.account[configuration.recipient].updated`
- `v2.core.account[configuration.recipient].capability_status_updated`
- `v2.core.account[requirements].updated`
- `v2.core.account[identity].updated`
- `v2.core.account[defaults].updated`
- `v2.core.account_link.returned`
- `v2.core.account_person.created`
- `v2.core.account_person.updated`

## Variables d'environnement

| Variable                             | Usage                                                       |
| ------------------------------------ | ----------------------------------------------------------- |
| `STRIPE_SECRET_KEY`                  | Clé serveur ; préférer une restricted key `rk_` minimale    |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Clé publique Stripe.js                                      |
| `STRIPE_WEBHOOK_SECRET`              | Secret du webhook paiements v1                              |
| `STRIPE_CONNECT_WEBHOOK_SECRET`      | Secret de l'event destination Accounts v2                   |
| `SUPPORT_EMAIL`                      | Adresse surveillée affichée pendant l'onboarding            |
| `NEXT_PUBLIC_APP_URL`                | Origine canonique HTTPS                                     |
| `CHECKOUT_ALLOWED_ORIGINS`           | Origines supplémentaires exactes, séparées par des virgules |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Clé publique PaymentSheet mobile                            |

Les variables serveur sont validées au démarrage Node par
`apps/web/src/instrumentation.ts`. Les clés réelles vivent uniquement dans les
fichiers locaux non suivis ou le gestionnaire de secrets du déploiement. Les
exemples du dépôt ne contiennent que des placeholders.

## Webhook

Endpoints :

- `POST /api/webhooks/stripe` pour les événements paiements v1 ;
- `POST /api/webhooks/stripe/accounts-v2` pour les event notifications
  Accounts v2.

Événements actuellement requis :

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `payment_intent.canceled`
- `charge.refunded`
- `charge.dispute.created`
- `charge.dispute.updated`
- `charge.dispute.closed`
- `transfer.created`
- `transfer.reversed`
- `payout.created`
- `payout.updated`
- `payout.paid`
- `payout.failed`
- `payout.canceled`

L'event destination Accounts v2 doit livrer :

- `v2.core.account.created`
- `v2.core.account.updated`
- `v2.core.account[configuration.recipient].updated`
- `v2.core.account[configuration.recipient].capability_status_updated`
- `v2.core.account[requirements].updated`

Chaque signature est vérifiée sur le corps brut avec le secret de son endpoint.
Le handler relit ensuite l'Account v2 avec `configuration.recipient` et
`requirements` inclus avant de mettre à jour le statut KYC local.

### Recréation sandbox

Il n'existe aucun compte Connect réel à migrer. Avant de valider ce sprint,
fermer les anciens comptes v1 de la sandbox, remettre
`profiles.stripe_account_id` à `NULL` pour les profils de test, puis refaire un
parcours particulier et un parcours professionnel. Ne jamais exécuter cette
procédure sur un environnement contenant des vendeurs réels.

## Ledger et reprise financière

Le ledger Postgres est la source comptable. Chaque journal possède une clé
métier unique et des écritures en centimes dont la somme vaut zéro. Les tables
`ledger_accounts`, `ledger_transactions` et `ledger_entries` sont privées par
RLS et protégées contre tout `UPDATE` ou `DELETE`.
Les identifiants PaymentIntent/Charge arrivant après la première finalisation
sont ajoutés dans `stripe_object_bindings`, lui aussi immuable ; un retry peut
ainsi enrichir la transaction sans modifier son journal comptable.

`finalize_paid_transaction` regroupe dans une seule transaction SQL le passage
à `PAID`, la vente de l'annonce, l'expiration des offres, le crédit pending et
l'événement durable `payment_finalized`. `release_escrow_funds` déplace le
montant du compte pending vers available et crée atomiquement
`transfer_requested` ainsi qu'une ligne `seller_transfers` à l'état `queued`.
La table `wallets` est uniquement une projection lisible par l'utilisateur.

Le cron `GET /api/cron/reconcile-financial-ledger` :

1. réclame les événements avec lease, jeton propriétaire et
   `FOR UPDATE SKIP LOCKED` ;
2. matérialise les messages et notifications avec des clés idempotentes ;
3. réessaie avec backoff sans recréditer le vendeur.

Le cron `GET /api/cron/process-transfer-requests` réclame séparément les jobs
`transfer_requested`. Il crée exactement un Transfer Stripe par commande avec
`source_transaction=ch_*`, `transfer_group=order_<transaction_id>`, metadata
métier et clé `order-transfer-<transaction_id>`. Le succès déplace le ledger de
`seller_available` vers `seller_connected` sans changer le solde retirable, et
persiste `stripe_transfer_id` sur le journal immuable. Une erreur remet le job
dans l'outbox avec lease et backoff ; une reprise réseau réutilise la même clé
Stripe.

Un retrait bancaire est une opération distincte. `reserve_seller_payout`
sélectionne uniquement des transferts déjà réussis et arrivés à maturité,
insère `payouts` et `payout_items`, puis déplace atomiquement les montants vers
`seller_payout_pending` avant tout appel Stripe. Les réglages par défaut sont :

- calendrier Stripe `manual` ;
- délai de risque de 2 jours après le transfert ;
- minimum de retrait de 10 EUR ;
- réserve permanente de 5 EUR.

Ils vivent dans `financial_payout_config` et se modifient par migration
contrôlée. Un `payout.failed` ou `payout.canceled` restaure les fonds via une RPC
idempotente ; `payout.paid` les clôture. Les événements terminaux tardifs ne
peuvent pas rétrograder un payout déjà finalisé. `transfer.reversed` produit un
journal équilibré et passe la commande à `reversed` en attendant le
recouvrement complet du sprint 5.

Les soldes éventuellement présents lors de la migration deviennent des
journaux d'ouverture. Tant que les flux refund, dispute et payout ne sont pas
encore tous migrés vers leurs RPC dédiées (sprint 5), un trigger de
compatibilité convertit chaque mutation backend restante de `wallets` en
journal équilibré. Une reconstruction ne peut donc pas ressusciter un débit.

### Runbook transferts et payouts

1. Lister les `financial_outbox` `transfer_requested` en `FAILED` ou dont le
   lease `PROCESSING` est expiré, puis contrôler la ligne `seller_transfers`.
2. Si Stripe contient déjà `stripe_transfer_id`, relancer le cron : la clé
   déterministe récupère le même objet et finalise la base sans double débit.
3. Pour un payout `pending` sans identifiant après une erreur réseau, ne pas
   créer un nouvel objet manuellement : le cron rejoue `executeReservedPayout`
   avec `seller-payout-<payout_id>`.
4. Comparer le montant de chaque Transfer à la charge `source_transaction`, à
   `seller_transfers.amount_minor`, aux `payout_items` et aux journaux ledger.
5. Ne jamais corriger `wallets` directement. En cas d'écart, suspendre les
   payouts, conserver les identifiants Stripe/Sentry, puis corriger par une RPC
   et un journal compensatoire.

Une commande déjà `PAID` ou `SHIPPED` sans journal de paiement est bloquée avec
`MISSING_PAYMENT_LEDGER` plutôt que reconstituée heuristiquement. Comme aucune
donnée financière réelle n'existe, les anciennes commandes sandbox doivent
être recréées ; aucun backfill partiel n'est autorisé.

Reconstruction manuelle des projections, pour tous les vendeurs ou un vendeur :

```bash
npm run reconcile:ledger --workspace=@pokemarket/web
npm run reconcile:ledger --workspace=@pokemarket/web -- <user-uuid>
```

Cette commande exige la clé `service_role` et ne contacte jamais Stripe. Avant
de l'exécuter en production, comparer les totaux des journaux, transactions et
objets Stripe puis conserver la sortie dans le journal d'incident.

### Test local

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Copier le `whsec_` temporaire affiché dans `.env.local`, puis utiliser
`stripe trigger <event>` pour les événements v1 pris en charge.

## Checklist avant go-live

- [ ] Revue juridique des CGV et du statut merchant of record
- [ ] Responsabilité TVA validée avant toute activation de Stripe Tax
- [ ] Accounts v2 recipient et événements validés en sandbox
- [ ] Restricted keys minimales, séparées par environnement
- [ ] Webhook live créé avec tous les événements requis
- [ ] `SUPPORT_EMAIL` surveillé
- [ ] Carte, 3DS, paiement différé, refund, dispute, transfert et payout testés
- [ ] Réconciliation Stripe ↔ transactions ↔ ledger sans écart
