/**
 * MangoPay error normalisation.
 *
 * MangoPay returns errors with a non-2xx status + a JSON body shaped like:
 *   {
 *     "Type": "...",
 *     "Id": "uuid",
 *     "Date": 1700000000,
 *     "errors": { "FieldName": "Reason in english" },
 *     "Message": "...",
 *     "Code": "200000" // optional code
 *   }
 *
 * We surface a typed `MangoPayApiError` so callers can inspect status / code
 * without parsing strings, and so we can map common cases to FR user-facing
 * messages instead of leaking english Stripe-style errors to buyers.
 */

export class MangoPayApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly type: string | null;
  readonly fields: Record<string, string>;
  readonly raw: unknown;

  constructor(opts: {
    status: number;
    message: string;
    code?: string | null;
    type?: string | null;
    fields?: Record<string, string>;
    raw?: unknown;
  }) {
    super(opts.message);
    this.name = "MangoPayApiError";
    this.status = opts.status;
    this.code = opts.code ?? null;
    this.type = opts.type ?? null;
    this.fields = opts.fields ?? {};
    this.raw = opts.raw;
  }
}

export function isMangoPayError(err: unknown): err is MangoPayApiError {
  return err instanceof MangoPayApiError;
}

/**
 * Maps known MangoPay error codes to user-facing FR messages.
 * Falls back to a generic error if the code is unknown.
 *
 * Source: https://docs.mangopay.com/guides/errors/result-codes
 */
export function mangoPayErrorToFrenchMessage(err: MangoPayApiError): string {
  const code = err.code;

  if (!code) {
    if (err.status === 401) return "Authentification MangoPay invalide.";
    if (err.status === 403) return "Operation non autorisee.";
    if (err.status === 404) return "Ressource MangoPay introuvable.";
    if (err.status === 429)
      return "Trop de requetes, reessayez dans quelques secondes.";
    return "Une erreur est survenue avec le prestataire de paiement.";
  }

  // Code families: 0xxxxx success, 1xxxxx warnings, 2xxxxx errors
  switch (code) {
    case "001999":
    case "001001":
      return "Solde insuffisant pour effectuer cette operation.";
    case "002999":
    case "002001":
      return "Action interdite par les regles de conformite.";
    case "005999":
    case "005301":
      return "Transaction refusee, le compte du destinataire ne peut pas etre credite.";
    case "101101":
      return "Carte refusee : transaction declinee par la banque emettrice.";
    case "101102":
      return "Carte refusee : fonds insuffisants.";
    case "101103":
      return "Carte refusee : limite atteinte.";
    case "101104":
    case "101105":
      return "Carte invalide ou expiree.";
    case "101106":
      return "Carte signalee comme volee ou perdue.";
    case "101110":
      return "3D Secure echoue. Reessayez ou utilisez une autre carte.";
    case "101111":
      return "Authentification 3D Secure obligatoire mais non effectuee.";
    case "101112":
      return "Restrictions sur la carte. Contactez votre banque.";
    case "101113":
      return "Carte non autorisee pour ce type de transaction.";
    case "101115":
      return "Achats en ligne non autorises sur cette carte.";
    case "101116":
      return "Limite hebdomadaire atteinte sur votre carte.";
    case "001012":
    case "001013":
    case "001014":
      return "Carte expiree.";
    case "002400":
      return "Adresse IBAN invalide ou non supportee.";
    case "008500":
      return "Restrictions KYC : verifiez votre identite pour proceder.";
    default:
      return err.message ?? "Une erreur est survenue lors du paiement.";
  }
}
