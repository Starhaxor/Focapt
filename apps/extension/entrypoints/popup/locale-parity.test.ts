// @vitest-environment node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const popupDirectory = fileURLToPath(new URL(".", import.meta.url));
const extensionDirectory = fileURLToPath(new URL("../../", import.meta.url));
const readJson = (path: string): Record<string, { message: string }> =>
  JSON.parse(readFileSync(path, "utf8")) as Record<string, { message: string }>;

describe("popup locale bundles", () => {
  const en = readJson(`${extensionDirectory}/public/_locales/en/messages.json`);
  const tr = readJson(`${extensionDirectory}/public/_locales/tr/messages.json`);

  it("en ve tr aynı anahtarları eksiksiz taşır", () => {
    expect(Object.keys(tr).sort()).toEqual(Object.keys(en).sort());
  });

  it("popup'taki bütün görünür i18n anahtarları iki bundle'da da bulunur", () => {
    const html = readFileSync(`${popupDirectory}/index.html`, "utf8");
    const keys = [...html.matchAll(/data-i18n="([^"]+)"/g)].map((match) => match[1]!);
    expect(keys.length).toBeGreaterThan(20);
    for (const key of keys) {
      expect(en, `missing en key: ${key}`).toHaveProperty(key);
      expect(tr, `missing tr key: ${key}`).toHaveProperty(key);
    }
  });

  it("HTML içinde locale bundle dışı statik görünür metin bırakmaz", () => {
    const html = readFileSync(`${popupDirectory}/index.html`, "utf8");
    const literals = [...html.matchAll(/>([^<]+)</g)]
      .map((match) => match[1]!.trim())
      .filter(Boolean);
    expect(literals).toEqual([]);
  });

  it("uses live language selects and exposes shared subtitle and theme controls", () => {
    const html = readFileSync(`${popupDirectory}/index.html`, "utf8");

    expect(html).toContain('<select name="sourceLanguage"></select>');
    expect(html).toContain('<select name="targetLanguage"></select>');
    expect(html).toContain('input name="enabled" type="checkbox"');
    expect(html).toContain('select name="theme"');
    expect(html).toContain('data-i18n="themeSystem"');
    expect(html).not.toContain('data-i18n="languageEnglish"');
  });

  it("defines explicit semantic light and dark theme tokens", () => {
    const css = readFileSync(`${popupDirectory}/style.css`, "utf8");

    expect(css).toContain(":root[data-theme=\"light\"]");
    expect(css).toContain(":root[data-theme=\"dark\"]");
    expect(css).toContain("--color-canvas:");
    expect(css).toContain(":focus-visible");
  });

  it("requests the active video's live language catalog", () => {
    const main = readFileSync(`${popupDirectory}/main.ts`, "utf8");

    expect(main).toContain('type: "GET_LANGUAGE_CATALOG"');
    expect(main).toContain("populateLanguageSelect");
    expect(main).toContain("resolvePopupInitialSettings");
    expect(main).toContain("store.getSnapshot(SITE)");
    expect(main).not.toContain("store.hasExplicitSettings(SITE)");
  });
});
