import { Resend } from "resend";
import type { ReactElement } from "react";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_ADDRESS = "PokeMarket <noreply@pokemarket.app>";

export async function sendEmail(
  to: string,
  subject: string,
  template: ReactElement,
): Promise<void> {
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
