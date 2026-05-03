# Contributing to PokeMarket

> Strategie de branches, flux de release, et conventions de developpement.

Pour la mise en place complete du CI/CD (creation des projets Supabase/Vercel staging, secrets GitHub, etc.), voir [`docs/CICD.md`](docs/CICD.md).

---

## Branches

| Branche                         | Role                  | Deploye sur                 | Migrations DB               | Protected |
| ------------------------------- | --------------------- | --------------------------- | --------------------------- | --------- |
| `main`                          | Production            | Vercel `pokemarket-prod`    | Supabase prod (gate manuel) | Oui       |
| `staging`                       | Pre-production        | Vercel `pokemarket-staging` | Supabase staging (auto)     | Oui       |
| `feature/*`, `fix/*`, `chore/*` | Travail en cours      | Vercel Preview              | Aucune                      | Non       |
| `hotfix/*`                      | Correctif urgent prod | Vercel Preview puis prod    | Supabase prod (gate manuel) | Non       |

### Regles d'or

1. **Aucun commit direct sur `main` ni `staging`**. Tout passe par PR.
2. **`main` est toujours deployable**. Si la prod est cassee, c'est une priorite P0.
3. **`staging` est le miroir de la prochaine release**. C'est le snapshot de ce qui partira en prod a la prochaine release.
4. **Une PR = une intention claire**. Les PR mega-melanges sont rejetees.

---

## Flux quotidien

```bash
# 1. Toujours partir de staging a jour
git checkout staging && git pull

# 2. Creer ta branche
git checkout -b feature/nom-de-la-feature

# 3. Coder, commiter, pusher
git push -u origin feature/nom-de-la-feature

# 4. Ouvrir une PR -> staging via l'UI GitHub
#    - La CI tourne automatiquement (lint, type-check, test, build, e2e)
#    - Vercel deploie un Preview avec une URL unique
#    - Demander une review si necessaire

# 5. Squash merge dans staging quand tout est vert
#    - Vercel deploie staging
#    - Si la PR contenait des migrations: GHA pousse les migrations sur Supabase staging
#    - Smoke tests post-deploy automatiques contre staging
```

---

## Flux de release (staging -> prod)

```bash
# 1. Verifier que staging est sain (smoke tests verts, validation manuelle si besoin)

# 2. Creer une PR de release
gh pr create --base main --head staging \
  --title "Release $(date +%Y-%m-%d)" \
  --body "Voir le diff staging...main"

# 3. Merge la PR (squash ou merge commit, au choix)

# 4. GitHub Actions:
#    a) Demande ton approbation manuelle (gate environment `production`)
#    b) Pousse les migrations sur Supabase prod
#    c) Vercel deploie la prod
#    d) Cree une release Sentry et associe les commits
#    e) Lance les smoke tests contre la prod
```

---

## Hotfix (correctif urgent en prod)

```bash
# 1. Branche depuis main
git checkout main && git pull
git checkout -b hotfix/description-courte

# 2. Fix + commit + push + PR -> main
git push -u origin hotfix/description-courte
gh pr create --base main --title "hotfix: description"

# 3. Apres merge en main, back-merger dans staging pour eviter la divergence
git checkout staging && git pull
git merge main
git push origin staging
```

---

## Conventions de commit

Format souple mais privilegier les prefixes type [Conventional Commits](https://www.conventionalcommits.org/) :

- `feat:` nouvelle fonctionnalite
- `fix:` correction de bug
- `chore:` maintenance, deps, refactor mineur
- `refactor:` refactor sans changement fonctionnel
- `docs:` documentation
- `test:` tests
- `perf:` optimisation
- `ci:` CI/CD
- `db:` migration ou changement schema Supabase

Exemple :

```
feat(checkout): add wallet credit option at payment

Allows buyers to apply their wallet credit toward the order total.
Refs #123
```

---

## Migrations Supabase

Toute modif du schema PASSE par une migration versionnee :

```bash
# 1. Pendant le dev local
supabase start
supabase migration new <description_courte>
# Editer le fichier SQL genere dans supabase/migrations/

# 2. Tester localement
supabase db reset  # rejoue toutes les migrations + seed

# 3. Commiter le fichier migration dans la PR
```

Les migrations seront appliquees automatiquement :

- Sur **staging** au merge dans `staging`
- Sur **prod** au merge dans `main` (avec gate manuel)

**Ne jamais modifier le schema directement dans le dashboard Supabase**. Toute drift est detectee par le job `supabase db diff` du workflow `migrations-production.yml`.

### Migrations risquees : valider sur une Supabase Branch (escape hatch)

Pour les migrations sensibles (renommage / suppression de colonne, partition, refactor RLS, backfill important), valide sur une **DB ephemere clonee de la prod** AVANT de merger en staging.

```bash
# 1. Cree une branch DB cote Supabase (clone du schema prod)
supabase branches create migration-test --project-ref <PROD_REF>

# 2. Recupere la connection string
supabase branches get migration-test --project-ref <PROD_REF>

# 3. Pointe ton .env.local vers cette branch DB et rejoue les migrations
supabase db push --db-url "<BRANCH_DB_URL>"

# 4. Lance ton app en local, observe les perfs / regressions
npm run dev

# 5. Quand c'est valide, supprime la branch (sinon ~0.32 USD/jour)
supabase branches delete migration-test --project-ref <PROD_REF>
```

A faire surtout pour :

- ALTER TABLE qui pose un lock long sur une grosse table
- Suppression / renommage de colonne avec backfill
- Modifications de RLS sur les tables sensibles (`listings`, `transactions`, `profiles`)
- RPC qui change de signature

Ce flow reste **manuel par design** : la majorite des migrations (ajout de table, index, RPC simple) n'ont pas besoin de cette ceinture. Le workflow GHA `migrations-staging.yml` reste la voie nominale.

---

## Tests

| Type       | Outil                      | Quand l'executer           |
| ---------- | -------------------------- | -------------------------- |
| Unit       | `npm run test` (Vitest)    | A chaque commit pertinent  |
| Type-check | `npm run type-check`       | Avant chaque push          |
| E2E        | `npm run e2e` (Playwright) | Avant les PR significatifs |
| Smoke      | `npm run test:smoke`       | Auto post-deploy           |

La CI lance lint + type-check + tests + build + e2e a chaque PR. Si tu veux executer le meme job en local :

```bash
npm run lint && npm run type-check && npm run test && npm run build && npm run e2e
```

---

## Secrets et variables d'environnement

- Les valeurs locales vivent dans `.env.local` (pas commit, voir `.env.local.example`).
- Les valeurs staging/prod vivent dans Vercel (cloisonnees par projet) + GitHub Environments.
- **Ne jamais committer un secret**. Le job `gitleaks` bloque les PR contenant des credentials.
- Si tu exposes accidentellement un secret : rotate-le immediatement (Stripe, Supabase, OpenAI, etc.) puis force-push si possible.

---

## Pre-commit hooks

`husky` + `lint-staged` formattent et lintent automatiquement les fichiers stages :

```jsonc
// package.json
"lint-staged": {
  "*.{ts,tsx}": ["prettier --write", "eslint --fix"],
  "*.{json,css,md}": ["prettier --write"]
}
```

Si tu veux skip exceptionnellement (pas recommande) : `git commit --no-verify`.
