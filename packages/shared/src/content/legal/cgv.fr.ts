import type { LegalDocument } from "./types";

export const cgvFr: LegalDocument = {
  slug: "cgv",
  title: "Conditions Générales de Vente",
  lastUpdated: "26 juillet 2026",
  sections: [
    {
      level: 2,
      heading: "1. Objet",
      body: [
        {
          type: "p",
          text: "Les présentes Conditions Générales de Vente (ci-après « CGV ») régissent l'ensemble des transactions réalisées entre vendeurs et acheteurs sur la plateforme PokeMarket, éditée par [Nom de l'entreprise], [Forme juridique] au capital de [Montant du capital] €, immatriculée au RCS de [Ville] sous le numéro [Numéro SIRET/SIREN], dont le siège social est situé au [Adresse].",
        },
        {
          type: "p",
          text: "Le contrat de vente de la carte est conclu entre le vendeur et l'acheteur. PokeMarket agit comme intermédiaire pour cette vente et comme marchand officiel (« merchant of record ») pour le traitement du paiement : PokeMarket encaisse l'acheteur, émet les justificatifs de paiement et assume la gestion des remboursements, contestations et demandes de support liées au paiement.",
        },
      ],
    },
    {
      level: 2,
      heading: "2. Rôle de la plateforme",
      body: [
        {
          type: "p",
          text: "PokeMarket met à disposition un espace sécurisé de mise en relation permettant aux utilisateurs de publier des annonces de vente, de consulter les annonces d'autres utilisateurs, de négocier via un système d'offres, de communiquer via la messagerie intégrée et d'effectuer des paiements sécurisés via Stripe Connect.",
        },
        {
          type: "p",
          text: "PokeMarket n'est ni vendeur, ni acheteur, ni garant de la qualité des articles mis en vente. La responsabilité de la description fidèle des articles incombe exclusivement au vendeur.",
        },
        {
          type: "p",
          text: "Stripe fournit l'infrastructure de paiement à PokeMarket. Le vendeur n'encaisse pas directement le paiement par carte de l'acheteur et ne doit pas contacter Stripe pour le support de la transaction.",
        },
      ],
    },
    {
      level: 2,
      heading: "3. Prix et commissions",
      body: [
        {
          type: "p",
          text: "Les prix sont fixés librement par les vendeurs et affichés en euros (€). Chaque vendeur demeure responsable de son statut fiscal, de la qualification particulière ou professionnelle de son activité et, le cas échéant, de la déclaration et du paiement des taxes applicables.",
        },
        {
          type: "p",
          text: "PokeMarket prélève une commission de [Pourcentage]% sur chaque transaction finalisée. Cette commission est déduite du montant versé au vendeur. Les frais de port éventuels sont à la charge de l'acheteur, sauf mention contraire dans l'annonce.",
        },
      ],
    },
    {
      level: 2,
      heading: "4. Processus de vente",
      body: [],
    },
    {
      level: 3,
      heading: "4.1 Mise en vente",
      body: [
        {
          type: "p",
          text: "Le vendeur crée une annonce en renseignant les informations relatives à la carte (nom, état, photos, prix). Il s'engage à décrire fidèlement l'état de la carte selon les catégories proposées (Mint, Near Mint, Excellent, Good, Light Played, Played, Poor).",
        },
      ],
    },
    {
      level: 3,
      heading: "4.2 Offre et acceptation",
      body: [
        {
          type: "p",
          text: "L'acheteur peut acheter au prix affiché ou formuler une contre-offre. Le vendeur est libre d'accepter ou de refuser toute offre. La vente est conclue dès l'acceptation de l'offre et la validation du paiement.",
        },
      ],
    },
    {
      level: 3,
      heading: "4.3 Paiement",
      body: [
        {
          type: "p",
          text: "PokeMarket encaisse le paiement via Stripe Connect. Le montant dû au vendeur reste indisponible jusqu'à la confirmation de réception par l'acheteur ou l'expiration du délai de réclamation de [Nombre] jours, puis peut être transféré sur le compte Stripe Connect du vendeur. Ce mécanisme de disponibilité différée ne constitue pas un service de séquestre.",
        },
      ],
    },
    {
      level: 2,
      heading: "5. Livraison",
      body: [
        {
          type: "p",
          text: "Le vendeur s'engage à expédier la carte dans un délai de [Nombre] jours ouvrés après la validation du paiement. Le vendeur est responsable de l'emballage et de la protection de la carte pendant le transport. L'utilisation d'un suivi d'envoi est fortement recommandée.",
        },
      ],
    },
    {
      level: 2,
      heading: "6. Droit de rétractation",
      body: [
        {
          type: "p",
          text: "Conformément à l'article L221-18 du Code de la consommation, les transactions entre particuliers ne sont pas soumises au droit de rétractation de 14 jours. Toutefois, PokeMarket encourage les utilisateurs à trouver des solutions amiables en cas de litige.",
        },
      ],
    },
    {
      level: 2,
      heading: "7. Litiges et réclamations",
      body: [
        {
          type: "p",
          text: "En cas de non-conformité de l'article reçu (article différent de la description, contrefaçon, article endommagé), l'acheteur dispose de [Nombre] jours après réception pour ouvrir une réclamation via la plateforme. PokeMarket centralise le support paiement, instruit la réclamation et peut rembourser l'acheteur, en totalité ou en partie, en cas de litige avéré.",
        },
      ],
    },
    {
      level: 2,
      heading: "8. Responsabilité",
      body: [
        {
          type: "p",
          text: "PokeMarket ne saurait être tenu responsable des dommages directs ou indirects résultant de l'utilisation de la plateforme, de la qualité des articles vendus, des retards de livraison ou de la perte de colis.",
        },
      ],
    },
    {
      level: 2,
      heading: "9. Modification des CGV",
      body: [
        {
          type: "p",
          text: "PokeMarket se réserve le droit de modifier les présentes CGV à tout moment. Les utilisateurs seront informés de toute modification par notification sur la plateforme. L'utilisation continue de la plateforme après notification vaut acceptation des CGV modifiées.",
        },
      ],
    },
    {
      level: 2,
      heading: "10. Droit applicable et juridiction",
      body: [
        {
          type: "p",
          text: "Les présentes CGV sont soumises au droit français. En cas de litige, et après échec de toute tentative de résolution amiable, les tribunaux compétents de [Ville] seront seuls compétents.",
        },
      ],
    },
    {
      level: 2,
      heading: "Contact",
      body: [
        {
          type: "p",
          text: "Pour toute question relative aux présentes CGV, vous pouvez nous contacter à l'adresse suivante : [Email de contact].",
        },
      ],
    },
  ],
};
