import { Resend } from "resend";
import type { ReactElement } from "react";

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
