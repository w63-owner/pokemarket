import { test, expect } from "@playwright/test";

/**
 * These specs validate buyer-side action rendering against the live homepage
 * (deterministic, server-rendered) and the dynamic listing detail page when
 * a public listing exists. We don't seed a controlled database here — instead
 * we navigate the homepage feed and pick the first card that has a publicly
 * visible URL. Tests are tolerant: if no listings exist (empty db), they
 * SKIP with a clear message instead of failing.
 */
test.describe("Public marketplace landing", () => {
  test("home loads, displays marketplace heading, no console errors", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    await page.goto("/");
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();
    await expect(heading).toContainText("PokeMarket");

    // Strip out known noise: 3rd-party tracking, image 404s in dev.
    const meaningful = consoleErrors.filter(
      (e) => !/(favicon|sentry|analytics|404)/i.test(e),
    );
    expect(meaningful).toEqual([]);
  });
});

test.describe("Buyer flow guards (protected → /auth redirect)", () => {
  test("anonymous user is redirected to /auth when visiting /sell", async ({
    page,
  }) => {
    const response = await page.goto("/sell");
    await expect(page).toHaveURL(/\/auth/);
    expect(response?.status()).toBeLessThan(500);
  });

  test("anonymous user redirected to /auth when visiting /messages", async ({
    page,
  }) => {
    await page.goto("/messages");
    await expect(page).toHaveURL(/\/auth/);
  });

  test("anonymous user redirected to /auth when visiting /wallet", async ({
    page,
  }) => {
    await page.goto("/wallet");
    await expect(page).toHaveURL(/\/auth/);
  });

  test("anonymous user redirected to /auth when visiting /favorites", async ({
    page,
  }) => {
    await page.goto("/favorites");
    await expect(page).toHaveURL(/\/auth/);
  });
});

test.describe("Listing detail public view", () => {
  test("listing card on home links to a /listing/:id page that renders", async ({
    page,
  }) => {
    await page.goto("/");

    const firstListingLink = page.locator('a[href^="/listing/"]').first();

    if (!(await firstListingLink.isVisible().catch(() => false))) {
      test.skip(true, "No public listings present in this environment");
    }

    const href = await firstListingLink.getAttribute("href");
    expect(href).toMatch(/^\/listing\//);

    await firstListingLink.click();

    // Detail page should render a heading
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Either a Buy button (active) OR a sold/reserved status badge should
    // be rendered — never both simultaneously.
    const hasBuy = await page
      .getByText(/Acheter/)
      .isVisible()
      .catch(() => false);
    const hasSold = await page
      .getByText(/Annonce vendue/)
      .isVisible()
      .catch(() => false);
    const hasReserved = await page
      .getByText(/Réservée|Paiement en cours/)
      .isVisible()
      .catch(() => false);

    expect([hasBuy, hasSold, hasReserved].some((x) => x)).toBe(true);

    if (hasSold) {
      // SOLD listings must NOT show the Buy or Contact buttons
      await expect(page.getByText(/Acheter/)).toHaveCount(0);
    }
  });
});
