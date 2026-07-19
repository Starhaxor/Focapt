import type { UserSettings } from "@focapt/contracts/settings";
import { DEFAULT_SETTINGS } from "@focapt/core/settings";
import { browser } from "wxt/browser";
import { createExtensionTranslator, type Translator } from "../../src/i18n/translator";
import {
  createStartAiCaptureMessage,
  DebouncedSerialWriter,
  guardWhenReady,
  isYouTubeVideoUrl,
  normalizeSettingsForm,
  populateSettingsForm,
  readSettingsForm,
  readVideoTimeResponse,
  setPopupReady
} from "../../src/popup/settings-form";
import { SettingsStore } from "../../src/runtime/settings-store";

const SITE = "youtube.com";
const form = document.querySelector<HTMLFormElement>("#settings")!;
const status = document.querySelector<HTMLOutputElement>("#status")!;
const startAiButton = document.querySelector<HTMLButtonElement>("#start-ai")!;
const store = new SettingsStore(browser.storage.local);
setPopupReady(form, startAiButton, false);

let translator: Translator | undefined;
let selectedLocale: UserSettings["uiLocale"] = "auto";
let statusKey = "loading";

function t(key: string): string {
  const getMessage = browser.i18n.getMessage as (messageName: string) => string;
  return translator?.t(key, selectedLocale) ?? (getMessage(key) || key);
}

function localize(locale: UserSettings["uiLocale"] = selectedLocale): void {
  selectedLocale = locale;
  document.documentElement.lang = translator?.resolveLocale(locale) ??
    (browser.i18n.getUILanguage().toLowerCase().startsWith("tr") ? "tr" : "en");
  for (const element of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const key = element.dataset.i18n;
    if (key) element.textContent = t(key);
  }
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
  localize(settings.uiLocale);
  setStatus("saving");
  writer.schedule(settings);
}));

form.addEventListener("change", guardWhenReady(form, () => {
  const settings = normalizeSettingsForm(form);
  localize(settings.uiLocale);
  setStatus("saving");
  writer.schedule(settings);
}));

form.addEventListener("reset", guardWhenReady(form, (event) => {
  event.preventDefault();
  writer.cancel();
  populateSettingsForm(form, DEFAULT_SETTINGS);
  localize(DEFAULT_SETTINGS.uiLocale);
  setStatus("saving");
  writer.schedule(DEFAULT_SETTINGS);
  void writer.flush();
}));

startAiButton.addEventListener("click", guardWhenReady(form, () => {
  void (async () => {
    startAiButton.disabled = true;
    try {
      await writer.flush();
      const tab = await activeTab();
      if (!tab || !isYouTubeVideoUrl(tab.url)) {
        setStatus("notYouTubeVideo", "error");
        return;
      }

      let videoTimeMs: number | null = null;
      try {
        videoTimeMs = readVideoTimeResponse(
          await browser.tabs.sendMessage(tab.id, { type: "GET_VIDEO_TIME" })
        );
      } catch {
        setStatus("messagingUnavailable", "error");
        return;
      }
      if (videoTimeMs === null) {
        setStatus("messagingUnavailable", "error");
        return;
      }

      await browser.runtime.sendMessage(
        createStartAiCaptureMessage(readSettingsForm(form), tab.id, videoTimeMs)
      );
      setStatus("captureRequested");
    } catch {
      setStatus("captureFailed", "error");
    } finally {
      startAiButton.disabled = false;
    }
  })();
}));

void (async () => {
  try {
    translator = await createExtensionTranslator();
  } catch {
    // browser.i18n remains a locale-bundle-backed fallback.
  }

  try {
    const saved = await store.get(SITE);
    populateSettingsForm(form, saved);
    localize(saved.uiLocale);
    setStatus("settingsReady");
  } catch {
    populateSettingsForm(form, DEFAULT_SETTINGS);
    localize(DEFAULT_SETTINGS.uiLocale);
    setStatus("settingsLoadFailed", "error");
  } finally {
    setPopupReady(form, startAiButton, true);
    form.querySelector<HTMLElement>("select, input, button")?.focus({ preventScroll: true });
  }
})().catch(() => {
  populateSettingsForm(form, DEFAULT_SETTINGS);
  localize(DEFAULT_SETTINGS.uiLocale);
  setStatus("settingsLoadFailed", "error");
  setPopupReady(form, startAiButton, true);
});
