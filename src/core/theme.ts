// Light / dark theme. `system` follows the OS (CSS media query, no JS needed for
// the visuals); `light` / `dark` force one via the `data-theme` attribute.

import { getCurrentWindow } from "@tauri-apps/api/window";
import { IS_TAURI } from "./bridge";

export type Theme = "system" | "light" | "dark";

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.dataset.theme = theme;

  // Keep the native window chrome (and the WebView's default colours) in step.
  if (IS_TAURI) {
    const native = theme === "system" ? null : theme;
    void getCurrentWindow().setTheme(native).catch(() => {});
  }
}
