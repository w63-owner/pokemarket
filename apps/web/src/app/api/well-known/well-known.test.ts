import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Both AASA and assetlinks routes read env at module scope. We reset module
// caches between cases so each test sees the env it sets.

describe("/.well-known/apple-app-site-association", () => {
  const ORIGINAL = { ...process.env };
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL };
  });
  afterEach(() => {
    process.env = ORIGINAL;
  });

  it("returns JSON with the configured AppID", async () => {
    process.env.IOS_APP_TEAM_ID = "ABCDE12345";
    process.env.IOS_APP_BUNDLE_ID = "app.pokemarket.mobile";
    const mod = await import("./apple-app-site-association/route");
    const res = await mod.GET();
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body.applinks.details[0].appIDs).toEqual([
      "ABCDE12345.app.pokemarket.mobile",
    ]);
    expect(body.applinks.details[0].components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ "/": "/listing/*" }),
        expect.objectContaining({ "/": "/auth/*", exclude: true }),
      ]),
    );
  });

  it("falls back to placeholder Team ID when env missing", async () => {
    delete process.env.IOS_APP_TEAM_ID;
    delete process.env.IOS_APP_BUNDLE_ID;
    const mod = await import("./apple-app-site-association/route");
    const res = await mod.GET();
    const body = await res.json();
    expect(body.applinks.details[0].appIDs[0]).toMatch(
      /\.app\.pokemarket\.mobile$/,
    );
  });
});

describe("/.well-known/assetlinks.json", () => {
  const ORIGINAL = { ...process.env };
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL };
  });
  afterEach(() => {
    process.env = ORIGINAL;
  });

  it("returns JSON with parsed SHA-256 fingerprints", async () => {
    process.env.ANDROID_APP_PACKAGE_NAME = "app.pokemarket.mobile";
    process.env.ANDROID_APP_SHA256_FINGERPRINTS =
      "AA:BB:CC, DD:EE:FF , 11:22:33";
    const mod = await import("./assetlinks/route");
    const res = await mod.GET();
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body[0].target.package_name).toBe("app.pokemarket.mobile");
    expect(body[0].target.sha256_cert_fingerprints).toEqual([
      "AA:BB:CC",
      "DD:EE:FF",
      "11:22:33",
    ]);
  });

  it("returns an empty fingerprints array when env not set", async () => {
    delete process.env.ANDROID_APP_SHA256_FINGERPRINTS;
    const mod = await import("./assetlinks/route");
    const res = await mod.GET();
    const body = await res.json();
    expect(body[0].target.sha256_cert_fingerprints).toEqual([]);
  });
});
