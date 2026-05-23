import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Conditions Générales d'Utilisation",
};

export default function CGUPage() {
  return (
    <>
      <h1>Conditions Générales d&apos;Utilisation</h1>
      <p className="text-muted-foreground text-sm">
        Dernière mise à jour : [Date de mise à jour]
      </p>

      <h2>1. Objet</h2>
      <p>
        Les présentes Conditions Générales d&apos;Utilisation (ci-après « CGU »)
        définissent les règles d&apos;utilisation de la plateforme PokeMarket,
        accessible à l&apos;adresse [URL du site], éditée par [Nom de
        l&apos;entreprise].
      </p>
      <p>
        L&apos;inscription et l&apos;utilisation de la plateforme impliquent
        l&apos;acceptation pleine et entière des présentes CGU.
      </p>

      <h2>2. Description du service</h2>
      <p>
        PokeMarket est une marketplace communautaire (C2C) dédiée à la vente et
        à l&apos;achat de cartes à collectionner Pokémon TCG entre particuliers.
        La plateforme propose notamment :
      </p>
      <ul>
        <li>
          La publication d&apos;annonces de vente avec scan OCR intelligent
        </li>
        <li>Un système de recherche et de filtrage avancé</li>
        <li>Un système d&apos;offres et de négociation</li>
        <li>Une messagerie en temps réel entre acheteurs et vendeurs</li>
        <li>Un paiement sécurisé via Stripe Connect</li>
        <li>Un système de suivi de colis et de livraison</li>
        <li>Un système d&apos;évaluation des vendeurs</li>
      </ul>

      <h2>3. Inscription et compte utilisateur</h2>
      <h3>3.1 Conditions d&apos;inscription</h3>
      <p>
        L&apos;inscription est gratuite et réservée aux personnes physiques
        âgées d&apos;au moins 16 ans (ou disposant d&apos;une autorisation
        parentale). L&apos;utilisateur s&apos;engage à fournir des informations
        exactes et à jour lors de son inscription.
      </p>
      <h3>3.2 Sécurité du compte</h3>
      <p>
        L&apos;utilisateur est seul responsable de la confidentialité de ses
        identifiants de connexion. Toute activité réalisée depuis son compte est
        réputée effectuée par lui. En cas de suspicion d&apos;utilisation
        frauduleuse, l&apos;utilisateur doit contacter immédiatement
        l&apos;équipe PokeMarket à [Email de contact].
      </p>

      <h2>4. Obligations des utilisateurs</h2>
      <h3>4.1 En tant que vendeur</h3>
      <ul>
        <li>
          Décrire fidèlement l&apos;état et les caractéristiques des cartes
          mises en vente
        </li>
        <li>
          Ne proposer que des cartes authentiques (les contrefaçons sont
          strictement interdites)
        </li>
        <li>Expédier les cartes dans les délais convenus après paiement</li>
        <li>
          Emballer les cartes de manière à assurer leur protection pendant le
          transport
        </li>
      </ul>
      <h3>4.2 En tant qu&apos;acheteur</h3>
      <ul>
        <li>
          Honorer ses engagements d&apos;achat après validation du paiement
        </li>
        <li>Confirmer la réception des articles dans un délai raisonnable</li>
        <li>
          Signaler tout problème de conformité dans les délais prévus par les
          CGV
        </li>
      </ul>

      <h2>5. Comportement interdit</h2>
      <p>Il est strictement interdit de :</p>
      <ul>
        <li>
          Publier des contenus illicites, diffamatoires, injurieux ou
          discriminatoires
        </li>
        <li>Vendre des contrefaçons ou des articles volés</li>
        <li>Manipuler les prix ou les avis</li>
        <li>Créer plusieurs comptes pour contourner une suspension</li>
        <li>Collecter des données personnelles d&apos;autres utilisateurs</li>
        <li>Utiliser la plateforme à des fins de spam ou de phishing</li>
        <li>
          Contourner le système de paiement sécurisé (transactions hors
          plateforme)
        </li>
        <li>
          Utiliser des scripts, bots ou tout moyen automatisé pour interagir
          avec la plateforme
        </li>
      </ul>

      <h2>6. Modération et sanctions</h2>
      <p>
        PokeMarket se réserve le droit de modérer les contenus publiés et de
        suspendre ou supprimer tout compte ne respectant pas les présentes CGU.
        Les mesures applicables incluent :
      </p>
      <ul>
        <li>Avertissement</li>
        <li>Suppression d&apos;annonces non conformes</li>
        <li>Suspension temporaire du compte</li>
        <li>Bannissement définitif</li>
      </ul>

      <h2>7. Propriété intellectuelle</h2>
      <p>
        L&apos;ensemble des éléments constituant la plateforme (design, logo,
        code source, textes) sont la propriété exclusive de [Nom de
        l&apos;entreprise] et sont protégés par le droit de la propriété
        intellectuelle. Pokémon et Pokémon TCG sont des marques déposées de The
        Pokémon Company / Nintendo.
      </p>

      <h2>8. Disponibilité du service</h2>
      <p>
        PokeMarket s&apos;efforce d&apos;assurer un accès continu à la
        plateforme. Toutefois, PokeMarket ne garantit pas la disponibilité
        permanente du service et ne saurait être tenu responsable des
        interruptions temporaires liées à la maintenance, aux mises à jour ou à
        des causes de force majeure.
      </p>

      <h2>9. Limitation de responsabilité</h2>
      <p>
        PokeMarket agit en qualité d&apos;hébergeur au sens de la loi pour la
        confiance dans l&apos;économie numérique (LCEN). À ce titre, PokeMarket
        n&apos;est pas tenu d&apos;une obligation générale de surveillance des
        contenus publiés, mais s&apos;engage à retirer promptement tout contenu
        manifestement illicite qui lui serait signalé.
      </p>

      <h2>10. Modification des CGU</h2>
      <p>
        PokeMarket se réserve le droit de modifier les présentes CGU à tout
        moment. Les utilisateurs seront informés de toute modification
        substantielle. La poursuite de l&apos;utilisation de la plateforme vaut
        acceptation des CGU modifiées.
      </p>

      <h2>11. Droit applicable</h2>
      <p>
        Les présentes CGU sont soumises au droit français. Tout litige sera
        soumis à la compétence exclusive des tribunaux de [Ville].
      </p>

      <h2>Contact</h2>
      <p>Pour toute question, contactez-nous à : [Email de contact].</p>
    </>
  );
}
