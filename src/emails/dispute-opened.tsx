import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface DisputeOpenedEmailProps {
  recipientName?: string;
  audience: "seller" | "admin";
  listingTitle: string;
  amount: string;
  reason: string;
  evidenceDueBy?: string | null;
  disputeId: string;
}

export default function DisputeOpenedEmail({
  recipientName,
  audience,
  listingTitle = "Carte Pokémon",
  amount = "0,00 €",
  reason = "fraudulent",
  evidenceDueBy,
  disputeId,
}: DisputeOpenedEmailProps) {
  const isAdmin = audience === "admin";
  const subject = isAdmin
    ? "Nouveau chargeback à traiter"
    : "Un litige a été ouvert sur votre vente";

  return (
    <Html>
      <Head />
      <Preview>
        {isAdmin ? "Action requise" : "Action requise"} : litige bancaire{" "}
        {amount}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={logo}>PokeMarket</Heading>
          <Hr style={hr} />

          <Heading as="h2" style={heading}>
            {subject}
          </Heading>

          <Text style={paragraph}>
            {recipientName ? `Bonjour ${recipientName},` : "Bonjour,"}
          </Text>

          {isAdmin ? (
            <Text style={paragraph}>
              Un chargeback bancaire vient d&apos;être ouvert. Soumets des
              preuves dans le dashboard admin avant la deadline pour éviter une
              perte automatique.
            </Text>
          ) : (
            <Text style={paragraph}>
              L&apos;acheteur de votre carte a contesté le paiement auprès de sa
              banque. Les fonds correspondants sont temporairement gelés.
              L&apos;équipe PokeMarket va se charger de répondre à la banque
              avec les preuves de livraison ; aucun action n&apos;est requise de
              votre côté pour le moment.
            </Text>
          )}

          <Section style={cardBox}>
            <Text style={cardTitle}>{listingTitle}</Text>
            <Text style={cardPrice}>{amount}</Text>
            <Text style={orderRef}>Litige #{disputeId.slice(-12)}</Text>
            <Text style={metaText}>Motif déclaré : {reason}</Text>
            {evidenceDueBy && (
              <Text style={metaText}>
                Deadline preuves : {formatDate(evidenceDueBy)}
              </Text>
            )}
          </Section>

          <Hr style={hr} />
          <Text style={footer}>PokeMarket — La marketplace des dresseurs</Text>
        </Container>
      </Body>
    </Html>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "32px 24px",
  maxWidth: "480px",
  borderRadius: "12px",
};

const logo = {
  color: "#6d28d9",
  fontSize: "24px",
  fontWeight: "700" as const,
  textAlign: "center" as const,
  margin: "0 0 16px",
};

const hr = {
  borderColor: "#e5e7eb",
  margin: "24px 0",
};

const heading = {
  color: "#111827",
  fontSize: "20px",
  fontWeight: "600" as const,
  margin: "0 0 16px",
};

const paragraph = {
  color: "#374151",
  fontSize: "14px",
  lineHeight: "24px",
  margin: "0 0 12px",
};

const cardBox = {
  backgroundColor: "#fef2f2",
  borderRadius: "8px",
  padding: "20px",
  textAlign: "center" as const,
  margin: "16px 0",
};

const cardTitle = {
  color: "#111827",
  fontSize: "16px",
  fontWeight: "600" as const,
  margin: "0 0 4px",
};

const cardPrice = {
  color: "#dc2626",
  fontSize: "18px",
  fontWeight: "700" as const,
  margin: "0 0 4px",
};

const orderRef = {
  color: "#9ca3af",
  fontSize: "12px",
  margin: "0 0 8px",
};

const metaText = {
  color: "#6b7280",
  fontSize: "12px",
  margin: "2px 0",
};

const footer = {
  color: "#9ca3af",
  fontSize: "12px",
  textAlign: "center" as const,
  margin: "0",
};
