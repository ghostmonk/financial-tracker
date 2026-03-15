import { test, expect } from "../fixtures";
import type { MockResponseMap } from "../mocks/tauri-ipc";

async function unlockAndGoToImport(
  mockPage: (
    path: string,
    overrides?: MockResponseMap,
  ) => Promise<void>,
  page: import("@playwright/test").Page,
  overrides?: MockResponseMap,
) {
  await mockPage("/unlock", overrides);
  await page.getByTestId("unlock-password").fill("test-password");
  await page.getByTestId("unlock-submit").click();
  await expect(page).toHaveURL(/\/transactions/);
  await page.getByTestId("nav-import").click();
  await expect(page).toHaveURL(/\/import/);
}

test.describe("Import Page", () => {
  test("shows file selector with account dropdown", async ({
    mockPage,
    page,
  }) => {
    await unlockAndGoToImport(mockPage, page);

    await expect(page.getByTestId("import-file-btn")).toBeVisible();
    await expect(page.getByTestId("import-account-select")).toBeVisible();
  });

  test("account dropdown lists available accounts", async ({
    mockPage,
    page,
  }) => {
    await unlockAndGoToImport(mockPage, page);

    const select = page.getByTestId("import-account-select");
    const options = select.locator("option");
    await expect(options).toHaveCount(2);
    await expect(options.nth(0)).toContainText("TD Chequing");
    await expect(options.nth(1)).toContainText("TD Visa");
  });

  test("CSV mapping step shows after file selection", async ({
    mockPage,
    page,
  }) => {
    await unlockAndGoToImport(mockPage, page, {
      "plugin:dialog|open": { data: "/mock/path/to/data.csv" },
      "plugin:fs|read_text_file": {
        data: "Date,Amount,Description\n2026-01-10,-85.42,LOBLAWS #1234\n2026-01-12,-23.99,UNKNOWN MERCHANT 42",
      },
    });

    await page.getByTestId("import-file-btn").click();

    // CSV files go to the mapping step
    await expect(page.getByTestId("csv-preview-table")).toBeVisible();
  });

  test("CSV mapping step shows column dropdowns", async ({
    mockPage,
    page,
  }) => {
    await unlockAndGoToImport(mockPage, page, {
      "plugin:dialog|open": { data: "/mock/path/to/data.csv" },
      "plugin:fs|read_text_file": {
        data: "Date,Amount,Description\n2026-01-10,-85.42,LOBLAWS #1234\n2026-01-12,-23.99,UNKNOWN MERCHANT 42",
      },
    });

    await page.getByTestId("import-file-btn").click();

    await expect(page.getByTestId("csv-date-col")).toBeVisible();
    await expect(page.getByTestId("csv-amount-col")).toBeVisible();
    await expect(page.getByTestId("csv-desc-col")).toBeVisible();
    await expect(page.getByTestId("csv-date-format")).toBeVisible();
  });

  test("preview step shows transaction count after CSV mapping", async ({
    mockPage,
    page,
  }) => {
    await unlockAndGoToImport(mockPage, page, {
      "plugin:dialog|open": { data: "/mock/path/to/data.csv" },
      "plugin:fs|read_text_file": {
        data: "Date,Amount,Description\n2026-01-10,-85.42,LOBLAWS #1234\n2026-01-12,-23.99,UNKNOWN MERCHANT 42",
      },
    });

    // Select file -> CSV mapping step
    await page.getByTestId("import-file-btn").click();
    await expect(page.getByTestId("csv-preview-table")).toBeVisible();

    // Submit mapping -> preview step
    await page.getByTestId("csv-submit").click();

    await expect(page.getByTestId("preview-new-count")).toHaveText("2");
    await expect(page.getByTestId("preview-dup-count")).toHaveText("0");
  });

  test("import result shows success after completing all steps", async ({
    mockPage,
    page,
  }) => {
    await unlockAndGoToImport(mockPage, page, {
      "plugin:dialog|open": { data: "/mock/path/to/data.csv" },
      "plugin:fs|read_text_file": {
        data: "Date,Amount,Description\n2026-01-10,-85.42,LOBLAWS #1234\n2026-01-12,-23.99,UNKNOWN MERCHANT 42",
      },
    });

    // Step 1: Select file
    await page.getByTestId("import-file-btn").click();
    await expect(page.getByTestId("csv-preview-table")).toBeVisible();

    // Step 2: Submit CSV mapping
    await page.getByTestId("csv-submit").click();
    await expect(page.getByTestId("preview-new-count")).toBeVisible();

    // Step 3: Import
    await page.getByTestId("preview-import-btn").click();

    // Result step
    await expect(page.getByTestId("result-imported-count")).toHaveText("2");
    await expect(page.getByTestId("result-import-another")).toBeVisible();
    await expect(page.getByTestId("result-view-transactions")).toBeVisible();
  });
});
