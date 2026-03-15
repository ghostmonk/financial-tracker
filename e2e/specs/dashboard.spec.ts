import { test, expect } from "../fixtures";

test.describe("Dashboard Page", () => {
  test.beforeEach(async ({ mockPage, page }) => {
    // Start at unlock, authenticate, then navigate to dashboard
    await mockPage("/unlock");
    await page.getByTestId("unlock-password").fill("test-password");
    await page.getByTestId("unlock-submit").click();
    await expect(page).toHaveURL(/\/transactions/);

    await page.getByTestId("nav-dashboard").click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("displays current month label", async ({ page }) => {
    const label = page.getByTestId("dashboard-month-label");
    const now = new Date();
    const expected = now.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
    });
    await expect(label).toHaveText(expected);
  });

  test("shows monthly summary cards", async ({ page }) => {
    const income = page.getByTestId("summary-income");
    const expenses = page.getByTestId("summary-expenses");
    const net = page.getByTestId("summary-net");

    await expect(income).toBeVisible();
    await expect(expenses).toBeVisible();
    await expect(net).toBeVisible();
  });

  test("navigates to previous month", async ({ page }) => {
    const label = page.getByTestId("dashboard-month-label");
    const prevButton = page.getByTestId("dashboard-prev-month");

    const now = new Date();
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1);
    const expectedPrev = prevDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
    });

    await prevButton.click();
    await expect(label).toHaveText(expectedPrev);
  });

  test("next month button disabled at current month", async ({ page }) => {
    const nextButton = page.getByTestId("dashboard-next-month");
    await expect(nextButton).toBeDisabled();
  });

  test("shows category breakdown tabs", async ({ page }) => {
    // Default mock data has expense and income transactions, so those tabs render
    const expenseTab = page.getByTestId("breakdown-tab-expense");
    const incomeTab = page.getByTestId("breakdown-tab-income");

    await expect(expenseTab).toBeVisible();
    await expect(incomeTab).toBeVisible();
  });
});
