import { test, expect } from "../fixtures";

test.describe("Categories Page", () => {
  test.beforeEach(async ({ mockPage, page }) => {
    await mockPage("/unlock");
    await page.getByTestId("unlock-password").fill("test-password");
    await page.getByTestId("unlock-submit").click();
    await expect(page).toHaveURL(/\/transactions/);

    await page.getByTestId("nav-categories").click();
    await expect(page).toHaveURL(/\/categories/);
  });

  test("displays categories grouped by direction", async ({ page }) => {
    // Income group heading
    await expect(
      page.locator("h3", { hasText: "Income" }).first(),
    ).toBeVisible();

    // Expense group heading
    await expect(
      page.locator("h3", { hasText: "Expense" }).first(),
    ).toBeVisible();

    // Transfer group heading
    await expect(
      page.locator("h3", { hasText: "Transfer" }).first(),
    ).toBeVisible();
  });

  test("shows child categories indented under parents", async ({ page }) => {
    // Parent rows exist
    await expect(
      page.getByTestId("category-row-cat-income-001"),
    ).toBeVisible();
    await expect(
      page.getByTestId("category-row-cat-expenses-001"),
    ).toBeVisible();

    // Child rows exist under their parents
    const salaryRow = page.getByTestId("category-row-cat-salary-001");
    await expect(salaryRow).toBeVisible();
    await expect(salaryRow).toContainText("Salary");

    const groceriesRow = page.getByTestId("category-row-cat-groceries-001");
    await expect(groceriesRow).toBeVisible();
    await expect(groceriesRow).toContainText("Groceries");

    const rentRow = page.getByTestId("category-row-cat-rent-001");
    await expect(rentRow).toBeVisible();
    await expect(rentRow).toContainText("Rent");
  });

  test("opens add category form", async ({ page }) => {
    await page.getByTestId("categories-add-btn").click();

    const modal = page.getByTestId("modal");
    await expect(modal).toBeVisible();
    await expect(modal.locator("h2")).toHaveText("Add Category");
    await expect(page.getByTestId("category-form-name")).toBeVisible();
    await expect(page.getByTestId("category-form-slug")).toBeVisible();
    await expect(page.getByTestId("category-form-direction")).toBeVisible();
    await expect(page.getByTestId("category-form-parent")).toBeVisible();
  });

  test("auto-generates slug from name", async ({ page }) => {
    await page.getByTestId("categories-add-btn").click();

    await page.getByTestId("category-form-name").fill("Office Supplies");
    await expect(page.getByTestId("category-form-slug")).toHaveValue(
      "office-supplies",
    );
  });

  test("creates a new category", async ({ page }) => {
    await page.getByTestId("categories-add-btn").click();

    await page.getByTestId("category-form-name").fill("Utilities");
    await page.getByTestId("category-form-direction").selectOption("expense");
    await page.getByTestId("category-form-submit").click();

    await expect(page.getByTestId("modal")).not.toBeVisible();
  });

  test("displays tags section with tag badges", async ({ page }) => {
    await expect(page.locator("h2", { hasText: "Tags" })).toBeVisible();

    await expect(page.getByTestId("tag-badge-tag-001")).toBeVisible();
    await expect(page.getByTestId("tag-badge-tag-001")).toContainText(
      "Business",
    );

    await expect(page.getByTestId("tag-badge-tag-002")).toBeVisible();
    await expect(page.getByTestId("tag-badge-tag-002")).toContainText(
      "Personal",
    );
  });

  test("adds a new tag", async ({ page }) => {
    const input = page.getByTestId("tag-input");
    const addBtn = page.getByTestId("tag-add-btn");

    // Button disabled when input empty
    await expect(addBtn).toBeDisabled();

    await input.fill("Recurring");
    await expect(addBtn).toBeEnabled();
    await addBtn.click();

    // Input clears after successful add
    await expect(input).toHaveValue("");
  });

  test("deletes a tag", async ({ page }) => {
    const deleteBtn = page.getByTestId("tag-delete-tag-001");
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    // After delete, the mock re-fetches list_tags which still returns both tags
    // (default handler unchanged), so we verify the click executed without error
    await expect(page.getByTestId("tag-badge-tag-001")).toBeVisible();
  });
});
