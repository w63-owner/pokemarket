import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface SaleNotificationEmailProps {
  sellerName: string;
  listingTitle: string;
  saleAmount: string;
  orderId: string;
  coverImageUrl?: string | null;
}

export default function SaleNotificationEmail({
  sellerName = "Vendeur",
  listingTitle = "Dracaufeu VMAX",
  saleAmount = "47,00 €",
  orderId = "abc123",
  coverImageUrl,
}: SaleNotificationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Vous avez vendu {listingTitle} ! Expédiez-le vite.</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={logo}>PokeMarket</Heading>
          <Hr style={hr} />

          <Heading as="h2" style={heading}>
            Félicitations, vous avez une vente !
          </Heading>

          <Text style={paragraph}>Bonjour {sellerName},</Text>
          <Text style={paragraph}>
            Un acheteur vient de confirmer le paiement pour votre carte.
            Préparez l&apos;expédition dès que possible !
          </Text>

          <Section style={cardBox}>
            {coverImageUrl && (
              <Img
                src={coverImageUrl}
                alt={listingTitle}
                width={120}
                height={168}
                style={cardImage}
              />
            )}
            <Text style={cardTitle}>{listingTitle}</Text>
            <Text style={cardPrice}>{saleAmount}</Text>
            <Text style={orderRef}>Commande #{orderId.slice(0, 8)}</Text>
          </Section>

          <Section style={tipBox}>
            <Text style={tipText}>
              Expédiez votre carte dans les meilleurs délais. L&apos;acheteur
              sera notifié dès que vous aurez renseigné le numéro de suivi.
            </Text>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>PokeMarket — La marketplace des dresseurs</Text>
        </Container>
      </Body>
    </Html>
  );
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
  backgroundColor: "#f9fafb",
  borderRadius: "8px",
  padding: "20px",
  textAlign: "center" as const,
  margin: "16px 0",
};

const cardImage = {
  margin: "0 auto 12px",
  borderRadius: "6px",
  objectFit: "cover" as const,
};

const cardTitle = {
  color: "#111827",
  fontSize: "16px",
  fontWeight: "600" as const,
  margin: "0 0 4px",
};

const cardPrice = {
  color: "#059669",
  fontSize: "18px",
  fontWeight: "700" as const,
  margin: "0 0 4px",
};

const orderRef = {
  color: "#9ca3af",
  fontSize: "12px",
  margin: "0",
};

const tipBox = {
  backgroundColor: "#fef3c7",
  borderRadius: "8px",
  padding: "12px 16px",
  margin: "16px 0",
};

const tipText = {
  color: "#92400e",
  fontSize: "13px",
  lineHeight: "20px",
  margin: "0",
};

const footer = {
  color: "#9ca3af",
  fontSize: "12px",
  textAlign: "center" as const,
  margin: "0",
};
