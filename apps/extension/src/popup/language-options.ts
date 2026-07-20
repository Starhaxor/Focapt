import type { LanguageOption } from "@focapt/contracts/captions";
import type { UserSettings } from "@focapt/contracts/settings";
import {
  isYouTubeLanguageCode,
  normalizeLanguageCatalog,
  resolveDefaultLanguages
} from "@focapt/core/languages";
import { normalizeSettings } from "@focapt/core/settings";

export interface LanguageSelectOptions {
  locale?: string;
  unavailableLabel?: string;
}

export function resolvePopupInitialSettings(
  settings: UserSettings,
  hasExplicitSettings: boolean,
  browserLocale: string,
  languages: readonly LanguageOption[]
): UserSettings {
  if (hasExplicitSettings || languages.length === 0) return settings;
  return normalizeSettings({
    ...settings,
    ...resolveDefaultLanguages(browserLocale, languages)
  });
}

export function readLanguageCatalogResponse(value: unknown): LanguageOption[] {
  if (typeof value !== "object" || value === null || !("languages" in value)) return [];
  const languages = value.languages;
  if (!Array.isArray(languages)) return [];

  const validated: LanguageOption[] = [];
  for (const entry of languages) {
    if (typeof entry !== "object" || entry === null) return [];
    const languageCode = "languageCode" in entry ? entry.languageCode : undefined;
    const label = "label" in entry ? entry.label : undefined;
    if (!isYouTubeLanguageCode(languageCode) || typeof label !== "string" || label.trim() === "") {
      return [];
    }
    validated.push({ languageCode, label: label.trim() });
  }
  return normalizeLanguageCatalog(validated);
}

export function populateLanguageSelect(
  select: HTMLSelectElement,
  languages: readonly LanguageOption[],
  selectedValue: string,
  options: LanguageSelectOptions = {}
): void {
  const collator = new Intl.Collator(options.locale, { sensitivity: "base" });
  const normalized = normalizeLanguageCatalog(languages)
    .map((language, index) => ({ language, index }))
    .sort((left, right) =>
      collator.compare(left.language.label, right.language.label) || left.index - right.index
    )
    .map(({ language }) => language);
  const selectedLanguage = normalized.find(
    ({ languageCode }) => languageCode.toLowerCase() === selectedValue.toLowerCase()
  );
  const optionElements: HTMLOptionElement[] = [];

  if (!selectedLanguage && isYouTubeLanguageCode(selectedValue)) {
    const unavailable = select.ownerDocument.createElement("option");
    unavailable.value = selectedValue;
    unavailable.text = `${selectedValue} — ${options.unavailableLabel ?? "Unavailable"}`;
    unavailable.disabled = true;
    optionElements.push(unavailable);
  }

  for (const language of normalized) {
    const option = select.ownerDocument.createElement("option");
    option.value = language.languageCode;
    option.text = language.label;
    optionElements.push(option);
  }

  select.replaceChildren(...optionElements);
  select.value = selectedLanguage?.languageCode ?? selectedValue;
}
