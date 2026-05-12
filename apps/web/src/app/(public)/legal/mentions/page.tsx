import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mentions Légales",
};

export default function MentionsPage() {
  return (
    <>
      <h1>Mentions Légales</h1>
      <p className="text-muted-foreground text-sm">
        Dernière mise à jour : [Date de mise à jour]
      </p>

      <h2>1. Éditeur du site</h2>
      <p>
        Le site PokeMarket est édité par :<br />
        <strong>[Nom de l&apos;entreprise]</strong>
        <br />
        [Forme juridique] au capital de [Montant du capital] €<br />
        Siège social : [Adresse]
        <br />
        RCS [Ville] — SIRET : [Numéro SIRET]
        <br />
        Numéro de TVA intracommunautaire : [Numéro TVA]
        <br />
        Directeur de la publication : [Nom du directeur de publication]
        <br />
        Email : [Email de contact]
        <br />
        Téléphone : [Numéro de téléphone]
      </p>

      <h2>2. Hébergeur</h2>
      <p>
        Le site est hébergé par :<br />
        <strong>Vercel Inc.</strong>
        <br />
        440 N Barranca Avenue #4133, Covina, CA 91723, USA
        <br />
        Site web :{" "}
        <a href="https://vercel.com" target="_blank" rel="noopener noreferrer">
          vercel.com
        </a>
      </p>
      <p>
        La base de données est hébergée par :<br />
        <strong>Supabase Inc.</strong>
        <br />
        970 Toa Payoh North #07-04, Singapore 318992
        <br />
        Site web :{" "}
        <a
          href="https://supabase.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          supabase.com
        </a>
      </p>

      <h2>3. Propriété intellectuelle</h2>
      <p>
        L&apos;ensemble des contenus présents sur le site PokeMarket (textes,
        graphismes, logo, icônes, images, code source) est la propriété
        exclusive de [Nom de l&apos;entreprise], sauf mention contraire. Toute
        reproduction, représentation, modification, publication ou adaptation de
        tout ou partie des éléments du site est interdite sans autorisation
        écrite préalable.
      </p>
      <p>
        Pokémon, Pokémon TCG et les images de cartes Pokémon sont des marques
        déposées de The Pokémon Company International, Inc. et Nintendo. Les
        images de cartes sont utilisées à des fins d&apos;illustration dans le
        cadre d&apos;annonces de vente entre particuliers.
      </p>

      <h2>4. Données personnelles</h2>
      <p>
        Le traitement des données personnelles est décrit dans notre{" "}
        <a href="/legal/privacy">Politique de Confidentialité</a>. Conformément
        au RGPD, vous disposez d&apos;un droit d&apos;accès, de rectification,
        d&apos;effacement et de portabilité de vos données, ainsi que du droit
        de limiter et de vous opposer à leur traitement.
      </p>
      <p>Pour exercer vos droits, contactez-nous à : [Email de contact].</p>

      <h2>5. Cookies</h2>
      <p>
        Le site utilise des cookies essentiels au fonctionnement du service
        (authentification, sécurité) et des cookies de mesure d&apos;audience
        soumis à votre consentement. Pour en savoir plus, consultez notre{" "}
        <a href="/legal/privacy">Politique de Confidentialité</a> (section
        Cookies).
      </p>

      <h2>6. Médiateur de la consommation</h2>
      <p>
        Conformément aux articles L.611-1 et R.612-1 et suivants du Code de la
        consommation, en cas de litige non résolu, vous pouvez recourir
        gratuitement au service de médiation :<br />
        <strong>[Nom du médiateur]</strong>
        <br />
        [Adresse du médiateur]
        <br />
        Site web : [URL du médiateur]
      </p>

      <h2>7. Plateforme de règlement en ligne des litiges</h2>
      <p>
        Conformément au règlement européen n°524/2013, vous pouvez accéder à la
        plateforme de résolution des litiges en ligne de la Commission
        européenne à l&apos;adresse suivante :{" "}
        <a
          href="https://ec.europa.eu/consumers/odr"
          target="_blank"
          rel="noopener noreferrer"
        >
          https://ec.europa.eu/consumers/odr
        </a>
      </p>

      <h2>8. Crédits</h2>
      <ul>
        <li>Design et développement : [Nom de l&apos;entreprise / agence]</li>
        <li>
          Données de cartes : TCGdex (
          <a
            href="https://tcgdex.dev"
            target="_blank"
            rel="noopener noreferrer"
          >
            tcgdex.dev
          </a>
          )
        </li>
        <li>Icônes : Lucide Icons</li>
      </ul>
    </>
  );
}
