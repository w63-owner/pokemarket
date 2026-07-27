import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Conditions Générales de Vente",
};

export default function CGVPage() {
  return (
    <>
      <h1>Conditions Générales de Vente</h1>
      <p className="text-muted-foreground text-sm">
        Dernière mise à jour : 26 juillet 2026
      </p>

      <h2>1. Objet</h2>
      <p>
        Les présentes Conditions Générales de Vente (ci-après « CGV ») régissent
        l&apos;ensemble des transactions réalisées entre vendeurs et acheteurs
        sur la plateforme PokeMarket, éditée par [Nom de l&apos;entreprise],
        [Forme juridique] au capital de [Montant du capital] €, immatriculée au
        RCS de [Ville] sous le numéro [Numéro SIRET/SIREN], dont le siège social
        est situé au [Adresse].
      </p>
      <p>
        Le contrat de vente de la carte est conclu entre le vendeur et
        l&apos;acheteur. PokeMarket agit comme intermédiaire pour cette vente et
        comme marchand officiel (« merchant of record ») pour le traitement du
        paiement : PokeMarket encaisse l&apos;acheteur, émet les justificatifs
        de paiement et assume la gestion des remboursements, contestations et
        demandes de support liées au paiement.
      </p>

      <h2>2. Rôle de la plateforme</h2>
      <p>
        PokeMarket met à disposition un espace sécurisé de mise en relation
        permettant aux utilisateurs de publier des annonces de vente, de
        consulter les annonces d&apos;autres utilisateurs, de négocier via un
        système d&apos;offres, de communiquer via la messagerie intégrée et
        d&apos;effectuer des paiements sécurisés via Stripe Connect.
      </p>
      <p>
        PokeMarket n&apos;est ni vendeur, ni acheteur, ni garant de la qualité
        des articles mis en vente. La responsabilité de la description fidèle
        des articles incombe exclusivement au vendeur.
      </p>
      <p>
        Stripe fournit l&apos;infrastructure de paiement à PokeMarket. Le
        vendeur n&apos;encaisse pas directement le paiement par carte de
        l&apos;acheteur et ne doit pas contacter Stripe pour le support de la
        transaction.
      </p>

      <h2>3. Prix et commissions</h2>
      <p>
        Les prix sont fixés librement par les vendeurs et affichés en euros (€).
        Chaque vendeur demeure responsable de son statut fiscal, de la
        qualification particulière ou professionnelle de son activité et, le cas
        échéant, de la déclaration et du paiement des taxes applicables.
      </p>
      <p>
        PokeMarket prélève une commission de [Pourcentage]% sur chaque
        transaction finalisée. Cette commission est déduite du montant versé au
        vendeur. Les frais de port éventuels sont à la charge de
        l&apos;acheteur, sauf mention contraire dans l&apos;annonce.
      </p>

      <h2>4. Processus de vente</h2>
      <h3>4.1 Mise en vente</h3>
      <p>
        Le vendeur crée une annonce en renseignant les informations relatives à
        la carte (nom, état, photos, prix). Il s&apos;engage à décrire
        fidèlement l&apos;état de la carte selon les catégories proposées (Mint,
        Near Mint, Excellent, Good, Light Played, Played, Poor).
      </p>
      <h3>4.2 Offre et acceptation</h3>
      <p>
        L&apos;acheteur peut acheter au prix affiché ou formuler une
        contre-offre. Le vendeur est libre d&apos;accepter ou de refuser toute
        offre. La vente est conclue dès l&apos;acceptation de l&apos;offre et la
        validation du paiement.
      </p>
      <h3>4.3 Paiement</h3>
      <p>
        PokeMarket encaisse le paiement via Stripe Connect. Le montant dû au
        vendeur reste indisponible jusqu&apos;à la confirmation de réception par
        l&apos;acheteur ou l&apos;expiration du délai de réclamation de [Nombre]
        jours, puis peut être transféré sur le compte Stripe Connect du vendeur.
        Ce mécanisme de disponibilité différée ne constitue pas un service de
        séquestre.
      </p>

      <h2>5. Livraison</h2>
      <p>
        Le vendeur s&apos;engage à expédier la carte dans un délai de [Nombre]
        jours ouvrés après la validation du paiement. Le vendeur est responsable
        de l&apos;emballage et de la protection de la carte pendant le
        transport. L&apos;utilisation d&apos;un suivi d&apos;envoi est fortement
        recommandée.
      </p>

      <h2>6. Droit de rétractation</h2>
      <p>
        Conformément à l&apos;article L221-18 du Code de la consommation, les
        transactions entre particuliers ne sont pas soumises au droit de
        rétractation de 14 jours. Toutefois, PokeMarket encourage les
        utilisateurs à trouver des solutions amiables en cas de litige.
      </p>

      <h2>7. Litiges et réclamations</h2>
      <p>
        En cas de non-conformité de l&apos;article reçu (article différent de la
        description, contrefaçon, article endommagé), l&apos;acheteur dispose de
        [Nombre] jours après réception pour ouvrir une réclamation via la
        plateforme. PokeMarket centralise le support paiement, instruit la
        réclamation et peut rembourser l&apos;acheteur, en totalité ou en
        partie, en cas de litige avéré.
      </p>

      <h2>8. Responsabilité</h2>
      <p>
        PokeMarket ne saurait être tenu responsable des dommages directs ou
        indirects résultant de l&apos;utilisation de la plateforme, de la
        qualité des articles vendus, des retards de livraison ou de la perte de
        colis.
      </p>

      <h2>9. Modification des CGV</h2>
      <p>
        PokeMarket se réserve le droit de modifier les présentes CGV à tout
        moment. Les utilisateurs seront informés de toute modification par
        notification sur la plateforme. L&apos;utilisation continue de la
        plateforme après notification vaut acceptation des CGV modifiées.
      </p>

      <h2>10. Droit applicable et juridiction</h2>
      <p>
        Les présentes CGV sont soumises au droit français. En cas de litige, et
        après échec de toute tentative de résolution amiable, les tribunaux
        compétents de [Ville] seront seuls compétents.
      </p>

      <h2>Contact</h2>
      <p>
        Pour toute question relative aux présentes CGV, vous pouvez nous
        contacter à l&apos;adresse suivante : [Email de contact].
      </p>
    </>
  );
}
