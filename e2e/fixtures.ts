import { test as base, expect } from "@playwright/test";
import { injectTauriMock, type MockResponseMap } from "./mocks/tauri-ipc";
import { createDefaultHandlers } from "./mocks/handlers";

type TestFixtures = {
  mockPage: (
    path: string,
    overrides?: MockResponseMap,
  ) => Promise<void>;
};

export const test = base.extend<TestFixtures>({
  mockPage: async ({ page }, use) => {
    const navigate = async (
      path: string,
      overrides?: MockResponseMap,
    ) => {
      const handlers = createDefaultHandlers(overrides);
      await injectTauriMock(page, handlers);
      await page.goto(path);
    };
    await use(navigate);
  },
});

export { expect };
