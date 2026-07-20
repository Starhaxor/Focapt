import type { LanguageOption } from "@focapt/contracts/captions";
import type { ThemePreference, UserSettings } from "@focapt/contracts/settings";
import { DEFAULT_SETTINGS } from "@focapt/core/settings";
import { browser } from "wxt/browser";
import { createExtensionTranslator, type Translator } from "../../src/i18n/translator";
import {
  populateLanguageSelect,
  readLanguageCatalogResponse,
  resolvePopupInitialSettings
} from "../../src/popup/language-options";
import {
  DebouncedSerialWriter,
  guardWhenReady,
  isYouTubeVideoUrl,
  normalizeSettingsForm,
  populateSettingsForm,
  readSettingsForm,
  setPopupReady
} from "../../src/popup/settings-form";
import { SettingsStore } from "../../src/runtime/settings-store";
import { applyTheme, resolveTheme } from "../../src/theme/theme";

const SITE = "youtube.com";
const form = document.querySelector<HTMLFormElement>("#settings")!;
const status = document.querySelector<HTMLOutputElement>("#status")!;
const startAiButton = document.querySelector<HTMLButtonElement>("#start-ai");
const store = new SettingsStore(browser.storage.local);
const darkScheme = window.matchMedia("(prefers-color-scheme: dark)");
setPopupReady(form, startAiButton, false);
applyTheme(document.documentElement, resolveTheme(DEFAULT_SETTINGS.theme, darkScheme));

let translator: Translator | undefined;
let selectedLocale: UserSettings["uiLocale"] = "auto";
let statusKey = "loading";
let languageCatalog: LanguageOption[] = [];

function t(key: string): string {
  const getMessage = browser.i18n.getMessage as (messageName: string) => string;
  return translator?.t(key, selectedLocale) ?? (getMessage(key) || key);
}

function syncTheme(preference: ThemePreference): void {
  applyTheme(document.documentElement, resolveTheme(preference, darkScheme));
}

function renderLanguageOptions(sourceLanguage: string, targetLanguage: string): void {
  const options = {
    locale: document.documentElement.lang,
    unavailableLabel: t("languageUnavailable")
  };
  populateLanguageSelect(
    form.elements.namedItem("sourceLanguage") as HTMLSelectElement,
    languageCatalog,
    sourceLanguage,
    options
  );
  populateLanguageSelect(
    form.elements.namedItem("targetLanguage") as HTMLSelectElement,
    languageCatalog,
    targetLanguage,
    options
  );
}

function localize(locale: UserSettings["uiLocale"] = selectedLocale): void {
  selectedLocale = locale;
  document.documentElement.lang = translator?.resolveLocale(locale) ??
    (browser.i18n.getUILanguage().toLowerCase().startsWith("tr") ? "tr" : "en");
  for (const element of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const key = element.dataset.i18n;
    if (key) element.textContent = t(key);
  }
  const source = form.elements.namedItem("sourceLanguage") as HTMLSelectElement;
  const target = form.elements.namedItem("targetLanguage") as HTMLSelectElement;
  renderLanguageOptions(
    source.value || DEFAULT_SETTINGS.sourceLanguage,
    target.value || DEFAULT_SETTINGS.targetLanguage
  );
  status.textContent = t(statusKey);
}

function setStatus(key: string, state: "normal" | "error" = "normal"): void {
  statusKey = key;
  status.textContent = t(key);
  status.dataset.state = state;
}

async function activeTab(): Promise<{ id: number; url: string } | null> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return typeof tab?.id === "number" && typeof tab.url === "string"
      ? { id: tab.id, url: tab.url }
      : null;
  } catch {
    return null;
  }
}

async function requestLanguageCatalog(
  tab: { id: number; url: string } | null
): Promise<LanguageOption[]> {
  if (!tab || !isYouTubeVideoUrl(tab.url)) return [];
  try {
    return readLanguageCatalogResponse(
      await browser.tabs.sendMessage(tab.id, { type: "GET_LANGUAGE_CATALOG" })
    );
  } catch {
    return [];
  }
}

