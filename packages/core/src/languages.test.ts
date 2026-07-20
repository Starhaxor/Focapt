import { describe, expect, it } from "vitest";
import {
  isYouTubeLanguageCode,
  normalizeLanguageCatalog,
  resolveDefaultLanguages
} from "./languages";

describe("YouTube language catalog", () => {
  it("accepts YouTube language codes and rejects unsafe strings", () => {
    expect(isYouTubeLanguageCode("zh-Hans")).toBe(true);
    expect(isYouTubeLanguageCode("pt-BR")).toBe(true);
    expect(isYouTubeLanguageCode("javascript:")).toBe(false);
  });

  it("deduplicates a catalog while preserving its first valid entries", () => {
    expect(normalizeLanguageCatalog([
      { languageCode: "tr", label: "TÃ¼rkÃ§e" },
      { languageCode: "tr", label: "Duplicate" },
      { languageCode: "zh-Hans", label: "ä¸­æ–‡ï¼ˆç®€ä½“ï¼‰" }
    ])).toEqual([
      { languageCode: "tr", label: "TÃ¼rkÃ§e" },
      { languageCode: "zh-Hans", label: "ä¸­æ–‡ï¼ˆç®€ä½“ï¼‰" }
    ]);
  });

  it("ignores malformed catalog entries without throwing", () => {
    const options = [
      { languageCode: null, label: "Invalid" },
      { languageCode: { code: "tr" }, label: "Invalid" },
      { languageCode: "tr", label: 12 },
      { languageCode: "en", label: "English" }
    ] as unknown as { languageCode: string; label: string }[];

    expect(() => normalizeLanguageCatalog(options)).not.toThrow();
    expect(normalizeLanguageCatalog(options)).toEqual([{ languageCode: "en", label: "English" }]);
  });

  it("resolves a browser-locale target and falls back to English", () => {
    expect(resolveDefaultLanguages("tr-TR", [
      { languageCode: "en", label: "English" },
      { languageCode: "tr", label: "TÃ¼rkÃ§e" }
    ])).toEqual({ sourceLanguage: "en", targetLanguage: "tr" });
    expect(resolveDefaultLanguages("xx-YY", [{ languageCode: "en", label: "English" }]))
      .toEqual({ sourceLanguage: "en", targetLanguage: "en" });
  });

  it("ignores malformed entries while resolving default languages", () => {
    const options = [
      { languageCode: ["tr"], label: "Invalid" },
      { languageCode: "tr", label: null },
      { languageCode: "en", label: "English" },
      { languageCode: "tr", label: "TÃ¼rkÃ§e" }
    ] as unknown as { languageCode: string; label: string }[];

    expect(() => resolveDefaultLanguages("tr-TR", options)).not.toThrow();
    expect(resolveDefaultLanguages("tr-TR", options))
      .toEqual({ sourceLanguage: "en", targetLanguage: "tr" });
  });
});
