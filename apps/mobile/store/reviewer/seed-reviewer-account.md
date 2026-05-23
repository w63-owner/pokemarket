# Compte démo pour les reviewers Apple / Google

## Pourquoi un compte spécifique

App Review d'Apple et la review Play Store **ont besoin d'un compte
fonctionnel** avec de la donnée présente pour valider l'app. On ne peut
pas leur demander de créer un compte ni de faire passer un KYC réel.

Cf. App Store Review Guideline 5.1.1(v) : si l'app exige un compte, un
compte démo doit être fourni dans **App Review Information**.

## Procédure

1. Avant chaque submit, exécuter :

   ```bash
   cd apps/mobile
   npm run seed:reviewer -- --reset
   ```

   Le script :
   - supprime l'ancien compte `reviewer@pokemarket.app` s'il existe
   - le re-crée avec le mot de passe `ReviewerPass2026!`
   - seed 12 listings ACTIVE avec covers réelles (cartes iconiques)
   - crée 2 conversations (1 avec offre PENDING)
   - crédite le wallet seller de 350 €
   - crée 1 transaction PAID en cours d'expédition
   - imprime un récap JSON avec les IDs créés

2. Coller les credentials produits dans :
   - **App Store Connect** → App Review Information → Notes
     (utiliser le template `notes-en.md`)
   - **Play Console** → Production → Manage App → App Content →
     Reviewer Comments

3. Vérifier que le compte fonctionne en se connectant **depuis l'IPA
   préview** (pas depuis Expo Go) — le reviewer recevra l'IPA, pas le
   dev client.

## Garde-fous

- Le compte reviewer **n'a pas** de carte bancaire enregistrée. Le checkout
  est testable via les cartes test Stripe (`4242 4242 4242 4242`).
- Le mot de passe doit être ≥ 8 caractères + 1 majuscule + 1 chiffre +
  1 spécial pour passer la validation Apple "weak password".
- Email **doit** être hébergé sur un domaine qu'on contrôle. Si Apple
  envoie un email de double-opt-in, on doit pouvoir le recevoir et
  cliquer.

## Cycle de vie

- Reseed à chaque submit (pour avoir des dates de listings fraîches).
- Reseed après chaque rejet pour s'assurer que la donnée est encore
  présente quand le reviewer se reconnecte.
- Une fois l'app live, **garder le compte actif** : Apple peut le
  réutiliser pour des audits post-launch (notamment si une mise à jour
  est rejetée).

## Variables d'env requises

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...    # ⚠ admin, ne pas committer
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

Le script utilise le service role pour créer le user puis le client anon
pour signer in et seed les listings dans le namespace RLS du seller (même
pattern que `apps/web/scripts/qa-buyer-setup.mjs`).
