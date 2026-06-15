// src/lib/theme.ts
export type Theme = "light" | "dark" | "system";
export type Resolved = "light" | "dark";

export const THEME_KEY = "cc-viewer-theme";

/** system → 跟随 OS 偏好；显式 light/dark 原样返回。 */
export function resolveTheme(theme: Theme, prefersDark: boolean): Resolved {
  if (theme === "system") return prefersDark ? "dark" : "light";
  return theme;
}

/** 读 localStorage；缺省或非法值回退 system。 */
export function readStoredTheme(): Theme {
  const v = typeof localStorage !== "undefined" ? localStorage.getItem(THEME_KEY) : null;
  return v === "light" || v === "dark" || v === "system" ? v : "system";
}

/** 给 <html> 加/去 `.dark`。 */
export function applyResolved(resolved: Resolved): void {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
}
