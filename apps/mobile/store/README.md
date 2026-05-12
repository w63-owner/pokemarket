# `apps/mobile/store/`

Tous les artefacts marketing & store-listing pour la soumission iOS + Android
de PokeMarket Mobile v1.0.0.

```
store/
├── README.md                       ← ce fichier
├── app-store/
│   ├── description-fr.md           ← description longue iOS (FR)
│   ├── description-en.md           ← description longue iOS (EN)
│   ├── promotional-text-fr.txt     ← 170 char. (modifiable post-submit sans review)
│   ├── promotional-text-en.txt
│   ├── keywords-fr.txt             ← 100 chars max, separés virgules
│   ├── keywords-en.txt
│   ├── subtitle-fr.txt             ← 30 chars max
│   ├── subtitle-en.txt
│   └── support-info.json           ← URLs support / marketing / privacy
├── play-store/
│   ├── short-description-fr.txt    ← 80 chars max
│   ├── short-description-en.txt
│   ├── full-description-fr.md      ← 4000 chars max
│   ├── full-description-en.md
│   └── data-safety.md              ← Google Play Data Safety form
├── release-notes/
│   ├── 1.0.0-fr.txt                ← "What's New" iOS / Android
│   └── 1.0.0-en.txt
├── screenshots/
│   └── README.md                   ← spécifications + checklist captures
├── reviewer/
│   ├── notes-en.md                 ← notes pour Apple App Review (EN obligatoire)
│   └── seed-reviewer-account.md    ← procédure pour générer le compte démo
├── privacy-labels-ios.md           ← Apple Privacy Nutrition Labels (déclaration)
└── assets/                         ← icônes / feature graphic Android (à fournir)
```

## Comment ces fichiers sont consommés

- **iOS via `eas metadata:push`** → lit `apps/mobile/store.config.json`
  qui pointe vers les fichiers ci-dessus. Voir `docs/MOBILE_RELEASE.md` §3.
- **Android** → `eas submit --platform android` n'envoie que le binaire ;
  les listings Play Console doivent être mis à jour à la main depuis
  `play-store/full-description-*.md` (ou via la Play Developer API si on
  ajoute un script — pas en V1).
- **Release notes** → on les colle manuellement dans App Store Connect
  / Play Console pour chaque version. À mettre à jour à chaque release
  (créer `1.0.1-fr.txt`, `1.1.0-fr.txt`, etc.).

## Source de vérité unique

Tous les textes marketing **vivent ici**, pas dans App Store Connect ni
dans Play Console. Quand on modifie une description, on commit ici puis
on pousse via `eas metadata:push` (iOS) ou copier-coller (Android).
