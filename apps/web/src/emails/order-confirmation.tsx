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

interface OrderConfirmationEmailProps {
  buyerName: string;
  listingTitle: string;
  totalAmount: string;
  orderId: string;
  coverImageUrl?: string | null;
}

export default function OrderConfirmationEmail({
  buyerName = "Dresseur",
  listingTitle = "Dracaufeu VMAX",
  totalAmount = "49,99 €",
  orderId = "abc123",
  coverImageUrl,
}: OrderConfirmationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Merci pour votre commande de {listingTitle}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={logo}>PokeMarket</Heading>
          <Hr style={hr} />

          <Heading as="h2" style={heading}>
            Merci pour votre commande !
          </Heading>

          <Text style={paragraph}>Bonjour {buyerName},</Text>
          <Text style={paragraph}>
            Votre paiement a bien été confirmé. Le vendeur a été notifié et
            préparera l&apos;expédition de votre carte.
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
            <Text style={cardPrice}>{totalAmount}</Text>
            <Text style={orderRef}>Commande #{orderId.slice(0, 8)}</Text>
          </Section>

          <Text style={paragraph}>
            Vous recevrez un email de confirmation dès que le vendeur aura
            expédié votre carte.
          </Text>

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
  color: "#6d28d9",
  fontSize: "18px",
  fontWeight: "700" as const,
  margin: "0 0 4px",
};

const orderRef = {
  color: "#9ca3af",
  fontSize: "12px",
  margin: "0",
};

const footer = {
  color: "#9ca3af",
  fontSize: "12px",
  textAlign: "center" as const,
  margin: "0",
};
