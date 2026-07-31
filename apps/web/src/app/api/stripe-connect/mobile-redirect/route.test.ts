import { describe, it, expect } from "vitest";

import { GET } from "./route";

function makeReq(target: string | null) {
  const url = new URL(
    "https://pokemarket.test/api/stripe-connect/mobile-redirect",
  );
  if (target !== null) url.searchParams.set("target", target);
  return new Request(url.toString());
}

describe("GET /api/stripe-connect/mobile-redirect", () => {
  it("redirects to pokemarket://wallet/return for target=return", async () => {
    const res = GET(makeReq("return"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("pokemarket://wallet/return");
  });

  it("redirects to pokemarket://wallet/refresh for target=refresh", async () => {
    const res = GET(makeReq("refresh"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("pokemarket://wallet/refresh");
  });

  it("returns 400 for an unrecognised target value", async () => {
    const res = GET(makeReq("login"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeTruthy();
  });

  it("returns 400 when the target parameter is absent", async () => {
    const res = GET(makeReq(null));
    expect(res.status).toBe(400);
  });
});
