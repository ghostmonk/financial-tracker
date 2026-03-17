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

test.describe("Keyboard Navigation", () => {
  test("categories: arrow key navigation shows focus indicator", async ({
    mockPage,
    page,
  }) => {
    await unlockAndGoTo(mockPage, page, "/categories");

    // Wait for categories to load before pressing arrow keys
    await expect(
      page.getByTestId("category-row-cat-income-001"),
    ).toBeVisible();

    // Click on the page body to ensure no input is focused
    await page.locator("body").click();

    await page.keyboard.press("ArrowDown");

    const row = page.locator("[data-nav-index='0']");
    await expect(row).toBeVisible();
    await expect(row).toHaveClass(/outline/);
  });

  test("categories: hotkey column header visible", async ({
    mockPage,
    page,
  }) => {
    await unlockAndGoTo(mockPage, page, "/categories");

    await expect(
      page.locator("th", { hasText: "Hotkey" }).first(),
    ).toBeVisible();
  });

  test("categories: hotkey badges display", async ({ mockPage, page }) => {
    await unlockAndGoTo(mockPage, page, "/categories");

    // Mock has hotkeys: "e" for expenses, "i" for income
    // Use the specific hotkey badge styling class to avoid matching other text
    const expensesRow = page.getByTestId("category-row-cat-expenses-001");
    await expect(
      expensesRow.locator("span.font-mono", { hasText: /^e$/ }),
    ).toBeVisible();

    const incomeRow = page.getByTestId("category-row-cat-income-001");
    await expect(
      incomeRow.locator("span.font-mono", { hasText: /^i$/ }),
    ).toBeVisible();
  });

  test("categories: collapse with arrow keys hides children", async ({
    mockPage,
    page,
  }) => {
    await unlockAndGoTo(mockPage, page, "/categories");

    // Groceries child row should be visible initially
    await expect(
      page.getByTestId("category-row-cat-groceries-001"),
    ).toBeVisible();

    // Click body to ensure no input is focused
    await page.locator("body").click();

    // Focus the Expenses parent row and collapse with ArrowLeft
    await page.keyboard.press("ArrowDown");

    const expensesRow = page.getByTestId("category-row-cat-expenses-001");
    // Keep pressing ArrowDown until Expenses row gets focus
    for (let i = 0; i < 10; i++) {
      const cls = await expensesRow.getAttribute("class");
      if (cls && cls.includes("outline")) break;
      await page.keyboard.press("ArrowDown");
    }

    await page.keyboard.press("ArrowLeft");

    // Child row should now be hidden
    await expect(
      page.getByTestId("category-row-cat-groceries-001"),
    ).not.toBeVisible();
  });

  test("sidebar: ctrl+h toggles sidebar focus", async ({
    mockPage,
    page,
  }) => {
    await unlockAndGoTo(mockPage, page, "/transactions");

    // Click body to ensure no input is focused
    await page.locator("body").click();

    await page.keyboard.press("Control+h");

    // The first nav link (Dashboard at index 0) should get focus ring styling
    const navLink = page.getByTestId("nav-dashboard");
    await expect(navLink).toHaveClass(/ring-2/);

    await page.keyboard.press("Escape");

    // Focus ring should be removed
    await expect(navLink).not.toHaveClass(/ring-2/);
  });

  test("transactions: summary panel visible", async ({ mockPage, page }) => {
    await unlockAndGoTo(mockPage, page, "/transactions");

    // Summary panel shows transaction count
    await expect(page.locator("text=4 transactions")).toBeVisible();

    // Debit amount displayed
    await expect(
      page.locator(".text-red-600, .dark\\:text-red-400").first(),
    ).toBeVisible();

    // Credit amount displayed
    await expect(
      page.locator(".text-green-600, .dark\\:text-green-400").first(),
    ).toBeVisible();
  });

  test("categorize: arrow key navigation on groups", async ({
    mockPage,
    page,
  }) => {
    await unlockAndGoTo(mockPage, page, "/categorize");

    // Wait for groups to load
    await expect(
      page.getByTestId("group-row-coffee-shop"),
    ).toBeVisible();

    // Click body to ensure no input is focused
    await page.locator("body").click();

    await page.keyboard.press("ArrowDown");

    const row = page.locator("[data-nav-index='0']");
    await expect(row).toBeVisible();
    await expect(row).toHaveClass(/outline/);
  });
});
