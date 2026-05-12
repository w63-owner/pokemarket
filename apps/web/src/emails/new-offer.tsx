import {
  Body,
  Button,
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

interface NewOfferEmailProps {
  sellerName: string;
  listingTitle: string;
  offerAmount: string;
  offererName: string;
  conversationUrl: string;
  coverImageUrl?: string | null;
}

export default function NewOfferEmail({
  sellerName = "Vendeur",
  listingTitle = "Dracaufeu VMAX",
  offerAmount = "35,00 €",
  offererName = "Sacha",
  conversationUrl = "#",
  coverImageUrl,
}: NewOfferEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {offererName} vous propose {offerAmount} pour {listingTitle}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={logo}>PokeMarket</Heading>
          <Hr style={hr} />

          <Heading as="h2" style={heading}>
            Vous avez reçu une offre !
          </Heading>

          <Text style={paragraph}>Bonjour {sellerName},</Text>
          <Text style={paragraph}>
            <strong>{offererName}</strong> souhaite acheter votre carte et vous
            propose une offre.
          </Text>

          <Section style={offerBox}>
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
            <Text style={offerLabel}>Offre proposée</Text>
            <Text style={offerPrice}>{offerAmount}</Text>
          </Section>

          <Section style={ctaSection}>
            <Button href={conversationUrl} style={ctaButton}>
              Voir l&apos;offre
            </Button>
          </Section>

          <Text style={tipText}>
            Vous pouvez accepter, refuser ou faire une contre-offre directement
            depuis la messagerie.
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

const offerBox = {
  backgroundColor: "#ede9fe",
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
  margin: "0 0 12px",
};

const offerLabel = {
  color: "#6d28d9",
  fontSize: "11px",
  fontWeight: "600" as const,
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  margin: "0 0 4px",
};

const offerPrice = {
  color: "#6d28d9",
  fontSize: "24px",
  fontWeight: "700" as const,
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

const tipText = {
  color: "#6b7280",
  fontSize: "13px",
  lineHeight: "20px",
  textAlign: "center" as const,
  margin: "0 0 8px",
};

const footer = {
  color: "#9ca3af",
  fontSize: "12px",
  textAlign: "center" as const,
  margin: "0",
};
