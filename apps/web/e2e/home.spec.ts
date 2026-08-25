import { test, expect } from "@playwright/test";

test.describe("Home page", () => {
  test("loads and displays the marketplace navigation", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("link", { name: "TheDeckDealr" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Marketplace" })).toBeVisible();
  });

  test("shows search, compact filters and sorting", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("search")).toBeVisible();
    await expect(page.getByLabel("Filtrer par bloc")).toBeVisible();
    await expect(page.getByLabel("Trier les annonces")).toBeVisible();
  });

  test("renders the feed grid or skeleton loaders", async ({ page }) => {
    await page.goto("/");

    const grid = page.locator('[class*="grid"][class*="grid-cols"]');
    await expect(grid.first()).toBeVisible();
  });
});
