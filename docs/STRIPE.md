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
`2026-02-25.clover`, version typée par `stripe@20.4.1`.

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

Pendant la transition Accounts v1, `capabilities.transfers === "active"` est
toléré. `charges_enabled` et `payouts_enabled` ne sont jamais des signaux de
readiness métier pour un compte recipient.

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
| `STRIPE_WEBHOOK_SECRET`              | Secret de signature `whsec_`                                |
| `STRIPE_CONNECT_DEFAULT_COUNTRY`     | Pays ISO alpha-2, `FR` par défaut                           |
| `SUPPORT_EMAIL`                      | Adresse surveillée affichée pendant l'onboarding            |
| `NEXT_PUBLIC_APP_URL`                | Origine canonique HTTPS                                     |
| `CHECKOUT_ALLOWED_ORIGINS`           | Origines supplémentaires exactes, séparées par des virgules |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Clé publique PaymentSheet mobile                            |

Les variables serveur sont validées au démarrage Node par
`apps/web/src/instrumentation.ts`. Les clés réelles vivent uniquement dans les
fichiers locaux non suivis ou le gestionnaire de secrets du déploiement. Les
exemples du dépôt ne contiennent que des placeholders.

## Webhook

Endpoint unique : `POST /api/webhooks/stripe`.

Événements actuellement requis :

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `payment_intent.canceled`
- `account.updated` pendant la transition Accounts v1
- `charge.refunded`
- `charge.dispute.created`
- `charge.dispute.updated`
- `charge.dispute.closed`
- `payout.paid`
- `payout.failed`

La signature Stripe est toujours vérifiée sur le corps brut. Les événements
Accounts v2 seront ajoutés après leur vérification effective en sandbox.

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
`transfer_requested`. La table `wallets` est uniquement une projection lisible
par l'utilisateur.

Le cron `GET /api/cron/reconcile-financial-ledger` :

1. réclame les événements avec lease, jeton propriétaire et
   `FOR UPDATE SKIP LOCKED` ;
2. matérialise les messages et notifications avec des clés idempotentes ;
3. réessaie avec backoff sans recréditer le vendeur.

Les soldes éventuellement présents lors de la migration deviennent des
journaux d'ouverture. Tant que les flux refund, dispute et payout ne sont pas
encore migrés vers leurs RPC dédiées (sprints 4 et 5), un trigger de compatibilité
convertit chaque mutation backend de `wallets` en journal équilibré. Une
reconstruction ne peut donc pas ressusciter un débit. Les événements
`transfer_requested` restent volontairement en attente jusqu'au worker Stripe
du sprint 4.

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
