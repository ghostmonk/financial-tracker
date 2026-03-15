import { test, expect } from "../fixtures";

async function unlockAndGoTo(
  mockPage: (path: string) => Promise<void>,
  page: import("@playwright/test").Page,
  target: string,
) {
  await mockPage("/unlock");
  await page.getByTestId("unlock-password").fill("test-password");
  await page.getByTestId("unlock-submit").click();
  await expect(page).toHaveURL(/\/transactions/);
  if (target !== "/transactions") {
    await page.getByTestId(`nav-${target.replace("/", "")}`).click();
    await expect(page).toHaveURL(new RegExp(target));
  }
}

test.describe("Transactions Page", () => {
  test("displays transaction rows", async ({ mockPage, page }) => {
    await unlockAndGoTo(mockPage, page, "/transactions");

    await expect(page.getByTestId("txn-row-txn-001")).toBeVisible();
    await expect(page.getByTestId("txn-row-txn-002")).toBeVisible();
    await expect(page.getByTestId("txn-row-txn-003")).toBeVisible();
    await expect(page.getByTestId("txn-row-txn-004")).toBeVisible();
  });

  test("shows transaction description and amount", async ({
    mockPage,
    page,
  }) => {
    await unlockAndGoTo(mockPage, page, "/transactions");

    const row = page.getByTestId("txn-row-txn-001");
    await expect(row).toContainText("LOBLAWS #1234");
    await expect(row).toContainText("$85.42");
  });

  test("shows transaction count", async ({ mockPage, page }) => {
    await unlockAndGoTo(mockPage, page, "/transactions");

    const count = page.getByTestId("transactions-count");
    await expect(count).toHaveText("4 transactions loaded");
  });

  test("search filter accepts input", async ({ mockPage, page }) => {
    await unlockAndGoTo(mockPage, page, "/transactions");

    const search = page.getByTestId("filter-search");
    await search.fill("LOBLAWS");
    await expect(search).toHaveValue("LOBLAWS");
  });

  test("account filter shows accounts", async ({ mockPage, page }) => {
    await unlockAndGoTo(mockPage, page, "/transactions");

    const accountFilter = page.getByTestId("filter-account");
    await expect(accountFilter).toBeVisible();

    const options = accountFilter.locator("option");
    await expect(options).toHaveCount(3); // "All accounts" + 2 accounts
    await expect(options.nth(1)).toHaveText("TD Chequing");
    await expect(options.nth(2)).toHaveText("TD Visa");
  });

  test("clear filters resets search", async ({ mockPage, page }) => {
    await unlockAndGoTo(mockPage, page, "/transactions");

    const search = page.getByTestId("filter-search");
    await search.fill("something");
    await expect(search).toHaveValue("something");

    // Wait for debounce to fire so "Clear filters" button appears
    await page.waitForTimeout(400);
    const clearBtn = page.getByTestId("filter-clear");
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();

    await expect(search).toHaveValue("");
  });

  test("select all checkbox enables bulk bar", async ({
    mockPage,
    page,
  }) => {
    await unlockAndGoTo(mockPage, page, "/transactions");

    await expect(page.getByTestId("txn-bulk-bar")).not.toBeVisible();

    await page.getByTestId("txn-select-all").check();

    const bulkBar = page.getByTestId("txn-bulk-bar");
    await expect(bulkBar).toBeVisible();
    await expect(bulkBar).toContainText("4 selected");
  });

  test("individual checkbox selection shows bulk bar", async ({
    mockPage,
    page,
  }) => {
    await unlockAndGoTo(mockPage, page, "/transactions");

    await page.getByTestId("txn-select-txn-002").check();

    const bulkBar = page.getByTestId("txn-bulk-bar");
    await expect(bulkBar).toBeVisible();
    await expect(bulkBar).toContainText("1 selected");
  });

  test("sort by date column", async ({ mockPage, page }) => {
    await unlockAndGoTo(mockPage, page, "/transactions");

    const dateHeader = page.getByTestId("txn-sort-date");
    await expect(dateHeader).toBeVisible();

    // Default sort is date desc, clicking toggles to asc
    await dateHeader.click();
    await expect(dateHeader).toContainText("Date");
  });

  test("sort by amount column", async ({ mockPage, page }) => {
    await unlockAndGoTo(mockPage, page, "/transactions");

    const amountHeader = page.getByTestId("txn-sort-amount");
    await expect(amountHeader).toBeVisible();

    await amountHeader.click();
    // After click, sort indicator should appear
    await expect(amountHeader).toContainText("Amount");
  });
});
