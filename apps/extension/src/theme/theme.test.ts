// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { applyTheme, resolveTheme } from "./theme";

describe("shared theme helpers", () => {
  it("resolves system preferences while explicit preferences win", () => {
    expect(resolveTheme("system", { matches: true })).toBe("dark");
    expect(resolveTheme("system", { matches: false })).toBe("light");
    expect(resolveTheme("light", { matches: true })).toBe("light");
    expect(resolveTheme("dark", { matches: false })).toBe("dark");
  });

  it("applies the resolved theme to the document root", () => {
    applyTheme(document.documentElement, "dark");

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });
});
