/**
 * Country code helpers shared between web and mobile.
 *
 * Both functions guard against missing `Intl` features (Hermes Android
 * runs without `Intl.DisplayNames` unless the host opts into full ICU).
 */

/**
 * Convert an ISO-3166-1 alpha-2 code (e.g. "FR") into its emoji flag.
 * Returns "" on invalid input.
 */
export function countryCodeToFlag(code: string | null | undefined): string {
  if (!code || code.length !== 2) return "";
  const upper = code.toUpperCase();
  const A = 65;
  const REGIONAL_BASE = 0x1f1e6;
  return upper
    .split("")
    .map((char) => {
      const offset = char.charCodeAt(0) - A;
      if (offset < 0 || offset > 25) return "";
      return String.fromCodePoint(REGIONAL_BASE + offset);
    })
    .join("");
}

/**
 * Localized country name (e.g. "FR" + "fr" → "France"). Falls back to
 * the raw code when `Intl.DisplayNames` isn't available.
 */
export function regionDisplayName(
  code: string | null | undefined,
  locale = "fr",
): string {
  if (!code) return "";
  try {
    if (
      typeof Intl !== "undefined" &&
      typeof (Intl as { DisplayNames?: unknown }).DisplayNames === "function"
    ) {
      const dn = new Intl.DisplayNames([locale], { type: "region" });
      return dn.of(code.toUpperCase()) ?? code;
    }
  } catch {
    // Fall through to plain code
  }
  return code;
}
