import { test, expect } from "../fixtures";

async function unlockAndNavigate(
  mockPage: (path: string) => Promise<void>,
  page: import("@playwright/test").Page,
  navTestId: string,
) {
  await mockPage("/unlock");
  await page.getByTestId("unlock-password").fill("test-password");
  await page.getByTestId("unlock-submit").click();
  await expect(page).toHaveURL(/\/transactions/);
  await page.getByTestId(navTestId).click();
}

test.describe("Categorize Page", () => {
  test("displays uncategorized groups", async ({ mockPage, page }) => {
    await unlockAndNavigate(mockPage, page, "nav-categorize");
    await expect(page).toHaveURL(/\/categorize/);

    await expect(page.getByTestId("group-row-unknown-merchant-42")).toBeVisible();
    await expect(page.getByTestId("group-row-coffee-shop")).toBeVisible();
    await expect(page.getByTestId("group-row-gas-station")).toBeVisible();
  });

  test("shows group details", async ({ mockPage, page }) => {
    await unlockAndNavigate(mockPage, page, "nav-categorize");

    const row = page.getByTestId("group-row-unknown-merchant-42");
    await expect(row).toContainText("unknown merchant 42");
    await expect(row).toContainText("3");
    await expect(row).toContainText("UNKNOWN MERCHANT 42");
  });

  test("filters by account", async ({ mockPage, page }) => {
    await unlockAndNavigate(mockPage, page, "nav-categorize");

    const filter = page.getByTestId("categorize-account-filter");
    await expect(filter).toBeVisible();
    await expect(filter).toContainText("All Accounts");
    await expect(filter).toContainText("TD Chequing");
    await expect(filter).toContainText("TD Visa");

    await filter.selectOption({ label: "TD Visa" });
    // After selecting, the handler re-fires; groups still render from mock
    await expect(page.getByTestId("group-row-unknown-merchant-42")).toBeVisible();
  });

  test("opens categorize dialog", async ({ mockPage, page }) => {
    await unlockAndNavigate(mockPage, page, "nav-categorize");

    await page.getByTestId("group-categorize-unknown-merchant-42").click();
    await expect(page.getByTestId("group-dialog")).toBeVisible();
    await expect(page.getByTestId("group-dialog")).toContainText("unknown merchant 42");
    await expect(page.getByTestId("group-dialog")).toContainText("3 transactions");
    await expect(page.getByTestId("group-dialog-match-type")).toBeVisible();
    await expect(page.getByTestId("group-dialog-confirm")).toBeVisible();
  });

  test("drill down shows individual transactions", async ({ mockPage, page }) => {
    await unlockAndNavigate(mockPage, page, "nav-categorize");

    await page.getByTestId("group-drilldown-unknown-merchant-42").click();
    await expect(page.getByTestId("drilldown-back")).toBeVisible();
    await expect(page.locator("h2")).toContainText("unknown merchant 42");
    // The mock returns defaultTransactions (4 items) for get_group_transactions
    await expect(page.locator("table tbody tr")).toHaveCount(4);
  });

  test("drill down back button returns to group list", async ({ mockPage, page }) => {
    await unlockAndNavigate(mockPage, page, "nav-categorize");

    await page.getByTestId("group-drilldown-coffee-shop").click();
    await expect(page.getByTestId("drilldown-back")).toBeVisible();

    await page.getByTestId("drilldown-back").click();
    await expect(page.getByTestId("group-row-coffee-shop")).toBeVisible();
    await expect(page.getByTestId("group-row-unknown-merchant-42")).toBeVisible();
  });

  test("sort groups by count", async ({ mockPage, page }) => {
    await unlockAndNavigate(mockPage, page, "nav-categorize");

    // Default sort is count desc: coffee-shop(7), unknown-merchant-42(3), gas-station(2)
    const rows = page.locator("table tbody tr");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("coffee shop");
    await expect(rows.nth(1)).toContainText("unknown merchant 42");
    await expect(rows.nth(2)).toContainText("gas station");

    // Click count header to toggle to asc
    await page.getByTestId("group-sort-count").click();
    await expect(rows.nth(0)).toContainText("gas station");
    await expect(rows.nth(2)).toContainText("coffee shop");
  });

  test("categorize badge shows count in nav", async ({ mockPage, page }) => {
    await unlockAndNavigate(mockPage, page, "nav-categorize");

    // count_uncategorized_groups returns 3 (length of uncategorized groups list)
    const badge = page.getByTestId("nav-categorize-badge");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText("3");
  });
});
