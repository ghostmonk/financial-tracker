import type { Page } from "@playwright/test";

export type MockResponse = { data: unknown } | { error: string };
export type MockResponseMap = Record<string, MockResponse>;

/**
 * Injects a fake `window.__TAURI_INTERNALS__` before any page JS runs.
 * Each entry in `responseMap` is either `{ data: <value> }` (success) or
 * `{ error: <message> }` (throws). All data is pre-evaluated in Node.js
 * and injected as static JSON — no eval in the browser.
 */
export async function injectTauriMock(
  page: Page,
  responseMap: MockResponseMap,
): Promise<void> {
  await page.addInitScript((json: string) => {
    const responses: Record<
      string,
      { data?: unknown; error?: string }
    > = JSON.parse(json);

    // Every invoke is recorded so specs can assert on the args sent
    const calls: { cmd: string; args: Record<string, unknown> }[] = [];
    (window as unknown as Record<string, unknown>).__TAURI_MOCK_CALLS__ = calls;

    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: "main" },
        currentWebview: { label: "main" },
      },

      convertFileSrc: (filePath: string) => {
        return `https://asset.localhost/${encodeURIComponent(filePath)}`;
      },

      invoke: async (cmd: string, args: Record<string, unknown> = {}) => {
        calls.push({ cmd, args: structuredClone(args) });
        const entry = responses[cmd];
        if (!entry) {
          const msg = `[tauri-ipc-mock] Unhandled command: "${cmd}"`;
          console.warn(msg);
          throw new Error(msg);
        }
        if ("error" in entry) {
          throw new Error(entry.error);
        }
        return structuredClone(entry.data);
      },
    };
  }, JSON.stringify(responseMap));
}

/** Returns the args of every recorded invoke of `cmd`, oldest first. */
export async function getMockCalls(
  page: Page,
  cmd: string,
): Promise<Record<string, unknown>[]> {
  return page.evaluate((name: string) => {
    const calls = (window as unknown as Record<string, unknown>)
      .__TAURI_MOCK_CALLS__ as { cmd: string; args: Record<string, unknown> }[];
    return calls.filter((c) => c.cmd === name).map((c) => c.args);
  }, cmd);
}
