import { describe, expect, it } from "vitest";
import { sanitizePushDeepLink } from "./push-deep-link";

describe("sanitizePushDeepLink", () => {
  it("allows in-app relative paths with query/hash", () => {
    expect(sanitizePushDeepLink("/messages/abc")).toBe("/messages/abc");
    expect(sanitizePushDeepLink("/orders/1?tab=ship")).toBe(
      "/orders/1?tab=ship",
    );
    expect(sanitizePushDeepLink("/wallet#payouts")).toBe("/wallet#payouts");
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(sanitizePushDeepLink("https://evil.example/phish")).toBeUndefined();
    expect(sanitizePushDeepLink("http://evil.example/phish")).toBeUndefined();
    expect(sanitizePushDeepLink("//evil.example/phish")).toBeUndefined();
    expect(
      sanitizePushDeepLink("https://pokemarket.app/messages/1"),
    ).toBeUndefined();
  });

  it("rejects dangerous schemes and encoded bypasses", () => {
    expect(sanitizePushDeepLink("javascript:alert(1)")).toBeUndefined();
    expect(sanitizePushDeepLink("data:text/html,hi")).toBeUndefined();
    expect(sanitizePushDeepLink("/%2F%2Fevil.example")).toBeUndefined();
    expect(sanitizePushDeepLink("/\\evil.example")).toBeUndefined();
    expect(sanitizePushDeepLink("/messages/\u0000id")).toBeUndefined();
  });

  it("rejects empty/invalid input", () => {
    expect(sanitizePushDeepLink(undefined)).toBeUndefined();
    expect(sanitizePushDeepLink(null)).toBeUndefined();
    expect(sanitizePushDeepLink("")).toBeUndefined();
    expect(sanitizePushDeepLink("   ")).toBeUndefined();
    expect(sanitizePushDeepLink("messages/1")).toBeUndefined();
  });
});
