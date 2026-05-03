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

interface WeeklyStripeReportEmailProps {
  weekStart: string;
  weekEnd: string;
  refundCount: number;
  refundTotal: string;
  internalDisputesOpened: number;
  stripeChargebacksOpened: number;
  stripeChargebacksWon: number;
  stripeChargebacksLost: number;
  payoutFailures: number;
  gmv: string;
  disputeRatePercent: string;
}

export default function WeeklyStripeReportEmail({
  weekStart = "01/01/2026",
  weekEnd = "07/01/2026",
  refundCount = 0,
  refundTotal = "0,00 €",
  internalDisputesOpened = 0,
  stripeChargebacksOpened = 0,
  stripeChargebacksWon = 0,
  stripeChargebacksLost = 0,
  payoutFailures = 0,
  gmv = "0,00 €",
  disputeRatePercent = "0,00 %",
}: WeeklyStripeReportEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {`Rapport hebdo PokeMarket — ${refundCount} remboursements, ${stripeChargebacksOpened} chargebacks`}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={logo}>PokeMarket — Stripe weekly</Heading>
          <Hr style={hr} />

          <Heading as="h2" style={heading}>
            Semaine du {weekStart} au {weekEnd}
          </Heading>

          <Section style={kpiBox}>
            <Text style={kpiLabel}>GMV de la semaine</Text>
            <Text style={kpiValue}>{gmv}</Text>
          </Section>

          <Section style={kpiBox}>
            <Text style={kpiLabel}>Taux de litige (chargebacks / GMV)</Text>
            <Text style={kpiValue}>{disputeRatePercent}</Text>
          </Section>

          <Heading as="h3" style={subheading}>
            Remboursements
          </Heading>
          <Text style={paragraph}>
            <strong>{refundCount}</strong> remboursement
            {refundCount !== 1 ? "s" : ""} pour un total de{" "}
            <strong>{refundTotal}</strong>.
          </Text>

          <Heading as="h3" style={subheading}>
            Chargebacks Stripe
          </Heading>
          <Text style={paragraph}>
            Ouverts : <strong>{stripeChargebacksOpened}</strong> · Gagnés :{" "}
            <strong>{stripeChargebacksWon}</strong> · Perdus :{" "}
            <strong>{stripeChargebacksLost}</strong>
          </Text>

          <Heading as="h3" style={subheading}>
            Litiges internes (DAMAGED_CARD, …)
          </Heading>
          <Text style={paragraph}>
            <strong>{internalDisputesOpened}</strong> nouveau
            {internalDisputesOpened !== 1 ? "x" : ""} litige
            {internalDisputesOpened !== 1 ? "s" : ""}.
          </Text>

          <Heading as="h3" style={subheading}>
            Virements échoués
          </Heading>
          <Text style={paragraph}>
            <strong>{payoutFailures}</strong> payout
            {payoutFailures !== 1 ? "s" : ""} en échec — vérifie les vendeurs
            concernés (IBAN à corriger).
          </Text>

          <Hr style={hr} />
          <Text style={footer}>
            Rapport généré automatiquement par /api/cron/stripe-weekly-report
          </Text>
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
  maxWidth: "560px",
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

const subheading = {
  color: "#374151",
  fontSize: "15px",
  fontWeight: "600" as const,
  margin: "16px 0 6px",
};

const paragraph = {
  color: "#374151",
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0 0 8px",
};

const kpiBox = {
  backgroundColor: "#f3f4f6",
  borderRadius: "8px",
  padding: "12px 16px",
  margin: "8px 0",
  textAlign: "center" as const,
};

const kpiLabel = {
  color: "#6b7280",
  fontSize: "12px",
  margin: "0 0 4px",
};

const kpiValue = {
  color: "#111827",
  fontSize: "20px",
  fontWeight: "700" as const,
  margin: "0",
};

const footer = {
  color: "#9ca3af",
  fontSize: "12px",
  textAlign: "center" as const,
  margin: "0",
};