async function saveAndBroadcast(settings: UserSettings): Promise<void> {
  await store.set(settings, SITE);
  const tab = await activeTab();
  if (!tab || !isYouTubeVideoUrl(tab.url)) {
    setStatus("settingsSavedNoTab");
    return;
  }
  try {
    await browser.tabs.sendMessage(tab.id, { type: "SETTINGS_UPDATED", settings });
    setStatus("settingsSaved");
  } catch {
    setStatus("messagingUnavailable", "error");
  }
}

const writer = new DebouncedSerialWriter<UserSettings>(
  saveAndBroadcast,
  180,
  () => setStatus("saveFailed", "error")
);

form.addEventListener("input", guardWhenReady(form, () => {
  const settings = readSettingsForm(form);
  syncTheme(settings.theme);
  localize(settings.uiLocale);
  setStatus("saving");
  writer.schedule(settings);
}));

form.addEventListener("change", guardWhenReady(form, () => {
  const settings = normalizeSettingsForm(form);
  syncTheme(settings.theme);
  localize(settings.uiLocale);
  setStatus("saving");
  writer.schedule(settings);
}));

form.addEventListener("reset", guardWhenReady(form, (event) => {
  event.preventDefault();
  writer.cancel();
  renderLanguageOptions(DEFAULT_SETTINGS.sourceLanguage, DEFAULT_SETTINGS.targetLanguage);
  populateSettingsForm(form, DEFAULT_SETTINGS);
  syncTheme(DEFAULT_SETTINGS.theme);
  localize(DEFAULT_SETTINGS.uiLocale);
  setStatus("saving");
  writer.schedule(DEFAULT_SETTINGS);
  void writer.flush();
}));

darkScheme.addEventListener("change", () => {
  if (form.dataset.ready === "true") syncTheme(readSettingsForm(form).theme);
});

void (async () => {
  try {
    translator = await createExtensionTranslator();
  } catch {
    // browser.i18n remains a locale-bundle-backed fallback.
  }

  try {
    const tab = await activeTab();
    languageCatalog = await requestLanguageCatalog(tab);
    const { settings: saved, hasExplicitSettings } = await store.getSnapshot(SITE);
    let settings = resolvePopupInitialSettings(
      saved,
      hasExplicitSettings,
      browser.i18n.getUILanguage(),
      languageCatalog
    );
    if (!hasExplicitSettings && languageCatalog.length > 0) {
      const stored = await store.setDefaultsIfImplicit(settings, SITE);
      if (!stored) settings = await store.get(SITE);
    }
    renderLanguageOptions(settings.sourceLanguage, settings.targetLanguage);
    populateSettingsForm(form, settings);
    syncTheme(settings.theme);
    localize(settings.uiLocale);
    setStatus(languageCatalog.length > 0 ? "settingsReady" : "languageCatalogUnavailable");
  } catch {
    renderLanguageOptions(DEFAULT_SETTINGS.sourceLanguage, DEFAULT_SETTINGS.targetLanguage);
    populateSettingsForm(form, DEFAULT_SETTINGS);
    syncTheme(DEFAULT_SETTINGS.theme);
    localize(DEFAULT_SETTINGS.uiLocale);
    setStatus("settingsLoadFailed", "error");
  } finally {
    setPopupReady(form, startAiButton, true);
    form.querySelector<HTMLElement>("select, input, button")?.focus({ preventScroll: true });
  }
})().catch(() => {
  renderLanguageOptions(DEFAULT_SETTINGS.sourceLanguage, DEFAULT_SETTINGS.targetLanguage);
  populateSettingsForm(form, DEFAULT_SETTINGS);
  syncTheme(DEFAULT_SETTINGS.theme);
  localize(DEFAULT_SETTINGS.uiLocale);
  setStatus("settingsLoadFailed", "error");
  setPopupReady(form, startAiButton, true);
});
