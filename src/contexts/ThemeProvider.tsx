// src/contexts/ThemeProvider.tsx
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  Theme,
  Resolved,
  THEME_KEY,
  readStoredTheme,
  resolveTheme,
  applyResolved,
} from "../lib/theme";

interface ThemeCtx {
  theme: Theme;
  resolved: Resolved;
  setTheme: (t: Theme) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

function prefersDark(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : false;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme());
  const [resolved, setResolved] = useState<Resolved>(() => resolveTheme(theme, prefersDark()));

  // 应用当前主题到 <html>
  useEffect(() => {
    const r = resolveTheme(theme, prefersDark());
    setResolved(r);
    applyResolved(r);
  }, [theme]);

  // system 模式下跟随 OS 切换
  useEffect(() => {
    if (theme !== "system" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const r = resolveTheme("system", mq.matches);
      setResolved(r);
      applyResolved(r);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    localStorage.setItem(THEME_KEY, t);
    setThemeState(t);
  }, []);

  return <Ctx.Provider value={{ theme, resolved, setTheme }}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme must be used within ThemeProvider");
  return c;
}
