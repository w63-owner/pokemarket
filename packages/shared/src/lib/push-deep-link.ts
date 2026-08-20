const MAX_PUSH_DEEP_LINK_LENGTH = 512;

/**
 * Restrict push notification deep links to same-app relative paths.
 *
 * Push payloads can be attacker-influenced via the authenticated
 * `/api/push/send` endpoint (any caller with a conversation/transaction
 * relation). Absolute URLs, protocol-relative URLs, and schemes such as
 * `javascript:` must never reach `clients.openWindow` or mobile routers.
 */
export function sanitizePushDeepLink(
  url: string | null | undefined,
): string | undefined {
  if (url == null) return undefined;
  if (typeof url !== "string") return undefined;

  const trimmed = url.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > MAX_PUSH_DEEP_LINK_LENGTH) return undefined;

  // Relative path only — reject schemes and protocol-relative URLs.
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return undefined;
  if (trimmed.includes("://") || trimmed.includes("\\")) return undefined;

  let decoded: string;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return undefined;
  }

  if (!decoded.startsWith("/") || decoded.startsWith("//")) return undefined;
  if (decoded.includes("://") || decoded.includes("\\")) return undefined;
  if (/[\u0000-\u001F\u007F]/.test(decoded)) return undefined;

  // Keep path/query/hash characters that in-app routes actually use.
  if (!/^\/[A-Za-z0-9\-._~!$&'()*+,;=:@/%?#[\]]*$/.test(trimmed)) {
    return undefined;
  }

  return trimmed;
}
