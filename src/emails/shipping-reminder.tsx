import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface ShippingReminderEmailProps {
  sellerName: string;
  listingTitle: string;
  orderId: string;
  daysSincePaid: number;
  transactionUrl: string;
}

export default function ShippingReminderEmail({
  sellerName = "Vendeur",
  listingTitle = "Dracaufeu VMAX",
  orderId = "abc123",
  daysSincePaid = 3,
  transactionUrl = "#",
}: ShippingReminderEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {`Rappel : expédiez ${listingTitle} — en attente depuis ${daysSincePaid} jours`}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={logo}>PokeMarket</Heading>
          <Hr style={hr} />

          <Heading as="h2" style={heading}>
            N&apos;oubliez pas d&apos;expédier !
          </Heading>

          <Text style={paragraph}>Bonjour {sellerName},</Text>
          <Text style={paragraph}>
            Votre acheteur attend sa carte <strong>{listingTitle}</strong>{" "}
            depuis {daysSincePaid} jours. Pensez à l&apos;expédier dès que
            possible pour garantir une excellente expérience.
          </Text>

          <Section style={reminderBox}>
            <Text style={reminderIcon}>📦</Text>
            <Text style={reminderTitle}>{listingTitle}</Text>
            <Text style={orderRef}>Commande #{orderId.slice(0, 8)}</Text>
            <Text style={reminderDelay}>
              Payée il y a {daysSincePaid} jours
            </Text>
          </Section>

          <Section style={ctaSection}>
            <Button href={transactionUrl} style={ctaButton}>
              Gérer l&apos;expédition
            </Button>
          </Section>

          <Section style={warningBox}>
            <Text style={warningText}>
              Si la commande n&apos;est pas expédiée dans les 7 jours suivant le
              paiement, l&apos;acheteur pourra demander un remboursement
              automatique.
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

const reminderBox = {
  backgroundColor: "#fef3c7",
  borderRadius: "8px",
  padding: "20px",
  textAlign: "center" as const,
  margin: "16px 0",
};

const reminderIcon = {
  fontSize: "32px",
  margin: "0 0 8px",
};

const reminderTitle = {
  color: "#111827",
  fontSize: "16px",
  fontWeight: "600" as const,
  margin: "0 0 4px",
};

const orderRef = {
  color: "#9ca3af",
  fontSize: "12px",
  margin: "0 0 8px",
};

const reminderDelay = {
  color: "#92400e",
  fontSize: "13px",
  fontWeight: "600" as const,
  margin: "0",
};

const ctaSection = {
  textAlign: "center" as const,
  margin: "24px 0 16px",
};

const ctaButton = {
  backgroundColor: "#6d28d9",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: "600" as const,
  padding: "12px 24px",
  borderRadius: "8px",
  textDecoration: "none",
};

const warningBox = {
  backgroundColor: "#fef2f2",
  borderRadius: "8px",
  padding: "12px 16px",
  margin: "0 0 8px",
};

const warningText = {
  color: "#991b1b",
  fontSize: "12px",
  lineHeight: "18px",
  margin: "0",
};

const footer = {
  color: "#9ca3af",
  fontSize: "12px",
  textAlign: "center" as const,
  margin: "0",
};
