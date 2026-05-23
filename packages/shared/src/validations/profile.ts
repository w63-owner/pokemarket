/**
 * Profile-specific validation helpers. Kept separate from the main
 * validations file so they can be imported by both web and mobile
 * without pulling in unrelated marketplace schemas.
 */

/**
 * Normalize a user-supplied URL: trim, prepend `https://` if no scheme is
 * present, and return `undefined` for an empty input. Used for social
 * links (Instagram, Facebook, TikTok) where users typically paste the
 * domain without protocol.
 */
export function normalizeUrl(
  raw: string | null | undefined,
): string | undefined {
  if (raw == null) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
