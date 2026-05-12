import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface OrderShippedEmailProps {
  buyerName: string;
  listingTitle: string;
  trackingNumber: string;
  trackingUrl?: string | null;
  orderId: string;
}

export default function OrderShippedEmail({
  buyerName = "Dresseur",
  listingTitle = "Dracaufeu VMAX",
  trackingNumber = "1Z999AA10123456784",
  trackingUrl = null,
  orderId = "abc123",
}: OrderShippedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Votre carte {listingTitle} est en route !</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={logo}>PokeMarket</Heading>
          <Hr style={hr} />

          <Heading as="h2" style={heading}>
            Votre carte est en route !
          </Heading>

          <Text style={paragraph}>Bonjour {buyerName},</Text>
          <Text style={paragraph}>
            Bonne nouvelle ! Le vendeur a expédié votre commande. Vous pouvez
            suivre l&apos;acheminement de votre colis.
          </Text>

          <Section style={trackingBox}>
            <Text style={trackingLabel}>Numéro de suivi</Text>
            {trackingUrl ? (
              <Link href={trackingUrl} style={trackingLink}>
                {trackingNumber}
              </Link>
            ) : (
              <Text style={trackingValue}>{trackingNumber}</Text>
            )}
            <Text style={orderRef}>
              Commande #{orderId.slice(0, 8)} — {listingTitle}
            </Text>
          </Section>

          <Text style={paragraph}>
            Dès réception, confirmez-la dans l&apos;application pour que le
            vendeur soit payé et finaliser la transaction.
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

const trackingBox = {
  backgroundColor: "#ede9fe",
  borderRadius: "8px",
  padding: "20px",
  textAlign: "center" as const,
  margin: "16px 0",
};

const trackingLabel = {
  color: "#6d28d9",
  fontSize: "11px",
  fontWeight: "600" as const,
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  margin: "0 0 8px",
};

const trackingValue = {
  color: "#111827",
  fontSize: "18px",
  fontWeight: "700" as const,
  fontFamily: "monospace",
  margin: "0 0 8px",
};

const trackingLink = {
  color: "#6d28d9",
  fontSize: "18px",
  fontWeight: "700" as const,
  fontFamily: "monospace",
  textDecoration: "underline",
};

const orderRef = {
  color: "#9ca3af",
  fontSize: "12px",
  margin: "8px 0 0",
};

const footer = {
  color: "#9ca3af",
  fontSize: "12px",
  textAlign: "center" as const,
  margin: "0",
};
