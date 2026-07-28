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

| Variable                              | Usage                                                       |
| ------------------------------------- | ----------------------------------------------------------- |
| `STRIPE_PAYMENTS_API_KEY`             | RAK paiements/clients/Checkout uniquement                   |
| `STRIPE_CONNECT_API_KEY`              | RAK onboarding et lecture Accounts v2 uniquement            |
| `STRIPE_OPERATIONS_API_KEY`           | RAK refunds/transfers/payouts/disputes uniquement           |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`  | Clé publique Stripe.js                                      |
| `STRIPE_WEBHOOK_SECRET`               | Secret du webhook paiements v1                              |
| `STRIPE_CONNECT_WEBHOOK_SECRET`       | Secret de l'event destination Accounts v2                   |
| `STRIPE_WEBHOOK_IP_ALLOWLIST`         | IP webhook Stripe, séparées par virgules                    |
| `STRIPE_CHECKOUT_ENABLED`             | Feature gate serveur, absent = fermé en production          |
| `STRIPE_SOFT_LAUNCH_MAX_AMOUNT_MINOR` | Plafond optionnel d'une commande en centimes                |
| `STRIPE_SOFT_LAUNCH_BUYER_IDS`        | Cohorte optionnelle d'UUID acheteurs, séparés par virgules  |
| `SUPPORT_EMAIL`                       | Adresse surveillée affichée pendant l'onboarding            |
| `NEXT_PUBLIC_APP_URL`                 | Origine canonique HTTPS                                     |
| `CHECKOUT_ALLOWED_ORIGINS`            | Origines supplémentaires exactes, séparées par des virgules |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`  | Clé publique PaymentSheet mobile                            |

Les variables serveur sont validées au démarrage Node par
`apps/web/src/instrumentation.ts`. Les clés réelles vivent uniquement dans les
fichiers locaux non suivis ou le gestionnaire de secrets du déploiement. Les
exemples du dépôt ne contiennent que des placeholders.

En dehors du développement et des tests, les trois clés serveur doivent être
des restricted keys `rk_`; une clé générale `sk_` fait échouer le démarrage.
Créer une clé distincte par environnement **et** par service, puis appliquer
les droits minimaux suivants dans Workbench :

| Clé        | Écriture                                                                     | Lecture                                    |
| ---------- | ---------------------------------------------------------------------------- | ------------------------------------------ |
| Payments   | Customers, Checkout Sessions, PaymentIntents, PaymentMethods, Ephemeral Keys | Charges, PaymentIntents, Checkout Sessions |
| Connect    | Accounts v2, Account Links, Account Sessions, Login Links                    | Accounts v2                                |
| Operations | Refunds, Transfers, Transfer Reversals, Payouts, Disputes                    | Charges, Transfers, Payouts, Disputes      |

Procédure de rotation :

1. créer la nouvelle RAK en sandbox avec les mêmes droits et une restriction
   d'accès propre au service ;
2. la déployer sur staging, surveiller les `403` dans Workbench et Sentry ;
3. créer l'équivalent live, remplacer la variable sensible Vercel puis
   redéployer ;
4. révoquer l'ancienne clé après le smoke test et conserver la date de rotation
   dans le journal d'exploitation.

Le hook pre-commit et la CI exécutent `npm run scan:secrets`. Toute détection
impose de révoquer la valeur avant de poursuivre, même si le commit a été
annulé.

## Sécurité réseau et navigateur

- Chaque webhook vérifie d'abord l'IP transmise par
  `x-vercel-forwarded-for`, puis la signature Stripe sur le corps brut.
- `STRIPE_WEBHOOK_IP_ALLOWLIST` doit rester synchronisée avec
  `https://stripe.com/files/ips/ips_webhooks.txt`; son absence bloque le
  démarrage hors développement.
- Le CSP autorise explicitement Stripe.js, Stripe-hosted UI et Link via
  `*.stripe.com`, `*.stripe.network` et `*.link.com`. `object-src` et
  `frame-ancestors` valent `none`; `unsafe-eval` est limité au développement.
- Les secrets webhook et RAK ne sont jamais exposés au web ou au mobile. Les
  clients reçoivent uniquement des clés publiables, client secrets et
  ephemeral keys à durée courte.
- Les erreurs financières sont envoyées à Sentry sans cookies, Authorization
  ni `stripe-signature`; les réponses publiques et logs ne renvoient pas
  l'objet d'erreur Stripe brut.
- Checkout, payout et actions admin échouent en `503` si Upstash est absent ou
  indisponible hors développement/test. Les refus `429` et indisponibilités
  sont tagués dans Sentry.

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
- `refund.created`
- `refund.updated`
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

### Redelivery

1. Dans Stripe Workbench, ouvrir l'événement échoué et conserver son `event_id`,
   son type, le Request ID et l'erreur Sentry associée.
2. Corriger la cause avant redelivery. Ne jamais supprimer manuellement une
   écriture ledger ou créer un deuxième objet Stripe.
3. Utiliser **Resend event**. En cas d'échec handler, la claim
   `stripe_webhooks_processed` a été supprimée et l'événement est rejouable ;
   un événement déjà traité répond `duplicate: true`.
4. Vérifier la convergence dans `/admin/finance`, puis rapprocher l'objet Stripe,
   la transaction, le journal ledger et le job outbox.
