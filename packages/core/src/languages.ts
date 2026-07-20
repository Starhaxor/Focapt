import type { LanguageOption } from "@focapt/contracts/captions";

const LANGUAGE_CODE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/;

export const isYouTubeLanguageCode = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 35 && LANGUAGE_CODE.test(value);

function isLanguageOption(value: unknown): value is LanguageOption {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;

  const option = value as { languageCode?: unknown; label?: unknown };
  return isYouTubeLanguageCode(option.languageCode) && typeof option.label === "string";
}

export function normalizeLanguageCatalog(options: readonly LanguageOption[]): LanguageOption[] {
  const languageCodes = new Set<string>();

  return options.filter((option) => {
    if (!isLanguageOption(option)) return false;
    const normalizedCode = option.languageCode.toLowerCase();
    if (languageCodes.has(normalizedCode)) return false;
    languageCodes.add(normalizedCode);
    return true;
  });
}

export function resolveDefaultLanguages(browserLocale: string, options: readonly LanguageOption[]) {
  const catalog = normalizeLanguageCatalog(options);
  const browser = browserLocale.toLowerCase();
  const base = browser.split("-")[0] ?? "";
  const exact = catalog.find((option) => option.languageCode.toLowerCase() === browser);
  const baseMatch = catalog.find((option) => option.languageCode.toLowerCase() === base);
  const english = catalog.find((option) => option.languageCode.toLowerCase() === "en");

  return {
    sourceLanguage: english?.languageCode ?? "en",
    targetLanguage: exact?.languageCode ?? baseMatch?.languageCode ?? english?.languageCode ?? "en"
  };
}
