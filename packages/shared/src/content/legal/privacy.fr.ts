import type { LegalDocument } from "./types";

export const privacyFr: LegalDocument = {
  slug: "privacy",
  title: "Politique de Confidentialité",
  lastUpdated: "[Date de mise à jour]",
  intro: [
    {
      type: "p",
      text: "La présente Politique de Confidentialité décrit comment [Nom de l'entreprise] (ci-après « PokeMarket », « nous ») collecte, utilise, stocke et protège vos données personnelles conformément au Règlement Général sur la Protection des Données (RGPD — Règlement UE 2016/679) et à la loi Informatique et Libertés.",
    },
  ],
  sections: [
    {
      level: 2,
      heading: "1. Responsable du traitement",
      body: [
        {
          type: "p",
          text: "Le responsable du traitement des données personnelles est : [Nom de l'entreprise], [Adresse]. Email : [Email de contact]. SIRET : [Numéro SIRET].",
        },
      ],
    },
    {
      level: 2,
      heading: "2. Données collectées",
      body: [],
    },
    {
      level: 3,
      heading: "2.1 Données fournies directement",
      body: [
        {
          type: "ul",
          items: [
            "Inscription : adresse email, nom d'utilisateur, mot de passe (hashé), avatar",
            "Profil vendeur : nom complet, adresse postale (pour l'expédition), numéro de téléphone (optionnel)",
            "Paiement : les données bancaires sont traitées exclusivement par Stripe (conforme PCI-DSS). PokeMarket ne stocke aucune donnée bancaire directement",
            "Messagerie : contenu des messages échangés entre utilisateurs",
            "Annonces : photos de cartes, descriptions, prix",
          ],
        },
      ],
    },
    {
      level: 3,
      heading: "2.2 Données collectées automatiquement",
      body: [
        {
          type: "ul",
          items: [
            "Données techniques : adresse IP, type de navigateur, système d'exploitation, résolution d'écran",
            "Données de navigation : pages consultées, durée de visite, actions effectuées",
            "Cookies : voir la section 7 ci-dessous",
          ],
        },
      ],
    },
    {
      level: 2,
      heading: "3. Finalités et bases légales",
      body: [
        {
          type: "table",
          headers: ["Finalité", "Base légale"],
          rows: [
            ["Gestion du compte et authentification", "Exécution du contrat (CGU)"],
            ["Traitement des transactions et paiements", "Exécution du contrat (CGV)"],
            ["Messagerie entre utilisateurs", "Exécution du contrat"],
            ["Envoi de notifications (push, email)", "Consentement / intérêt légitime"],
            ["Modération et lutte anti-fraude", "Intérêt légitime"],
            ["Amélioration du service et statistiques", "Intérêt légitime"],
            ["Obligations légales (facturation, fiscalité)", "Obligation légale"],
          ],
        },
      ],
    },
    {
      level: 2,
      heading: "4. Durée de conservation",
      body: [
        {
          type: "ul",
          items: [
            "Données de compte : conservées pendant la durée de l'inscription + 3 ans après la suppression du compte",
            "Données de transaction : 10 ans (obligations comptables et fiscales)",
            "Messages : 1 an après la dernière activité de la conversation",
            "Données de navigation : 13 mois maximum",
            "Cookies : voir la section 7",
          ],
        },
      ],
    },
    {
      level: 2,
      heading: "5. Destinataires des données",
      body: [
        { type: "p", text: "Vos données peuvent être partagées avec :" },
        {
          type: "ul",
          items: [
            "Stripe Inc. — traitement des paiements (conforme PCI-DSS, Privacy Shield certifié)",
            "Supabase Inc. — hébergement de la base de données et authentification (serveurs UE)",
            "Vercel Inc. — hébergement de l'application (serveurs UE via edge network)",
            "Sentry — monitoring des erreurs (données anonymisées)",
            "OpenAI — reconnaissance OCR des cartes (images de cartes uniquement, sans données personnelles)",
          ],
        },
        {
          type: "p",
          text: "Aucune donnée personnelle n'est vendue à des tiers. Les transferts hors UE sont encadrés par des clauses contractuelles types (CCT) ou des décisions d'adéquation de la Commission européenne.",
        },
      ],
    },
    {
      level: 2,
      heading: "6. Vos droits (RGPD)",
      body: [
        { type: "p", text: "Conformément au RGPD, vous disposez des droits suivants :" },
        {
          type: "ul",
          items: [
            "Droit d'accès : obtenir une copie de vos données personnelles",
            "Droit de rectification : corriger vos données inexactes ou incomplètes",
            "Droit à l'effacement : demander la suppression de vos données (« droit à l'oubli »)",
            "Droit à la portabilité : recevoir vos données dans un format structuré et lisible par machine",
            "Droit d'opposition : vous opposer au traitement de vos données pour des motifs légitimes",
            "Droit à la limitation : demander la suspension du traitement de vos données",
            "Droit de retrait du consentement : retirer votre consentement à tout moment pour les traitements fondés sur celui-ci",
          ],
        },
        {
          type: "p",
          text: "Pour exercer vos droits, contactez-nous à : [Email de contact]. Nous répondrons dans un délai de 30 jours. En cas de désaccord, vous pouvez introduire une réclamation auprès de la CNIL (www.cnil.fr).",
        },
      ],
    },
    {
      level: 2,
      heading: "7. Cookies",
      body: [],
    },
    {
      level: 3,
      heading: "7.1 Cookies essentiels (sans consentement)",
      body: [
        {
          type: "ul",
          items: [
            "Authentification Supabase : cookies de session nécessaires à la connexion et au maintien de votre session",
            "Sécurité : jetons CSRF, protection contre les attaques",
            "Préférences : thème (clair/sombre), préférences de consentement",
          ],
        },
      ],
    },
    {
      level: 3,
      heading: "7.2 Cookies de mesure d'audience (avec consentement)",
      body: [
        {
          type: "ul",
          items: [
            "Sentry : collecte anonymisée de données de performance et d'erreurs pour améliorer la stabilité du service",
          ],
        },
        {
          type: "p",
          text: "Vous pouvez gérer vos préférences de cookies à tout moment via la bannière de consentement ou les paramètres de votre navigateur. La durée de vie des cookies est de 13 mois maximum conformément aux recommandations de la CNIL.",
        },
      ],
    },
    {
      level: 2,
      heading: "8. Sécurité des données",
      body: [
        {
          type: "p",
          text: "Nous mettons en œuvre des mesures techniques et organisationnelles appropriées pour protéger vos données :",
        },
        {
          type: "ul",
          items: [
            "Chiffrement des données en transit (TLS/HTTPS)",
            "Chiffrement des mots de passe (bcrypt)",
            "Row Level Security (RLS) sur la base de données",
            "Authentification à deux facteurs disponible",
            "Audits de sécurité réguliers",
          ],
        },
      ],
    },
    {
      level: 2,
      heading: "9. Modifications",
      body: [
        {
          type: "p",
          text: "Nous nous réservons le droit de modifier cette politique à tout moment. En cas de modification substantielle, vous serez informé(e) par email ou par notification sur la plateforme.",
        },
      ],
    },
    {
      level: 2,
      heading: "Contact DPO",
      body: [
        {
          type: "p",
          text: "Pour toute question relative à la protection de vos données : [Nom du DPO ou responsable]. Email : [Email DPO]. Adresse : [Adresse].",
        },
      ],
    },
  ],
};
