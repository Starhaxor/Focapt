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
});
