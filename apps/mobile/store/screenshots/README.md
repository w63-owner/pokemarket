# Screenshots — spécifications & checklist

## 1. Tailles requises

### iOS (App Store Connect)

| Device class | Résolution requise | Min / Max | Source recommandée |
|---|---|---|---|
| iPhone 6.9" (16 Pro Max) | **1320 × 2868** portrait | 3 min, 10 max | iPhone 16 Pro Max simulator |
| iPhone 6.7" (15 Pro Max / 14 Plus) | **1290 × 2796** portrait | 3 min, 10 max | iPhone 15 Pro Max simulator |
| iPad Pro 12.9" (3e gen+) | **2048 × 2732** portrait | 3 min, 10 max | iPad Pro 12.9" simulator |
| iPad Pro 13" (M4) | **2064 × 2752** portrait | 3 min, 10 max | iPad Pro 13" simulator |

> **Apple ne demande plus** explicitement les tailles 6.5" / 5.5" depuis
> le printemps 2025 — fournir uniquement 6.9" + iPad. App Store dérive
> les tailles plus petites automatiquement.

### Android (Play Console)

| Asset | Format | Résolution |
|---|---|---|
| Phone screenshots | PNG ou JPG, 16:9 ou 9:16 | min 320 px, max 3840 px (ratio 9:16 conseillé : **1080 × 1920** ou **1440 × 2560**) |
| 7" tablet | PNG ou JPG | min 320 px, max 3840 px (idéal **1200 × 1920**) |
| 10" tablet | PNG ou JPG | idéal **1920 × 2560** |
| Feature graphic | PNG ou JPG | **1024 × 500** (sans transparence) |
| App icon Play | PNG 32-bit | **512 × 512** |

## 2. Liste des 6 screenshots à capturer (par taille)

L'ordre **est** l'ordre dans lequel ils apparaîtront sur le store :

1. **Feed accueil** — montre une grille de cartes Pokémon iconiques
   (Charizard Base Set, Pikachu Promo, etc.). Caption : "Des milliers de
   cartes à portée de main"
2. **Détail listing** — page d'une carte gradée PSA 10. Caption :
   "Cartes gradées PSA, BGS, CGC certifiées"
3. **Scan IA caméra** — overlay de scan visible avec bracket + texte
   "Scanner ma carte". Caption : "Vendez en 30 secondes avec l'IA"
4. **Checkout Apple Pay / Google Pay** — modal PaymentSheet ouverte.
   Caption : "Payez en un toucher" (iOS) ou "Google Pay intégré"
   (Android)
5. **Messagerie + offre** — conversation avec une offre en cours.
   Caption : "Négociez et payez en un coup d'œil"
6. **Wallet / vente** — écran wallet avec solde + bouton "Demander un
   virement". Caption : "Encaissez vos ventes par virement bancaire"

## 3. Données de démo à utiliser pendant la capture

Utiliser le compte généré par
`npm run -w @pokemarket/mobile seed:reviewer` (cf. `../reviewer/seed-reviewer-account.md`)
qui crée :

- 12 listings ACTIVE avec covers réelles
- 1 transaction PAID en cours
- 1 conversation avec offre PENDING
- Wallet seller crédité de 350 €

## 4. Outils

- **iOS** : `xcrun simctl io booted screenshot screenshot.png` pour
  capturer le simulator courant.
- **Android** : `adb shell screencap -p /sdcard/s.png && adb pull /sdcard/s.png`.
- **Captions stylées** : utiliser [Screenshots Builder](https://www.screenshots.pro/)
  ou [Previewed](https://previewed.app/) pour ajouter les captions et le
  cadre device par-dessus la capture brute. Garder les fichiers sources
  (`.fig` / `.psd`) dans un Drive partagé, **pas** dans le repo (poids).

## 5. Checklist avant submit

- [ ] 6 screenshots × 4 tailles iOS = **24 fichiers PNG iOS** dans `screenshots/ios/<device>/`
- [ ] 6 screenshots phone × 1 = **6 fichiers PNG Android phone** dans `screenshots/android/phone/`
- [ ] Optionnel : 4 screenshots tablette Android dans `screenshots/android/tablet/`
- [ ] Status bar : 09:41 sur iOS, batterie 100 %, signal plein (utiliser
      `xcrun simctl status_bar booted override --time "9:41" --batteryLevel 100`)
- [ ] Aucune notif système à l'écran
- [ ] Aucune mention "DEBUG" ou "Expo" dans la barre du haut (toujours
      capturer depuis un build EAS preview ou production, pas Expo Go)
- [ ] Texte FR exclusivement pour les captures destinées à la fiche FR,
      idem EN pour la fiche EN
- [ ] Feature graphic Play Store généré (1024 × 500)

## 6. Où stocker les fichiers

```
screenshots/
├── ios/
│   ├── iphone-6.9/     ← 6 PNG 1320×2868
│   ├── iphone-6.7/     ← 6 PNG 1290×2796
│   ├── ipad-12.9/      ← 6 PNG 2048×2732
│   └── ipad-13/        ← 6 PNG 2064×2752
└── android/
    ├── phone/          ← 6 PNG 1080×1920
    ├── tablet-7/       ← 4 PNG 1200×1920 (optionnel mais recommandé)
    └── tablet-10/      ← 4 PNG 1920×2560 (optionnel)
```

> **Important** : ces images sont volumineuses. Si on les commit, vérifier
> que `git lfs` est activé pour `*.png` sous `apps/mobile/store/screenshots/**`.
> Sinon, garder les fichiers sources dans un Drive et lister juste les
> URLs dans `.metadata.json` consommé par EAS Metadata.
