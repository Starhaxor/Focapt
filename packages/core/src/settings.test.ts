import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "./settings";

describe("normalizeSettings", () => {
  it("gecikmeyi ve görünüm değerlerini güvenli aralığa sıkıştırır", () => {
    const result = normalizeSettings({
      delayMs: -5,
      sourceStyle: { fontSizePx: 90 },
      box: { opacity: 3 }
    });

    expect(result.delayMs).toBe(0);
    expect(result.sourceStyle.fontSizePx).toBe(48);
    expect(result.box.opacity).toBe(1);
    expect(DEFAULT_SETTINGS.delayMs).toBe(600);
  });

  it("plain object olmayan girdiler için varsayılanları döndürür", () => {
    class SettingsLike {
      delayMs = 1_500;
    }

    expect(normalizeSettings(new SettingsLike())).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings([])).toEqual(DEFAULT_SETTINGS);
  });

  it("finite olmayan sayıları varsayılana döndürür ve finite sayıları sınırlar", () => {
    const result = normalizeSettings({
      delayMs: Number.NaN,
      pointerOffsetPx: Number.POSITIVE_INFINITY,
      fixedPosition: { xRatio: -1, yRatio: 2 },
      sourceStyle: { fontSizePx: Number.NEGATIVE_INFINITY },
      translationStyle: { fontSizePx: 90 },
      box: {
        opacity: Number.NaN,
        paddingPx: -2,
        radiusPx: Number.POSITIVE_INFINITY,
        lineGapPx: 30
      }
    });

    expect(result.delayMs).toBe(DEFAULT_SETTINGS.delayMs);
    expect(result.pointerOffsetPx).toBe(DEFAULT_SETTINGS.pointerOffsetPx);
    expect(result.fixedPosition).toEqual({ xRatio: 0, yRatio: 1 });
    expect(result.sourceStyle.fontSizePx).toBe(DEFAULT_SETTINGS.sourceStyle.fontSizePx);
    expect(result.translationStyle.fontSizePx).toBe(48);
    expect(result.box).toMatchObject({
      opacity: DEFAULT_SETTINGS.box.opacity,
      paddingPx: 4,
      radiusPx: DEFAULT_SETTINGS.box.radiusPx,
      lineGapPx: 24
    });
  });

  it("yalnız desteklenen dil kodlarını kabul eder", () => {
    expect(normalizeSettings({ sourceLanguage: "en-US", targetLanguage: "javascript:" })).toMatchObject({
      sourceLanguage: DEFAULT_SETTINGS.sourceLanguage,
      targetLanguage: DEFAULT_SETTINGS.targetLanguage
    });
    expect(normalizeSettings({ sourceLanguage: "de", targetLanguage: "fr" })).toMatchObject({
      sourceLanguage: "de",
      targetLanguage: "fr"
    });
  });

  it("enum ve yazı kalınlığı değerlerini whitelist ile doğrular", () => {
    const invalid = normalizeSettings({
      positionMode: "floating",
      scope: "tab",
      uiLocale: "de",
      sourceStyle: { fontWeight: 900 },
      translationStyle: { fontWeight: "700" }
    });

    expect(invalid).toMatchObject({
      positionMode: DEFAULT_SETTINGS.positionMode,
      scope: DEFAULT_SETTINGS.scope,
      uiLocale: DEFAULT_SETTINGS.uiLocale,
      sourceStyle: { fontWeight: DEFAULT_SETTINGS.sourceStyle.fontWeight },
      translationStyle: { fontWeight: DEFAULT_SETTINGS.translationStyle.fontWeight }
    });

    const valid = normalizeSettings({
      positionMode: "moving",
      scope: "site",
      uiLocale: "en",
      sourceStyle: { fontWeight: 400 },
      translationStyle: { fontWeight: 600 }
    });
    expect(valid).toMatchObject({
      positionMode: "moving",
      scope: "site",
      uiLocale: "en",
      sourceStyle: { fontWeight: 400 },
      translationStyle: { fontWeight: 600 }
    });
  });

  it("yalnız altı basamaklı güvenli hex renkleri kabul eder", () => {
    const invalid = normalizeSettings({
      sourceStyle: { color: "red" },
      translationStyle: { color: "#12345G" },
      box: { backgroundColor: "url(javascript:alert(1))" }
    });
    expect(invalid).toMatchObject({
      sourceStyle: { color: DEFAULT_SETTINGS.sourceStyle.color },
      translationStyle: { color: DEFAULT_SETTINGS.translationStyle.color },
      box: { backgroundColor: DEFAULT_SETTINGS.box.backgroundColor }
    });

    const valid = normalizeSettings({
      sourceStyle: { color: "#a1B2c3" },
      translationStyle: { color: "#010203" },
      box: { backgroundColor: "#abcdef" }
    });
    expect(valid).toMatchObject({
      sourceStyle: { color: "#a1B2c3" },
      translationStyle: { color: "#010203" },
      box: { backgroundColor: "#abcdef" }
    });
  });

  it("yanlış tipteki nested değerleri güvenli varsayılanlarla değiştirir", () => {
    const result = normalizeSettings({
      fixedPosition: null,
      sourceStyle: null,
      translationStyle: [],
      box: "invalid"
    });

    expect(result.fixedPosition).toEqual(DEFAULT_SETTINGS.fixedPosition);
    expect(result.sourceStyle).toEqual(DEFAULT_SETTINGS.sourceStyle);
    expect(result.translationStyle).toEqual(DEFAULT_SETTINGS.translationStyle);
    expect(result.box).toEqual(DEFAULT_SETTINGS.box);
  });
});
