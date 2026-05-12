import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Politique de Confidentialité",
};

export default function PrivacyPage() {
  return (
    <>
      <h1>Politique de Confidentialité</h1>
      <p className="text-muted-foreground text-sm">
        Dernière mise à jour : [Date de mise à jour]
      </p>

      <p>
        La présente Politique de Confidentialité décrit comment [Nom de
        l&apos;entreprise] (ci-après « PokeMarket », « nous ») collecte,
        utilise, stocke et protège vos données personnelles conformément au
        Règlement Général sur la Protection des Données (RGPD — Règlement UE
        2016/679) et à la loi Informatique et Libertés.
      </p>

      <h2>1. Responsable du traitement</h2>
      <p>
        Le responsable du traitement des données personnelles est :<br />
        [Nom de l&apos;entreprise]
        <br />
        [Adresse]
        <br />
        Email : [Email de contact]
        <br />
        SIRET : [Numéro SIRET]
      </p>

      <h2>2. Données collectées</h2>
      <h3>2.1 Données fournies directement</h3>
      <ul>
        <li>
          <strong>Inscription :</strong> adresse email, nom d&apos;utilisateur,
          mot de passe (hashé), avatar
        </li>
        <li>
          <strong>Profil vendeur :</strong> nom complet, adresse postale (pour
          l&apos;expédition), numéro de téléphone (optionnel)
        </li>
        <li>
          <strong>Paiement :</strong> les données bancaires sont traitées
          exclusivement par Stripe (conforme PCI-DSS). PokeMarket ne stocke
          aucune donnée bancaire directement
        </li>
        <li>
          <strong>Messagerie :</strong> contenu des messages échangés entre
          utilisateurs
        </li>
        <li>
          <strong>Annonces :</strong> photos de cartes, descriptions, prix
        </li>
      </ul>
      <h3>2.2 Données collectées automatiquement</h3>
      <ul>
        <li>
          <strong>Données techniques :</strong> adresse IP, type de navigateur,
          système d&apos;exploitation, résolution d&apos;écran
        </li>
        <li>
          <strong>Données de navigation :</strong> pages consultées, durée de
          visite, actions effectuées
        </li>
        <li>
          <strong>Cookies :</strong> voir la section 7 ci-dessous
        </li>
      </ul>

      <h2>3. Finalités et bases légales</h2>
      <table>
        <thead>
          <tr>
            <th>Finalité</th>
            <th>Base légale</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Gestion du compte et authentification</td>
            <td>Exécution du contrat (CGU)</td>
          </tr>
          <tr>
            <td>Traitement des transactions et paiements</td>
            <td>Exécution du contrat (CGV)</td>
          </tr>
          <tr>
            <td>Messagerie entre utilisateurs</td>
            <td>Exécution du contrat</td>
          </tr>
          <tr>
            <td>Envoi de notifications (push, email)</td>
            <td>Consentement / intérêt légitime</td>
          </tr>
          <tr>
            <td>Modération et lutte anti-fraude</td>
            <td>Intérêt légitime</td>
          </tr>
          <tr>
            <td>Amélioration du service et statistiques</td>
            <td>Intérêt légitime</td>
          </tr>
          <tr>
            <td>Obligations légales (facturation, fiscalité)</td>
            <td>Obligation légale</td>
          </tr>
        </tbody>
      </table>

      <h2>4. Durée de conservation</h2>
      <ul>
        <li>
          <strong>Données de compte :</strong> conservées pendant la durée de
          l&apos;inscription + 3 ans après la suppression du compte
        </li>
        <li>
          <strong>Données de transaction :</strong> 10 ans (obligations
          comptables et fiscales)
        </li>
        <li>
          <strong>Messages :</strong> 1 an après la dernière activité de la
          conversation
        </li>
        <li>
          <strong>Données de navigation :</strong> 13 mois maximum
        </li>
        <li>
          <strong>Cookies :</strong> voir la section 7
        </li>
      </ul>

      <h2>5. Destinataires des données</h2>
      <p>Vos données peuvent être partagées avec :</p>
      <ul>
        <li>
          <strong>Stripe Inc.</strong> — traitement des paiements (conforme
          PCI-DSS, Privacy Shield certifié)
        </li>
        <li>
          <strong>Supabase Inc.</strong> — hébergement de la base de données et
          authentification (serveurs UE)
        </li>
        <li>
          <strong>Vercel Inc.</strong> — hébergement de l&apos;application
          (serveurs UE via edge network)
        </li>
        <li>
          <strong>Sentry</strong> — monitoring des erreurs (données anonymisées)
        </li>
        <li>
          <strong>OpenAI</strong> — reconnaissance OCR des cartes (images de
          cartes uniquement, sans données personnelles)
        </li>
      </ul>
      <p>
        Aucune donnée personnelle n&apos;est vendue à des tiers. Les transferts
        hors UE sont encadrés par des clauses contractuelles types (CCT) ou des
        décisions d&apos;adéquation de la Commission européenne.
      </p>

      <h2>6. Vos droits (RGPD)</h2>
      <p>Conformément au RGPD, vous disposez des droits suivants :</p>
      <ul>
        <li>
          <strong>Droit d&apos;accès :</strong> obtenir une copie de vos données
          personnelles
        </li>
        <li>
          <strong>Droit de rectification :</strong> corriger vos données
          inexactes ou incomplètes
        </li>
        <li>
          <strong>Droit à l&apos;effacement :</strong> demander la suppression
          de vos données (« droit à l&apos;oubli »)
        </li>
        <li>
          <strong>Droit à la portabilité :</strong> recevoir vos données dans un
          format structuré et lisible par machine
        </li>
        <li>
          <strong>Droit d&apos;opposition :</strong> vous opposer au traitement
          de vos données pour des motifs légitimes
        </li>
        <li>
          <strong>Droit à la limitation :</strong> demander la suspension du
          traitement de vos données
        </li>
        <li>
          <strong>Droit de retrait du consentement :</strong> retirer votre
          consentement à tout moment pour les traitements fondés sur celui-ci
        </li>
      </ul>
      <p>
        Pour exercer vos droits, contactez-nous à : [Email de contact]. Nous
        répondrons dans un délai de 30 jours. En cas de désaccord, vous pouvez
        introduire une réclamation auprès de la CNIL (
        <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer">
          www.cnil.fr
        </a>
        ).
      </p>

      <h2>7. Cookies</h2>
      <h3>7.1 Cookies essentiels (sans consentement)</h3>
      <ul>
        <li>
          <strong>Authentification Supabase :</strong> cookies de session
          nécessaires à la connexion et au maintien de votre session
        </li>
        <li>
          <strong>Sécurité :</strong> jetons CSRF, protection contre les
          attaques
        </li>
        <li>
          <strong>Préférences :</strong> thème (clair/sombre), préférences de
          consentement
        </li>
      </ul>
      <h3>7.2 Cookies de mesure d&apos;audience (avec consentement)</h3>
      <ul>
        <li>
          <strong>Sentry :</strong> collecte anonymisée de données de
          performance et d&apos;erreurs pour améliorer la stabilité du service
        </li>
      </ul>
      <p>
        Vous pouvez gérer vos préférences de cookies à tout moment via la
        bannière de consentement ou les paramètres de votre navigateur. La durée
        de vie des cookies est de 13 mois maximum conformément aux
        recommandations de la CNIL.
      </p>

      <h2>8. Sécurité des données</h2>
      <p>
        Nous mettons en œuvre des mesures techniques et organisationnelles
        appropriées pour protéger vos données :
      </p>
      <ul>
        <li>Chiffrement des données en transit (TLS/HTTPS)</li>
        <li>Chiffrement des mots de passe (bcrypt)</li>
        <li>Row Level Security (RLS) sur la base de données</li>
        <li>Authentification à deux facteurs disponible</li>
        <li>Audits de sécurité réguliers</li>
      </ul>

      <h2>9. Modifications</h2>
      <p>
        Nous nous réservons le droit de modifier cette politique à tout moment.
        En cas de modification substantielle, vous serez informé(e) par email ou
        par notification sur la plateforme.
      </p>

      <h2>Contact DPO</h2>
      <p>
        Pour toute question relative à la protection de vos données :<br />
        [Nom du DPO ou responsable]
        <br />
        Email : [Email DPO]
        <br />
        Adresse : [Adresse]
      </p>
    </>
  );
}
