const OTP_TYPES = ["signup", "email_change", "recovery", "invite"] as const;

export type EmailOtpType = (typeof OTP_TYPES)[number];

export type IncomingUrlAction =
  | { type: "ignore" }
  | {
      type: "verify-otp";
      tokenHash: string;
      otpType: EmailOtpType;
    }
  | {
      type: "exchange-code";
      code: string;
      destination: "confirm" | "reset-password";
    }
  | { type: "navigate"; path: string };

function isOtpType(value: string): value is EmailOtpType {
  return (OTP_TYPES as readonly string[]).includes(value);
}

/**
 * Classifies a universal link or `deckdealr://` URL.
 *
 * PKCE `code` values are exchanged by the caller. Implicit `access_token` /
 * `refresh_token` fragments are ignored: any page can open
 * `deckdealr://auth/confirm#access_token=…&refresh_token=…` and
 * `supabase.auth.setSession` would replace the signed-in account.
 */
export function classifyIncomingUrl(url: string): IncomingUrlAction {
  if (!url) return { type: "ignore" };

  let path: string;
  let searchParams: URLSearchParams;
  try {
    const parsed = new URL(url);

    if (url.startsWith("http")) {
      path = parsed.pathname + parsed.search;
      searchParams = parsed.searchParams;
    } else if (url.startsWith("deckdealr://")) {
      path = `/${parsed.host}${parsed.pathname}${parsed.search}`;
      searchParams = parsed.searchParams;
    } else {
      return { type: "ignore" };
    }
  } catch {
    return { type: "ignore" };
  }

  const tokenHash = searchParams.get("token_hash");
  const otpType = searchParams.get("type");
  if (tokenHash && otpType && isOtpType(otpType)) {
    return { type: "verify-otp", tokenHash, otpType };
  }

  const routePath = path.split("?")[0];
  const code = searchParams.get("code");
  if (routePath === "/auth/confirm" || routePath === "/auth/reset-password") {
    if (!code) return { type: "ignore" };
    return {
      type: "exchange-code",
      code,
      destination:
        routePath === "/auth/reset-password" ? "reset-password" : "confirm",
    };
  }

  if (path.startsWith("/stripe-redirect")) return { type: "ignore" };

  return {
    type: "navigate",
    path: path.replace(/^\/messages\//, "/inbox/"),
  };
}
