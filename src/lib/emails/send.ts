import { Resend } from "resend";
import type { ReactElement } from "react";
import WelcomeEmail from "@/emails/welcome";
import NewOfferEmail from "@/emails/new-offer";
import ShippingReminderEmail from "@/emails/shipping-reminder";

const FROM_ADDRESS = "PokeMarket <noreply@pokemarket.app>";

let _resend: Resend | null = null;
function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

export async function sendEmail(
  to: string,
  subject: string,
  template: ReactElement,
): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.warn("[sendEmail] RESEND_API_KEY not set, skipping email");
    return;
  }
  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject,
      react: template,
    });
  } catch (err) {
    console.error("[sendEmail] Failed to send email:", err);
  }
}

// ---------------------------------------------------------------------------
// Typed send helpers
// ---------------------------------------------------------------------------

export async function sendWelcomeEmail(
  to: string,
  data: { username: string },
): Promise<void> {
  await sendEmail(
    to,
    `Bienvenue sur PokeMarket, ${data.username} !`,
    WelcomeEmail({ username: data.username }),
  );
}

export interface NewOfferEmailData {
  sellerName: string;
  listingTitle: string;
  offerAmount: string;
  offererName: string;
  conversationUrl: string;
  coverImageUrl?: string | null;
}

export async function sendNewOfferEmail(
  to: string,
  data: NewOfferEmailData,
): Promise<void> {
  await sendEmail(
    to,
    `${data.offererName} vous propose ${data.offerAmount} pour ${data.listingTitle}`,
    NewOfferEmail(data),
  );
}

export interface ShippingReminderEmailData {
  sellerName: string;
  listingTitle: string;
  orderId: string;
  daysSincePaid: number;
  transactionUrl: string;
}

export async function sendShippingReminderEmail(
  to: string,
  data: ShippingReminderEmailData,
): Promise<void> {
  await sendEmail(
    to,
    `Rappel : expédiez « ${data.listingTitle} » — commande en attente`,
    ShippingReminderEmail(data),
  );
}
