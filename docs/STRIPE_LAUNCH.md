# Stripe — validation de lancement

Ce document est la preuve de recette du soft launch. Une case ne peut être
cochée qu'après exécution sur l'environnement indiqué, avec les identifiants
Stripe, Supabase et Sentry conservés dans le journal d'exploitation (jamais
leurs secrets).

## Validation automatisée

Depuis la racine :

```bash
npm run scan:secrets
npm run format:check
npm run lint
npm run type-check
npm run test
npm run build
```

Avec Docker démarré :

```bash
cd apps/web
npx supabase db reset
npx supabase test db
npx supabase db lint --level warning
```

La suite pgTAP couvre l'équilibre du ledger, son immutabilité, les projections
reconstructibles, les remboursements partiels successifs, les litiges, les
reversals, les leases, les retries et les événements payout hors ordre.
`stripe_launch_readiness.test.sql` vérifie en plus RLS, les privilèges des
tables financières, l'absence d'écart et l'absence de dette vendeur.

Avant chaque déploiement staging ou live, exécuter la réconciliation avec les
variables de l'environnement cible :

```bash
npm run validate:stripe-launch --workspace=@deckdealr/web
```

La commande refuse une RAK live sans `--allow-live`. Elle compare chaque
transaction financière à sa charge Stripe, chaque journal à zéro, les refunds
cumulés, les metadata métier et chaque Transfer à sa destination,
`source_transaction`, `transfer_group` et montant en base. Toute différence
termine avec un code non nul.

## E2E Stripe Sandbox

Préparer deux acheteurs, un vendeur particulier et un vendeur professionnel
jetables. Les comptes Connect doivent être des Accounts v2 recipient et être
fermés après la recette.

Lancer le webhook local :

```bash
stripe listen \
  --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired,payment_intent.succeeded,payment_intent.payment_failed,payment_intent.canceled,charge.refunded,refund.updated,charge.dispute.created,charge.dispute.updated,charge.dispute.closed,transfer.created,transfer.reversed,payout.created,payout.updated,payout.paid,payout.failed,payout.canceled \
  --forward-to localhost:3000/api/webhooks/stripe
```

Pour chaque scénario, conserver l'ID transaction, `cs_` ou `pi_`, `ch_`,
`tr_`, `po_`, les événements reçus et le résultat de la réconciliation :

- [ ] Web — carte `4242 4242 4242 4242`, paiement et réception complète.
- [ ] Web — carte 3DS `4000 0025 0000 3155`, succès puis abandon du challenge.
- [ ] Web — carte refusée `4000 0000 0000 9995`, retry sans nouvelle
      transaction payable.
- [ ] Web — moyen différé activé dans la Payment Method Configuration :
      `completed/unpaid`, puis succès et échec asynchrones.
- [ ] Web — abandon de Checkout puis expiration et déverrouillage de l'annonce.
- [ ] Web — deux remboursements partiels successifs puis remboursement total.
- [ ] Connect — litige créé, gagné, puis un second perdu sans double débit.
- [ ] Connect — reversal avant payout et dette vendeur après payout.
- [ ] Connect — payout failed/canceled, fonds restaurés une seule fois, puis
      événement paid tardif sans régression.
- [ ] Mobile iOS physique — carte, 3DS, Apple Pay Sandbox et retour
      `deckdealr://stripe-redirect`.
- [ ] Mobile Android physique — carte, 3DS, Google Pay test et même retour.
- [ ] Mobile — onboarding particulier/professionnel, puis deep links
      `deckdealr://wallet/return` et `deckdealr://wallet/refresh`.
- [ ] Redélivrer un événement réussi et un événement précédemment échoué ;
      confirmer respectivement no-op et reprise.
- [ ] `validate:stripe-launch` retourne zéro écart après chaque séquence.

Apple Pay et Google Pay exigent un build EAS sur appareil compatible. Ils ne
peuvent pas être déclarés validés par Vitest, Playwright ou Stripe CLI.

## Feature gate et plafond

La production est fermée si `STRIPE_CHECKOUT_ENABLED` est absent. Déploiement
staging initial :

```dotenv
STRIPE_CHECKOUT_ENABLED=true
STRIPE_SOFT_LAUNCH_MAX_AMOUNT_MINOR=10000
STRIPE_SOFT_LAUNCH_BUYER_IDS=<uuid-acheteur-1>,<uuid-acheteur-2>
```

Ordre d'ouverture :

1. staging avec cohorte interne et plafond de 100 EUR ;
2. live avec cinq acheteurs autorisés et le même plafond ;
3. retirer progressivement l'allowlist, sans retirer le plafond ;
4. augmenter le plafond seulement après sept jours sans écart, dette non
   recouvrée ni incident financier ;
5. repasser immédiatement `STRIPE_CHECKOUT_ENABLED=false` si la
   réconciliation, Sentry ou `/admin/finance` remonte un écart.

## Préflight migrations — état au 31 juillet 2026

Les deux environnements (staging `mmgrqdistbwivmqhqhfw` et production
`qevmnveyjdovupyveoqc`) sont arrêtés à la même version :
`20260727182000_harden_stripe_ledger`.

**8 migrations locales non déployées**, à appliquer dans l'ordre suivant :

