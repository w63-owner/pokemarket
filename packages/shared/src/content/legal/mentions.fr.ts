import type { LegalDocument } from "./types";

export const mentionsFr: LegalDocument = {
  slug: "mentions",
  title: "Mentions Légales",
  lastUpdated: "[Date de mise à jour]",
  sections: [
    {
      level: 2,
      heading: "1. Éditeur du site",
      body: [
        {
          type: "p",
          text: "Le site PokeMarket est édité par : [Nom de l'entreprise], [Forme juridique] au capital de [Montant du capital] €. Siège social : [Adresse]. RCS [Ville] — SIRET : [Numéro SIRET]. Numéro de TVA intracommunautaire : [Numéro TVA]. Directeur de la publication : [Nom du directeur de publication]. Email : [Email de contact]. Téléphone : [Numéro de téléphone].",
        },
      ],
    },
    {
      level: 2,
      heading: "2. Hébergeur",
      body: [
        {
          type: "p",
          text: "Le site est hébergé par : Vercel Inc., 440 N Barranca Avenue #4133, Covina, CA 91723, USA. Site web : vercel.com.",
        },
        {
          type: "p",
          text: "La base de données est hébergée par : Supabase Inc., 970 Toa Payoh North #07-04, Singapore 318992. Site web : supabase.com.",
        },
      ],
    },
    {
      level: 2,
      heading: "3. Propriété intellectuelle",
      body: [
        {
          type: "p",
          text: "L'ensemble des contenus présents sur le site PokeMarket (textes, graphismes, logo, icônes, images, code source) est la propriété exclusive de [Nom de l'entreprise], sauf mention contraire. Toute reproduction, représentation, modification, publication ou adaptation de tout ou partie des éléments du site est interdite sans autorisation écrite préalable.",
        },
        {
          type: "p",
          text: "Pokémon, Pokémon TCG et les images de cartes Pokémon sont des marques déposées de The Pokémon Company International, Inc. et Nintendo. Les images de cartes sont utilisées à des fins d'illustration dans le cadre d'annonces de vente entre particuliers.",
        },
      ],
    },
    {
      level: 2,
      heading: "4. Données personnelles",
      body: [
        {
          type: "p",
          text: "Le traitement des données personnelles est décrit dans notre Politique de Confidentialité. Conformément au RGPD, vous disposez d'un droit d'accès, de rectification, d'effacement et de portabilité de vos données, ainsi que du droit de limiter et de vous opposer à leur traitement.",
        },
        {
          type: "p",
          text: "Pour exercer vos droits, contactez-nous à : [Email de contact].",
        },
      ],
    },
    {
      level: 2,
      heading: "5. Cookies",
      body: [
        {
          type: "p",
          text: "Le site utilise des cookies essentiels au fonctionnement du service (authentification, sécurité) et des cookies de mesure d'audience soumis à votre consentement. Pour en savoir plus, consultez notre Politique de Confidentialité (section Cookies).",
        },
      ],
    },
    {
      level: 2,
      heading: "6. Médiateur de la consommation",
      body: [
        {
          type: "p",
          text: "Conformément aux articles L.611-1 et R.612-1 et suivants du Code de la consommation, en cas de litige non résolu, vous pouvez recourir gratuitement au service de médiation : [Nom du médiateur], [Adresse du médiateur]. Site web : [URL du médiateur].",
        },
      ],
    },
    {
      level: 2,
      heading: "7. Plateforme de règlement en ligne des litiges",
      body: [
        {
          type: "p",
          text: "Conformément au règlement européen n°524/2013, vous pouvez accéder à la plateforme de résolution des litiges en ligne de la Commission européenne à l'adresse suivante : https://ec.europa.eu/consumers/odr.",
        },
      ],
    },
    {
      level: 2,
      heading: "8. Crédits",
      body: [
        {
          type: "ul",
          items: [
            "Design et développement : [Nom de l'entreprise / agence]",
            "Données de cartes : TCGdex (tcgdex.dev)",
            "Icônes : Lucide Icons",
          ],
        },
      ],
    },
  ],
};
