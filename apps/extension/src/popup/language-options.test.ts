// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@focapt/core/settings";
import {
  populateLanguageSelect,
  readLanguageCatalogResponse,
  resolvePopupInitialSettings
} from "./language-options";

describe("popup language options", () => {
  it("deduplicates codes and locale-sorts YouTube labels", () => {
    const select = document.createElement("select");

    populateLanguageSelect(select, [
      { languageCode: "zh-Hans", label: "中文（简体）" },
      { languageCode: "tr", label: "Türkçe" },
      { languageCode: "en", label: "English" },
      { languageCode: "TR", label: "Duplicate" }
    ], "zh-Hans", { locale: "en" });

    expect([...select.options].map((option) => [option.value, option.text])).toEqual([
      ["en", "English"],
      ["tr", "Türkçe"],
      ["zh-Hans", "中文（简体）"]
    ]);
    expect(select.value).toBe("zh-Hans");
  });

  it("preserves a missing saved language with one disabled unavailable option", () => {
    const select = document.createElement("select");

    populateLanguageSelect(select, [
      { languageCode: "en", label: "English" },
      { languageCode: "tr", label: "Türkçe" }
    ], "fr", { locale: "en", unavailableLabel: "Unavailable" });
    populateLanguageSelect(select, [
      { languageCode: "en", label: "English" },
      { languageCode: "tr", label: "Türkçe" }
    ], "fr", { locale: "en", unavailableLabel: "Unavailable" });

    expect([...select.options].map((option) => ({
      value: option.value,
      text: option.text,
      disabled: option.disabled
    }))).toEqual([
      { value: "fr", text: "fr — Unavailable", disabled: true },
      { value: "en", text: "English", disabled: false },
      { value: "tr", text: "Türkçe", disabled: false }
    ]);
    expect(select.value).toBe("fr");
  });

  it("accepts only a validated language-catalog response", () => {
    expect(readLanguageCatalogResponse({ languages: [
      { languageCode: "en", label: "English" },
      { languageCode: "zh-Hans", label: "中文（简体）" }
    ] })).toEqual([
      { languageCode: "en", label: "English" },
      { languageCode: "zh-Hans", label: "中文（简体）" }
    ]);
    expect(readLanguageCatalogResponse({ languages: [
      { languageCode: "javascript:", label: "Unsafe" }
    ] })).toEqual([]);
    expect(readLanguageCatalogResponse(null)).toEqual([]);
  });

  it("uses browser-language defaults only when settings are implicit", () => {
    const languages = [
      { languageCode: "en", label: "English" },
      { languageCode: "tr", label: "Türkçe" }
    ];

    expect(resolvePopupInitialSettings(DEFAULT_SETTINGS, false, "tr-TR", languages)).toMatchObject({
      sourceLanguage: "en",
      targetLanguage: "tr"
    });
    expect(resolvePopupInitialSettings(
      { ...DEFAULT_SETTINGS, sourceLanguage: "tr", targetLanguage: "en" },
      true,
      "tr-TR",
      languages
    )).toMatchObject({ sourceLanguage: "tr", targetLanguage: "en" });
  });
});
