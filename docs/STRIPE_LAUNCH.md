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
npm run validate:stripe-launch --workspace=@pokemarket/web
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
      `pokemarket://stripe-redirect`.
- [ ] Mobile Android physique — carte, 3DS, Google Pay test et même retour.
- [ ] Mobile — onboarding particulier/professionnel, puis deep links
      `pokemarket://wallet/return` et `pokemarket://wallet/refresh`.
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

Le 28 juillet 2026, les tests unitaires sont verts, mais Docker local n'est pas
disponible dans la session et les advisors distants signalent encore des
fonctions `SECURITY DEFINER` exposées ainsi que des `search_path` mutables. La
staging et la production n'ont pas encore les tables Sprint 5
`seller_risk_accounts`; la vérification distante trouve aussi 3 transactions
financières sans journal de paiement en staging et 14 en production. Ces
données historiques doivent être qualifiées puis recréées ou migrées avant
toute activation. Les tests appareils, RAK et alertes Sentry restent aussi à
exécuter. La décision actuelle est donc **NO-GO**.
