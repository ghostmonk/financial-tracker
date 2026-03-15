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

test.describe("Rules Page", () => {
  test("displays rules list", async ({ mockPage, page }) => {
    await unlockAndNavigate(mockPage, page, "nav-rules");
    await expect(page).toHaveURL(/\/rules/);

    await expect(page.getByTestId("rule-row-rule-001")).toBeVisible();
    await expect(page.getByTestId("rule-row-rule-002")).toBeVisible();
  });

  test("shows rule details", async ({ mockPage, page }) => {
    await unlockAndNavigate(mockPage, page, "nav-rules");

    const row1 = page.getByTestId("rule-row-rule-001");
    await expect(row1).toContainText("LOBLAWS");
    await expect(row1).toContainText("contains");
    await expect(row1).toContainText("description");

    const row2 = page.getByTestId("rule-row-rule-002");
    await expect(row2).toContainText("RENT PAYMENT");
    await expect(row2).toContainText("exact");
  });

  test("opens add rule form", async ({ mockPage, page }) => {
    await unlockAndNavigate(mockPage, page, "nav-rules");

    await page.getByTestId("rules-add-btn").click();
    await expect(page.getByTestId("modal")).toBeVisible();
    await expect(page.getByTestId("modal")).toContainText("Add Rule");
  });

  test("creates a new rule", async ({ mockPage, page }) => {
    await unlockAndNavigate(mockPage, page, "nav-rules");

    await page.getByTestId("rules-add-btn").click();
    const modal = page.getByTestId("modal");

    // Fill pattern
    await modal.locator("input[type='text']").fill("STARBUCKS");
    // Select category — click the CategorySelect button to open dropdown, then pick one
    await modal.locator("button", { hasText: "Select category" }).click();
    await modal.locator("button", { hasText: "Groceries" }).click();
    // Submit
    await modal.locator("button[type='submit']", { hasText: "Create" }).click();

    // Modal closes after successful creation
    await expect(page.getByTestId("modal")).not.toBeVisible();
  });

  test("edits existing rule with pre-populated form", async ({ mockPage, page }) => {
    await unlockAndNavigate(mockPage, page, "nav-rules");

    await page.getByTestId("rule-edit-rule-001").click();
    const modal = page.getByTestId("modal");
    await expect(modal).toBeVisible();
    await expect(modal).toContainText("Edit Rule");

    // Pattern field should be pre-populated
    const patternInput = modal.locator("input[type='text']").first();
    await expect(patternInput).toHaveValue("LOBLAWS");

    // Submit button should say "Update"
    await expect(modal.locator("button[type='submit']")).toContainText("Update");
  });

  test("deletes a rule with confirmation", async ({ mockPage, page }) => {
    await unlockAndNavigate(mockPage, page, "nav-rules");

    await page.getByTestId("rule-delete-rule-001").click();

    // Confirmation modal appears
    const modal = page.getByTestId("modal");
    await expect(modal).toBeVisible();
    await expect(modal).toContainText("Delete Rule");
    await expect(modal).toContainText("LOBLAWS");

    // Confirm deletion
    await modal.locator("button", { hasText: "Delete" }).click();
    await expect(page.getByTestId("modal")).not.toBeVisible();
  });

  test("reapply all rules shows success", async ({ mockPage, page }) => {
    await unlockAndNavigate(mockPage, page, "nav-rules");

    await page.getByTestId("rules-reapply-btn").click();
    const banner = page.getByTestId("rules-reapply-success");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Re-applied rules");
    await expect(banner).toContainText("categorized");
  });

  test("sort by priority", async ({ mockPage, page }) => {
    await unlockAndNavigate(mockPage, page, "nav-rules");

    // Default sort is priority desc: rule-002 (priority 20) first, rule-001 (priority 10) second
    const rows = page.locator("table tbody tr");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("RENT PAYMENT");
    await expect(rows.nth(1)).toContainText("LOBLAWS");

    // Click priority header to toggle to asc
    await page.getByTestId("rule-sort-priority").click();
    await expect(rows.nth(0)).toContainText("LOBLAWS");
    await expect(rows.nth(1)).toContainText("RENT PAYMENT");
  });

  test("shows empty state when no rules", async ({ mockPage, page }) => {
    await mockPage("/unlock", {
      list_categorization_rules: { data: [] },
    });
    await page.getByTestId("unlock-password").fill("test-password");
    await page.getByTestId("unlock-submit").click();
    await expect(page).toHaveURL(/\/transactions/);
    await page.getByTestId("nav-rules").click();

    await expect(page.getByTestId("rules-empty")).toBeVisible();
    await expect(page.getByTestId("rules-empty")).toContainText("No rules yet");
  });
});
