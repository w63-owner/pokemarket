# 🃏 PokeMarket

![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Stripe](https://img.shields.io/badge/Stripe-008CDD?style=for-the-badge&logo=stripe&logoColor=white)
![OpenAI](https://img.shields.io/badge/OpenAI_Vision-412991?style=for-the-badge&logo=openai&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)

PokeMarket est une marketplace C2C (Customer to Customer) ultra-moderne dédiée à l'achat et la revente de cartes Pokémon (TCG). Conçue comme une Progressive Web App (PWA) "mobile-first", elle intègre des fonctionnalités avancées comme la reconnaissance de cartes par intelligence artificielle, un système de paiement sous séquestre, et une messagerie en temps réel.

## ✨ Fonctionnalités Principales

- **🤖 Vente assistée par IA (OCR) :** Prenez votre carte en photo, l'IA d'OpenAI (Vision) reconnaît la carte, ses points de vie, son édition, et trouve le match parfait dans le catalogue officiel (TCGdex).
- **💬 Messagerie Temps Réel :** Négociez directement avec les vendeurs grâce à un chat instantané (Supabase Realtime) intégrant des "Rich Bubbles" pour les offres et le suivi de colis.
- **💳 Paiement Sécurisé & Escrow :** Intégration de Stripe Connect. L'argent de l'acheteur est bloqué sous séquestre jusqu'à la confirmation de réception du colis.
- **⚡ Optimistic UI :** Les interactions (comme l'ajout aux favoris ou l'envoi de messages) paraissent instantanées grâce à la mise à jour optimiste du cache avec TanStack Query.
- **📱 Progressive Web App (PWA) :** Installable sur iOS et Android, avec gestion du mode hors-ligne et des performances optimisées (Core Web Vitals).
- **🔍 Recherche Avancée :** Filtrage ultra-rapide avec synchronisation URL, permettant le partage de recherches complexes (état, prix, édition, cartes gradées).

## 🛠️ Stack Technique

- **Frontend :** Next.js 16 (App Router), React 19, TypeScript
- **Styling & UI :** Tailwind CSS, Shadcn/UI, Framer Motion (Animations), Lucide Icons
- **Backend & Base de données :** Supabase (PostgreSQL, Auth, Storage, Realtime, RPC)
- **Paiements :** Stripe (Checkout Sessions, Connect Onboarding, Webhooks)
- **IA & Données :** OpenAI API (gpt-4o-mini), API TCGdex
- **Emails :** Resend & React Email
- **Qualité & CI/CD :** Vitest, Playwright (E2E), ESLint, Husky, GitHub Actions, Sentry (Monitoring)

## 🚀 Démarrage Rapide (Local)

### Prérequis

- Node.js 20+
- Un compte [Supabase](https://supabase.com/) (ou CLI Supabase en local)
- Un compte [Stripe](https://stripe.com/)
- Une clé API [OpenAI](https://platform.openai.com/)

### 1. Cloner le repository

```bash
git clone [https://github.com/votre-username/pokemarket.git](https://github.com/votre-username/pokemarket.git)
cd pokemarket
npm install
```

## 🤝 Contribuer

- **Strategie de branches & flux release** : voir [`CONTRIBUTING.md`](CONTRIBUTING.md)
- **Setup CI/CD complet (Supabase, Vercel, GitHub Environments)** : voir [`docs/CICD.md`](docs/CICD.md)
