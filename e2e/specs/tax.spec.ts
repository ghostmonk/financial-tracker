import { test, expect } from "../fixtures";

test.describe("Tax Page", () => {
  test.beforeEach(async ({ mockPage, page }) => {
    await mockPage("/unlock");
    await page.getByTestId("unlock-password").fill("test-password");
    await page.getByTestId("unlock-submit").click();
    await expect(page).toHaveURL(/\/transactions/);

    await page.getByTestId("nav-tax").click();
    await expect(page).toHaveURL(/\/tax/);
  });

  test("displays fiscal year selector", async ({ page }) => {
    const select = page.getByTestId("tax-year-select");
    await expect(select).toBeVisible();
    // Current year should be selected by default
    const currentYear = new Date().getFullYear().toString();
    await expect(select).toHaveValue(currentYear);
  });

  test("shows expense and income tabs", async ({ page }) => {
    const expenseTab = page.getByTestId("tax-tab-expense");
    const incomeTab = page.getByTestId("tax-tab-income");
    await expect(expenseTab).toBeVisible();
    await expect(incomeTab).toBeVisible();
  });

  test("displays workspace items with item count", async ({ page }) => {
    const itemCount = page.getByTestId("tax-item-count");
    await expect(itemCount).toBeVisible();
    // Default mock data has 2 workspace items, but only those matching
    // the active tab (expense) with valid category+mapping are shown.
    // The count text contains "item" or "items".
    await expect(itemCount).toContainText("item");
  });

  test("switches between expense and income tabs", async ({ page }) => {
    const expenseTab = page.getByTestId("tax-tab-expense");
    const incomeTab = page.getByTestId("tax-tab-income");

    // Expense tab should be active by default (has blue border)
    await expect(expenseTab).toHaveClass(/border-blue-500/);
    await expect(incomeTab).not.toHaveClass(/border-blue-500/);

    // Click income tab
    await incomeTab.click();
    await expect(incomeTab).toHaveClass(/border-blue-500/);
    await expect(expenseTab).not.toHaveClass(/border-blue-500/);

    // Click expense tab again
    await expenseTab.click();
    await expect(expenseTab).toHaveClass(/border-blue-500/);
  });

  test("opens add item form", async ({ page }) => {
    await page.getByTestId("tax-add-item-btn").click();
    const modal = page.getByTestId("modal");
    await expect(modal).toBeVisible();
    // Modal title should say "Add Line Item"
    await expect(modal).toContainText("Add Line Item");
  });

  test("creates a new tax line item", async ({ page }) => {
    await page.getByTestId("tax-add-item-btn").click();
    const modal = page.getByTestId("modal");
    await expect(modal).toBeVisible();

    // Fill out the form
    await page.getByTestId("tax-form-date").fill("2026-03-15");
    await page.getByTestId("tax-form-description").fill("New office chair");
    await page.getByTestId("tax-form-amount").fill("299.99");

    // Select category — only categories with tax line mappings appear
    const categorySelect = modal.locator("select").nth(0);
    await categorySelect.selectOption("cat-office-supplies-001");

    await page.getByTestId("tax-form-notes").fill("Ergonomic desk chair");

    // Submit the form
    await page.getByTestId("tax-form-submit").click();

    // Modal should close after save
    await expect(modal).not.toBeVisible();
  });

  test("opens proration settings", async ({ page }) => {
    await page.getByTestId("tax-proration-btn").click();
    const modal = page.getByTestId("modal");
    await expect(modal).toBeVisible();
    await expect(modal).toContainText("Proration Settings");
  });

  test("proration settings show existing values", async ({ page }) => {
    await page.getByTestId("tax-proration-btn").click();
    const modal = page.getByTestId("modal");
    await expect(modal).toBeVisible();

    // Verify the values from test data:
    // vehicle_total_km=20000, vehicle_business_km=8000
    // home_total_sqft=1200, home_office_sqft=150
    await expect(page.getByTestId("proration-vehicle-total")).toHaveValue("20000");
    await expect(page.getByTestId("proration-vehicle-business")).toHaveValue("8000");
    await expect(page.getByTestId("proration-home-total")).toHaveValue("1200");
    await expect(page.getByTestId("proration-home-office")).toHaveValue("150");

    // Computed percentages should be visible
    // Vehicle: 8000/20000 = 40.0%
    await expect(modal).toContainText("40.0%");
    // Home: 150/1200 = 12.5%
    await expect(modal).toContainText("12.5%");
  });

  test("saves proration settings", async ({ page }) => {
    await page.getByTestId("tax-proration-btn").click();
    const modal = page.getByTestId("modal");
    await expect(modal).toBeVisible();

    // Update a value
    await page.getByTestId("proration-vehicle-business").fill("10000");

    // Save
    await page.getByTestId("proration-save").click();

    // Modal should close
    await expect(modal).not.toBeVisible();
  });

  test("opens tax info panel", async ({ page }) => {
    await page.getByTestId("tax-info-btn").click();
    const panel = page.getByTestId("tax-info-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Tax Reference");

    // Should show the info section from test data
    await expect(panel).toContainText("Home Office Deduction");
    await expect(panel).toContainText("Calculate based on square footage used exclusively for business.");

    // Should show reminders
    await expect(panel).toContainText("Reminders");
    await expect(panel).toContainText("File GST/QST return by month-end");
  });

  test("shows empty state when no items", async ({ mockPage, page }) => {
    // Override get_tax_workspace_items to return empty array
    await mockPage("/unlock", {
      get_tax_workspace_items: { data: [] },
    });
    await page.getByTestId("unlock-password").fill("test-password");
    await page.getByTestId("unlock-submit").click();
    await expect(page).toHaveURL(/\/transactions/);

    await page.getByTestId("nav-tax").click();
    await expect(page).toHaveURL(/\/tax/);

    const emptyState = page.getByTestId("tax-empty");
    await expect(emptyState).toBeVisible();
    const currentYear = new Date().getFullYear().toString();
    await expect(emptyState).toContainText(`No expenses items for ${currentYear}`);
  });
});
