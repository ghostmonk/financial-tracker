import { openUrl } from "@tauri-apps/plugin-opener";

export function searchGoogle(query: string) {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  openUrl(url).catch(console.error);
}
