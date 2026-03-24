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

interface WelcomeEmailProps {
  username: string;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://pokemarket.fr";

export default function WelcomeEmail({
  username = "Dresseur",
}: WelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Bienvenue sur PokeMarket, {username} ! Achetez et vendez vos cartes
        Pokémon.
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={logo}>PokeMarket</Heading>
          <Hr style={hr} />

          <Heading as="h2" style={heading}>
            Bienvenue sur PokeMarket !
          </Heading>

          <Text style={paragraph}>Bonjour {username},</Text>
          <Text style={paragraph}>
            Merci de nous rejoindre ! PokeMarket est la marketplace pensée par
            et pour les dresseurs. Achetez des cartes rares en toute confiance
            ou vendez celles de votre collection en quelques secondes.
          </Text>

          <Section style={stepsBox}>
            <Text style={stepTitle}>🔍 Acheter</Text>
            <Text style={stepDescription}>
              Parcourez des milliers d&apos;annonces, filtrez par set, rareté ou
              prix et payez en toute sécurité via Stripe.
            </Text>

            <Text style={stepTitle}>📸 Vendre</Text>
            <Text style={stepDescription}>
              Scannez votre carte, notre IA reconnaît le modèle et estime le
              prix. Publiez en moins d&apos;une minute.
            </Text>

            <Text style={stepTitle}>💬 Négocier</Text>
            <Text style={stepDescription}>
              Envoyez des offres, discutez avec les vendeurs et trouvez le
              meilleur deal.
            </Text>
          </Section>

          <Section style={ctaSection}>
            <Button href={`${APP_URL}/search`} style={ctaButton}>
              Explorer le marketplace
            </Button>
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

const stepsBox = {
  backgroundColor: "#f9fafb",
  borderRadius: "8px",
  padding: "20px",
  margin: "16px 0",
};

const stepTitle = {
  color: "#111827",
  fontSize: "15px",
  fontWeight: "600" as const,
  margin: "0 0 4px",
};

const stepDescription = {
  color: "#6b7280",
  fontSize: "13px",
  lineHeight: "20px",
  margin: "0 0 16px",
};

const ctaSection = {
  textAlign: "center" as const,
  margin: "24px 0 8px",
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

const footer = {
  color: "#9ca3af",
  fontSize: "12px",
  textAlign: "center" as const,
  margin: "0",
};