5. Si l'événement ne peut plus être redélivré, lancer la procédure de
   réconciliation avec l'identifiant Stripe existant. Ne jamais reconstruire
   un mouvement financier à partir d'un montant saisi manuellement.

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
journal équilibré et passe la commande à `reversed`.

### Remboursements, litiges et dette vendeur

`charge.refunded` transmet le cumul Stripe en centimes à
`apply_stripe_refund`. La RPC calcule la part vendeur cible avant/après : la
livraison n'est donc jamais réappliquée lors de remboursements partiels
successifs. Avant transfert, elle débite le ledger. Après transfert, elle crée
une `financial_recovery` et un job durable de transfer reversal. Après payout,
elle comptabilise une dette vendeur et bloque tout nouveau retrait.
Si le transfert est encore en file, la transaction annule atomiquement son job.
Un handshake juste avant l'appel Stripe force le webhook à réessayer plutôt que
de laisser échapper un transfert dont l'issue réseau est encore inconnue.

`charge.dispute.created` place la part contestée dans `seller_locked`, ou
demande une reversal si les fonds sont déjà chez le compte connecté. Un litige
gagné restaure le ledger et retransfère les fonds si nécessaire ; un litige
perdu consomme le verrou. `consumed_minor` rapproche litiges et remboursements
pour qu'un même euro ne soit jamais débité deux fois.

Les crédits de ventes ultérieures remboursent automatiquement `seller_debt`
avant d'alimenter `seller_pending`. `seller_risk_accounts` expose la dette, les
fonds verrouillés, le blocage payout et les seuils d'alerte. L'admin
`/admin/disputes` est alimenté par `stripe_disputes`, trié par
`evidence_due_by`, et permet de préparer/envoyer les preuves ou d'accepter le
chargeback. Chaque décision est écrite dans `admin_audit_log`.

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

### Runbook refunds et disputes

1. Traiter d'abord les `stripe_disputes` en `needs_response` par
   `evidence_due_by`; une échéance sous 72 h est prioritaire.
2. Pour une `financial_recovery` `failed`, vérifier sur Stripe la reversal ou
   le retransfer avec sa clé déterministe avant de relancer le cron.
3. Comparer `transactions.refunded_amount_minor`,
   `seller_refund_target_minor`, `seller_refunded_minor` et les
   `stripe_disputes.consumed_minor`; leur rapprochement doit expliquer chaque
   journal `refund_applied` ou `dispute_lost`.
4. Toute ligne `seller_risk_accounts.payouts_blocked = true` reste bloquée
   jusqu'à dette nulle. Ne jamais débloquer manuellement sans journal
   compensatoire et trace `admin_audit_log`.

### Surveillance et alertes

Le cron `GET /api/cron/monitor-financial-operations`, exécuté toutes les cinq
minutes, groupe les signaux sous les fingerprints Sentry
`financial-operations-monitor` et `financial-operations-risk-monitor`.
Configurer dans Sentry une alerte immédiate pour le niveau `error` et une
notification ouvrée pour le niveau `warning`.

Le tableau `/admin/finance` expose :

- outbox financière échouée, en retard ou avec lease expiré ;
- écarts détectés par `financial_reconciliation_alerts` entre transactions,
  ledger et identifiants Stripe ;
- `financial_recoveries` échouées, dettes vendeurs et payouts bloqués ;
- remboursements dont la cible vendeur n'est pas encore recouvrée ;
- preuves de litige dues, avec priorité à moins de 72 heures ;
- payouts bancaires échoués.

Réponse d'astreinte :

1. suspendre les sorties si un écart de rapprochement ou plusieurs jobs
   financiers bloqués sont signalés ;
2. noter les IDs sans copier de secret, examiner Sentry et Stripe Workbench ;
3. rejouer le cron ou le webhook avec la même clé d'idempotence ;
4. vérifier `/admin/finance` puis `npm run reconcile:ledger
--workspace=@pokemarket/web` ;
5. ne rouvrir les payouts qu'après disparition des écarts et journalisation de
   la décision.

En cas d'indisponibilité Upstash, checkout, payout et mutations admin répondent
`503` avec `Retry-After: 60`. Ne pas contourner le garde-fou : vérifier l'état
Upstash, les quotas et les variables de l'environnement concerné, restaurer le
service, puis confirmer dans Sentry que les événements `failure_mode=closed`
cessent avant de reprendre les opérations.

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

La matrice de recette, les commandes automatisées, le feature gate et la
décision go/no-go sont maintenus dans
[`docs/STRIPE_LAUNCH.md`](./STRIPE_LAUNCH.md).

- [ ] Revue juridique des CGV et du statut merchant of record
- [ ] Responsabilité TVA validée avant toute activation de Stripe Tax
- [ ] Accounts v2 recipient et événements validés en sandbox
- [ ] Restricted keys minimales, séparées par environnement
- [ ] Restrictions d'accès RAK et rotation testées dans Workbench
- [ ] Webhook live créé avec tous les événements requis
- [ ] IP webhook live synchronisées avec la liste Stripe officielle
- [ ] Alertes Sentry `financial-operations-*` routées vers l'astreinte
- [ ] `SUPPORT_EMAIL` surveillé
- [ ] Carte, 3DS, paiement différé, refund, dispute, transfert et payout testés
- [ ] Réconciliation Stripe ↔ transactions ↔ ledger sans écart
