import { afterEach, describe, expect, it } from "vitest";

import { isCronAuthorized } from "./auth";

describe("isCronAuthorized", () => {
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("fails closed when CRON_SECRET is missing", () => {
    delete process.env.CRON_SECRET;
    const request = new Request("http://localhost/api/cron/x", {
      headers: { authorization: "Bearer undefined" },
    });
    expect(isCronAuthorized(request)).toBe(false);
  });

  it("fails closed when CRON_SECRET is empty", () => {
    process.env.CRON_SECRET = "";
    const request = new Request("http://localhost/api/cron/x", {
      headers: { authorization: "Bearer " },
    });
    expect(isCronAuthorized(request)).toBe(false);
  });

  it("accepts the matching bearer secret", () => {
    process.env.CRON_SECRET = "test-secret";
    const request = new Request("http://localhost/api/cron/x", {
      headers: { authorization: "Bearer test-secret" },
    });
    expect(isCronAuthorized(request)).toBe(true);
  });
});
