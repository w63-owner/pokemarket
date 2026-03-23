import { test, expect } from "@playwright/test";

test.describe("Home page", () => {
  test("loads and displays the main heading", async ({ page }) => {
    await page.goto("/");

    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();
    await expect(heading).toContainText("PokeMarket");
  });

  test("shows the subtitle", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByText("Les dernières cartes Pokémon en vente"),
    ).toBeVisible();
  });

  test("renders the feed grid or skeleton loaders", async ({ page }) => {
    await page.goto("/");

    const grid = page.locator('[class*="grid"][class*="grid-cols"]');
    await expect(grid.first()).toBeVisible();
  });
});
