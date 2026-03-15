import { test, expect } from "../fixtures";

test.describe("Unlock Page", () => {
  test("shows Create Password heading on first launch", async ({
    mockPage,
    page,
  }) => {
    await mockPage("/unlock", {
      is_database_initialized: { data: false },
    });

    const subtitle = page.locator("p", { hasText: "Create Password" });
    await expect(subtitle).toBeVisible();
  });

  test("shows Enter Password heading when database exists", async ({
    mockPage,
    page,
  }) => {
    await mockPage("/unlock");

    const subtitle = page.locator("p", { hasText: "Enter Password" });
    await expect(subtitle).toBeVisible();
  });

  test("submit button disabled when password empty", async ({
    mockPage,
    page,
  }) => {
    await mockPage("/unlock");

    const submit = page.getByTestId("unlock-submit");
    await expect(submit).toBeDisabled();
  });

  test("unlocks and navigates to /transactions on success", async ({
    mockPage,
    page,
  }) => {
    await mockPage("/unlock");

    await page.getByTestId("unlock-password").fill("test-password");
    await page.getByTestId("unlock-submit").click();

    await expect(page).toHaveURL(/\/transactions/);
  });

  test("shows error on wrong password", async ({ mockPage, page }) => {
    await mockPage("/unlock", {
      unlock_database: { error: "Invalid password" },
    });

    await page.getByTestId("unlock-password").fill("wrong-password");
    await page.getByTestId("unlock-submit").click();

    const error = page.getByTestId("unlock-error");
    await expect(error).toBeVisible();
    await expect(error).toHaveText("Invalid password");
  });
});