| Ordre | Fichier                                                     | Sprint | Prérequis |
| ----: | ----------------------------------------------------------- | ------ | --------- |
|     1 | `20260727184658_ensure_unique_stripe_connect_accounts`      | 3b     | aucun     |
|     2 | `20260727221132_sprint4_traceable_transfers_payouts`        | 4      | 1         |
|     3 | `20260727230138_sprint5_refunds_disputes_debt`              | 5      | 2         |
|     4 | `20260727232711_cancel_recovered_seller_transfers`          | 5b     | 3         |
|     5 | `20260727235105_sprint6_financial_operations_observability` | 6      | 4         |
|     6 | `20260731072511_wallet_lock_ledger_source_of_truth`         | 7      | 5         |
|     7 | `20260731072657_recover_stale_processing_transfers`         | 7      | 6         |
|     8 | `20260731072954_proportional_dispute_reserve_payout`        | 7      | 7         |

**Notes critiques :**

- La migration 2 (Sprint 4) crée `seller_transfers`, `payouts`, `payout_items`
  et les fonctions `prepare_seller_transfer`, `reserve_seller_payout`. Sans
  elle, la migration 3 (Sprint 5) échoue.
- La migration 6 supprime le trigger `wallets_capture_ledger_adjustment` et
  remplace la capture par un guard d'écriture directe. Elle est non réversible
  sans recréer manuellement le trigger.
- La migration 8 modifie `reserve_seller_payout_original` pour incorporer
  `dispute_reserve_bps` dans le calcul de réserve. Elle met à jour aussi
  `payouts.risk_reserve_minor` pour stocker la réserve effective appliquée.

**Procédure avant toute application distante :**

1. Exécuter `npm run validate:stripe-launch --workspace=@deckdealr/web` avec
   les RAK staging (confirme zéro écart avant migration).
2. Confirmer séparément pour staging, puis appliquer les 8 migrations.
3. Exécuter les pgTAP et advisors sur staging.
4. Vérifier `validate:stripe-launch` après migration (zéro écart).
5. Confirmer séparément pour production et répéter.

**Aucune migration ne sera appliquée par le code sans confirmation explicite.**

## Go / no-go

La décision reste **NO-GO** tant qu'un seul point suivant manque :

- tous les scénarios Sandbox et appareils ci-dessus sont cochés ;
- les parcours Connect particulier et professionnel sont actifs ;
- les RAK staging/live ont été provisionnées, restreintes et tournées ;
- les alertes Sentry `financial-operations-*` atteignent l'astreinte ;
- Supabase advisors n'expose aucun avertissement de sécurité non accepté et
  documenté ;
- le test de restauration Supabase et la reconstruction wallet réussissent ;
- `validate:stripe-launch` et `/admin/finance` indiquent zéro écart ;
- le runbook d'astreinte a été exécuté par une seconde personne.

**État au 31 juillet 2026 (audit complet) — décision : NO-GO**

Tests unitaires Node : 268/268 verts (259 web + 4 mobile + 5 shared). Build,
type-check, format et scan de secrets : OK. Lint : 0 erreur, 51 avertissements
(no-console dans les scripts de validation uniquement). Docker absent
localement : pgTAP non exécuté ; les 5 suites de tests SQL seront exécutées
dans la CI E2E une fois les migrations déployées en staging.

Advisors Supabase (production et staging identiques) :

- `rls_enabled_no_policy` (INFO) sur `financial_outbox`, `ledger_accounts`,
  `ledger_entries`, `ledger_transactions`, `notifications_outbox`,
  `stripe_object_bindings`, `stripe_webhooks_processed` — **intentionnel** :
  ces tables sont réservées au backend et ne sont accessibles que via
  `service_role`; les politiques publiques sont délibérément absentes.
- `function_search_path_mutable` (WARN) sur `get_seller_reputation`,
  `get_inbox`, `upsert_conversation`, `update_updated_at_column`,
  `check_offer_daily_limit`, `check_offer_minimum` — fonctions pré-Sprint-2,
  à corriger hors de ce lot de remédiation financière.
- `anon_security_definer_function_executable` (WARN) sur
  `count_new_for_saved_searches`, `guard_transaction_status_transition`,
  `handle_new_user`, `search_listings_feed` — aucune de ces fonctions
  financières ne doit être exposée à `anon`; à corriger avant le soft launch.
- `public_bucket_allows_listing` (WARN) sur `avatars` et `listing-images` —
  acceptable pour un marché de cartes public; documenter la décision.
- `auth_leaked_password_protection` (WARN) — activer HaveIBeenPwned dans les
  settings Auth Supabase avant le lancement live.

Migrations distantes (staging et production) : les sprints 4, 5 et 6 ne sont
pas encore déployés. Les tables `seller_transfers`, `seller_risk_accounts`,
`payout_items`, `financial_recoveries`, `financial_reconciliation_alerts` et les
vues d'observabilité sont absentes. Il reste aussi 3 transactions en staging
et 14 en production sans journal de paiement `payment_captured` — ces données
historiques doivent être qualifiées (transactions orphelines ou antérieures
au ledger) avant toute activation.

Blockers non résolus avant go-live :

1. Déployer les migrations Sprint 4–6 en staging puis production.
2. Qualifier et corriger les 17 transactions sans journal (staging + prod).
3. Provisionner les RAK sandbox/staging/live et les déposer dans le secret store.
4. Activer les alertes Sentry `financial-operations-*` sur l'astreinte.
5. Corriger les 4 fonctions `SECURITY DEFINER` exposées à `anon`.
6. Exécuter les scénarios Sandbox complets, y compris appareils physiques
   (Apple Pay, Google Pay) et deep links.
7. Faire exécuter le runbook d'astreinte par une seconde personne.
