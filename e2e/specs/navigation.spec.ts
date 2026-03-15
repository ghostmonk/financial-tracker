import { test, expect } from "../fixtures";

test.describe("Navigation", () => {
  test("redirects to /unlock when database is locked", async ({
    mockPage,
    page,
  }) => {
    // Navigate directly to /transactions without unlocking first
    await mockPage("/transactions");

    // Layout checks isUnlocked and redirects to /unlock
    await expect(page).toHaveURL(/\/unlock/);
  });

  test("all nav links navigate correctly", async ({ mockPage, page }) => {
    // Unlock first
    await mockPage("/unlock");
    await page.getByTestId("unlock-password").fill("test-password");
    await page.getByTestId("unlock-submit").click();
    await expect(page).toHaveURL(/\/transactions/);

    const navTargets = [
      { testId: "nav-dashboard", url: /\/dashboard/ },
      { testId: "nav-transactions", url: /\/transactions/ },
      { testId: "nav-categorize", url: /\/categorize/ },
      { testId: "nav-import", url: /\/import/ },
      { testId: "nav-accounts", url: /\/accounts/ },
      { testId: "nav-categories", url: /\/categories/ },
      { testId: "nav-rules", url: /\/rules/ },
      { testId: "nav-tax", url: /\/tax/ },
    ];

    for (const { testId, url } of navTargets) {
      await page.getByTestId(testId).click();
      await expect(page).toHaveURL(url);
    }
  });

  test("sidebar is visible on all pages", async ({ mockPage, page }) => {
    // Unlock first
    await mockPage("/unlock");
    await page.getByTestId("unlock-password").fill("test-password");
    await page.getByTestId("unlock-submit").click();
    await expect(page).toHaveURL(/\/transactions/);

    const sidebar = page.getByTestId("sidebar");

    const pages = [
      "nav-dashboard",
      "nav-transactions",
      "nav-categorize",
      "nav-import",
      "nav-accounts",
      "nav-categories",
      "nav-rules",
      "nav-tax",
    ];

    for (const navId of pages) {
      await page.getByTestId(navId).click();
      await expect(sidebar).toBeVisible();
    }
  });
});
