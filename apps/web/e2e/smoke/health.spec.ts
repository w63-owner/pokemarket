import { test, expect } from "@playwright/test";

/**
 * Post-deploy smoke tests. Run against a deployed environment URL.
 * Triggered by deploy-staging.yml and deploy-production.yml.
 *
 * Keep these FAST and ROBUST: they validate the deployment is alive and
 * the app -> Supabase wiring is correct, nothing more.
 */

test.describe("@smoke /api/health", () => {
  test("returns 200 with status=ok and database check passes", async ({
    request,
  }) => {
    const response = await request.get("/api/health");
    expect(response.status(), `Expected 200, got ${response.status()}`).toBe(
      200,
    );

    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.checks?.database?.ok).toBe(true);
    expect(body.timestamp).toBeTruthy();
  });

  test("database latency is reasonable (< 2000ms)", async ({ request }) => {
    const response = await request.get("/api/health");
    const body = await response.json();
    const latency = body.checks?.database?.latency_ms;
    expect(typeof latency).toBe("number");
    expect(latency).toBeLessThan(2000);
  });
});

test.describe("@smoke Public landing", () => {
  test("home page loads with PokeMarket heading", async ({ page }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBeLessThan(400);

    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();
    await expect(heading).toContainText("PokeMarket");
  });

  test("anonymous user is redirected to /auth on protected routes", async ({
    page,
  }) => {
    await page.goto("/sell");
    await expect(page).toHaveURL(/\/auth/);
  });
});
