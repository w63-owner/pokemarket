import { classifyIncomingUrl } from "./incoming-url";

describe("classifyIncomingUrl", () => {
  it("does not adopt implicit session tokens from a custom-scheme link", () => {
    expect(
      classifyIncomingUrl(
        "deckdealr://auth/confirm#access_token=attacker-access&refresh_token=attacker-refresh",
      ),
    ).toEqual({ type: "ignore" });
  });

  it("does not adopt implicit session tokens from an https link", () => {
    expect(
      classifyIncomingUrl(
        "https://evil.example/auth/confirm#access_token=attacker-access&refresh_token=attacker-refresh",
      ),
    ).toEqual({ type: "ignore" });
  });

  it("exchanges a PKCE code on the signup confirmation link", () => {
    expect(
      classifyIncomingUrl("deckdealr://auth/confirm?code=signup-code"),
    ).toEqual({
      type: "exchange-code",
      code: "signup-code",
      destination: "confirm",
    });
  });

  it("prefers the PKCE code when a link also carries implicit tokens", () => {
    expect(
      classifyIncomingUrl(
        "deckdealr://auth/confirm?code=signup-code#access_token=attacker-access&refresh_token=attacker-refresh",
      ),
    ).toEqual({
      type: "exchange-code",
      code: "signup-code",
      destination: "confirm",
    });
  });

  it("exchanges the PKCE code on the password-reset link", () => {
    expect(
      classifyIncomingUrl(
        "deckdealr://auth/reset-password?code=recovery-code",
      ),
    ).toEqual({
      type: "exchange-code",
      code: "recovery-code",
      destination: "reset-password",
    });
  });

  it("verifies one-time email token hashes", () => {
    expect(
      classifyIncomingUrl(
        "deckdealr://auth/reset-password?token_hash=hash&type=recovery",
      ),
    ).toEqual({
      type: "verify-otp",
      tokenHash: "hash",
      otpType: "recovery",
    });
  });

  it("rewrites message links and ignores stripe return links", () => {
    expect(classifyIncomingUrl("deckdealr://messages/conv-1")).toEqual({
      type: "navigate",
      path: "/inbox/conv-1",
    });
    expect(
      classifyIncomingUrl("deckdealr://stripe-redirect?status=complete"),
    ).toEqual({ type: "ignore" });
  });
});
