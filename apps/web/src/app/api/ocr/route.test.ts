import { describe, it, expect } from "vitest";
import { isAllowedSupabaseImageUrl } from "./route";

const SB = "https://abcdefghijklmnop.supabase.co";

describe("isAllowedSupabaseImageUrl", () => {
  describe("accepts legitimate URLs", () => {
    it("accepts a public storage object on the configured host", () => {
      expect(
        isAllowedSupabaseImageUrl(
          `${SB}/storage/v1/object/public/listing-images/uid/1.png`,
          SB,
        ),
      ).toBe(true);
    });

    it("accepts an authenticated storage object", () => {
      expect(
        isAllowedSupabaseImageUrl(
          `${SB}/storage/v1/object/sign/listing-images/uid/1.png?token=xyz`,
          SB,
        ),
      ).toBe(true);
    });
  });

  describe("rejects host-confusion attacks", () => {
    it("rejects suffix-extended domain (e.g. <ref>.supabase.co.evil.com)", () => {
      expect(
        isAllowedSupabaseImageUrl(
          "https://abcdefghijklmnop.supabase.co.evil.com/storage/v1/object/public/listing-images/foo.png",
          SB,
        ),
      ).toBe(false);
    });

    it("rejects different subdomain (e.g. evil.<ref>.supabase.co)", () => {
      expect(
        isAllowedSupabaseImageUrl(
          "https://evil.abcdefghijklmnop.supabase.co/storage/v1/object/public/listing-images/foo.png",
          SB,
        ),
      ).toBe(false);
    });

    it("rejects unrelated domain", () => {
      expect(
        isAllowedSupabaseImageUrl(
          "https://evil.example.com/storage/v1/object/public/listing-images/foo.png",
          SB,
        ),
      ).toBe(false);
    });

    it("rejects userinfo-bypass attempts (e.g. https://abc.supabase.co@evil.com)", () => {
      expect(
        isAllowedSupabaseImageUrl(
          "https://abcdefghijklmnop.supabase.co@evil.com/storage/v1/object/public/x.png",
          SB,
        ),
      ).toBe(false);
    });
  });

  describe("rejects protocol attacks", () => {
    it("rejects HTTP downgrade", () => {
      expect(
        isAllowedSupabaseImageUrl(
          `http://abcdefghijklmnop.supabase.co/storage/v1/object/public/listing-images/x.png`,
          SB,
        ),
      ).toBe(false);
    });

    it("rejects javascript: scheme", () => {
      expect(isAllowedSupabaseImageUrl("javascript:alert('xss')", SB)).toBe(
        false,
      );
    });

    it("rejects data: URLs", () => {
      expect(
        isAllowedSupabaseImageUrl("data:image/png;base64,iVBORw0KGgo=", SB),
      ).toBe(false);
    });

    it("rejects file: URLs", () => {
      expect(isAllowedSupabaseImageUrl("file:///etc/passwd", SB)).toBe(false);
    });
  });

  describe("rejects path attacks", () => {
    it("rejects legitimate host but non-storage path", () => {
      expect(isAllowedSupabaseImageUrl(`${SB}/auth/v1/admin/users`, SB)).toBe(
        false,
      );
    });

    it("rejects bare host root", () => {
      expect(isAllowedSupabaseImageUrl(SB, SB)).toBe(false);
    });

    it("rejects path traversal that does not start with /storage/v1/object/", () => {
      expect(
        isAllowedSupabaseImageUrl(`${SB}/storage/v2/object/public/foo.png`, SB),
      ).toBe(false);
    });
  });

  describe("rejects malformed inputs", () => {
    it("rejects empty image URL", () => {
      expect(isAllowedSupabaseImageUrl("", SB)).toBe(false);
    });

    it("rejects non-URL string", () => {
      expect(isAllowedSupabaseImageUrl("not a url", SB)).toBe(false);
    });

    it("rejects when supabaseUrl is undefined (server misconfig)", () => {
      expect(
        isAllowedSupabaseImageUrl(
          `${SB}/storage/v1/object/public/listing-images/x.png`,
          undefined,
        ),
      ).toBe(false);
    });

    it("rejects when supabaseUrl is malformed", () => {
      expect(
        isAllowedSupabaseImageUrl(
          `${SB}/storage/v1/object/public/listing-images/x.png`,
          "not-a-url",
        ),
      ).toBe(false);
    });
  });
});
