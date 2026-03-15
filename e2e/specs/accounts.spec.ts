import { test, expect } from "../fixtures";

test.describe("Accounts Page", () => {
  test.beforeEach(async ({ mockPage, page }) => {
    await mockPage("/unlock");
    await page.getByTestId("unlock-password").fill("test-password");
    await page.getByTestId("unlock-submit").click();
    await expect(page).toHaveURL(/\/transactions/);

    await page.getByTestId("nav-accounts").click();
    await expect(page).toHaveURL(/\/accounts/);
  });

  test("displays account list with both accounts visible", async ({
    page,
  }) => {
    await expect(
      page.getByTestId("account-row-acc-checking-001"),
    ).toBeVisible();
    await expect(page.getByTestId("account-row-acc-cc-001")).toBeVisible();
  });

  test("shows account details in table", async ({ page }) => {
    const checkingRow = page.getByTestId("account-row-acc-checking-001");
    await expect(checkingRow).toContainText("TD Chequing");
    await expect(checkingRow).toContainText("TD Bank");

    const ccRow = page.getByTestId("account-row-acc-cc-001");
    await expect(ccRow).toContainText("TD Visa");
    await expect(ccRow).toContainText("TD Bank");
  });

  test("opens add account form", async ({ page }) => {
    await page.getByTestId("accounts-add-btn").click();

    const modal = page.getByTestId("modal");
    await expect(modal).toBeVisible();
    await expect(modal.locator("h2")).toHaveText("Add Account");
    await expect(page.getByTestId("account-form-name")).toBeVisible();
    await expect(page.getByTestId("account-form-institution")).toBeVisible();
    await expect(page.getByTestId("account-form-type")).toBeVisible();
    await expect(page.getByTestId("account-form-currency")).toBeVisible();
  });

  test("creates a new account", async ({ page }) => {
    await page.getByTestId("accounts-add-btn").click();

    await page.getByTestId("account-form-name").fill("New Savings");
    await page.getByTestId("account-form-institution").fill("RBC");
    await page.getByTestId("account-form-type").selectOption("savings");
    await page.getByTestId("account-form-currency").selectOption("USD");
    await page.getByTestId("account-form-submit").click();

    await expect(page.getByTestId("modal")).not.toBeVisible();
  });

  test("opens edit form with existing data", async ({ page }) => {
    await page.getByTestId("account-edit-acc-checking-001").click();

    const modal = page.getByTestId("modal");
    await expect(modal).toBeVisible();
    await expect(modal.locator("h2")).toHaveText("Edit Account");
    await expect(page.getByTestId("account-form-name")).toHaveValue(
      "TD Chequing",
    );
    await expect(page.getByTestId("account-form-institution")).toHaveValue(
      "TD Bank",
    );
    await expect(page.getByTestId("account-form-type")).toHaveValue("checking");
    await expect(page.getByTestId("account-form-currency")).toHaveValue("CAD");
  });

  test("shows delete confirmation and deletes", async ({ page }) => {
    await page.getByTestId("account-delete-acc-checking-001").click();

    const modal = page.getByTestId("modal");
    await expect(modal).toBeVisible();
    await expect(modal).toContainText("TD Chequing");
    await expect(modal).toContainText(
      "All transactions associated with this account will also be deleted",
    );

    await modal.getByRole("button", { name: "Delete" }).click();

    await expect(page.getByTestId("modal")).not.toBeVisible();
  });
});
