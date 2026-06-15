import { describe, it, expect, beforeEach } from "vitest";
import { resolveTheme, readStoredTheme, THEME_KEY } from "../lib/theme";

describe("resolveTheme", () => {
  it("returns explicit light/dark unchanged", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("maps system to the OS preference", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("readStoredTheme", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to system when nothing stored", () => {
    expect(readStoredTheme()).toBe("system");
  });

  it("reads a valid stored value", () => {
    localStorage.setItem(THEME_KEY, "dark");
    expect(readStoredTheme()).toBe("dark");
  });

  it("falls back to system for invalid stored value", () => {
    localStorage.setItem(THEME_KEY, "garbage");
    expect(readStoredTheme()).toBe("system");
  });
});
