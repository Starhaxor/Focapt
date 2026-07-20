import type { UserSettings } from "@focapt/contracts/settings";
import type { RuntimeMessage } from "@focapt/contracts/captions";
import { DEFAULT_SETTINGS, normalizeSettings } from "@focapt/core/settings";
import { readYouTubeVideoId } from "../youtube/youtube-url";

function control(form: HTMLFormElement, name: string): HTMLInputElement | HTMLSelectElement {
  const item = form.elements.namedItem(name);
  if (!(item instanceof HTMLInputElement) && !(item instanceof HTMLSelectElement)) {
    throw new Error(`MISSING_SETTINGS_CONTROL:${name}`);
  }
  return item;
}

const setValue = (form: HTMLFormElement, name: string, value: string | number): void => {
  control(form, name).value = String(value);
};

const setChecked = (form: HTMLFormElement, name: string, checked: boolean): void => {
  const item = control(form, name);
  if (!(item instanceof HTMLInputElement) || item.type !== "checkbox") {
    throw new Error(`INVALID_SETTINGS_CHECKBOX:${name}`);
  }
  item.checked = checked;
};

export function populateSettingsForm(form: HTMLFormElement, settings: UserSettings): void {
  setChecked(form, "enabled", settings.enabled);
  setValue(form, "theme", settings.theme);
  setValue(form, "sourceLanguage", settings.sourceLanguage);
  setValue(form, "targetLanguage", settings.targetLanguage);
  setValue(form, "positionMode", settings.positionMode);
  setValue(form, "delayMs", settings.delayMs);
  setValue(form, "pointerOffsetPx", settings.pointerOffsetPx);
  setValue(form, "fixedX", settings.fixedPosition.xRatio * 100);
  setValue(form, "fixedY", settings.fixedPosition.yRatio * 100);
  setValue(form, "sourceColor", settings.sourceStyle.color);
  setValue(form, "sourceSize", settings.sourceStyle.fontSizePx);
  setValue(form, "sourceWeight", settings.sourceStyle.fontWeight);
  setValue(form, "translationColor", settings.translationStyle.color);
  setValue(form, "translationSize", settings.translationStyle.fontSizePx);
  setValue(form, "translationWeight", settings.translationStyle.fontWeight);
  setValue(form, "boxColor", settings.box.backgroundColor);
  setValue(form, "boxOpacity", settings.box.opacity);
  setValue(form, "paddingPx", settings.box.paddingPx);
  setValue(form, "radiusPx", settings.box.radiusPx);
  setValue(form, "lineGapPx", settings.box.lineGapPx);
  setValue(form, "scope", settings.scope);
  setValue(form, "uiLocale", settings.uiLocale);
}

const value = (form: HTMLFormElement, name: string): string => control(form, name).value;
const numberValue = (form: HTMLFormElement, name: string): number => Number(value(form, name));
const checked = (form: HTMLFormElement, name: string): boolean => {
  const item = control(form, name);
  if (!(item instanceof HTMLInputElement) || item.type !== "checkbox") {
    throw new Error(`INVALID_SETTINGS_CHECKBOX:${name}`);
  }
  return item.checked;
};

export function readSettingsForm(form: HTMLFormElement): UserSettings {
  return normalizeSettings({
    ...DEFAULT_SETTINGS,
    enabled: checked(form, "enabled"),
    theme: value(form, "theme"),
    sourceLanguage: value(form, "sourceLanguage"),
    targetLanguage: value(form, "targetLanguage"),
    positionMode: value(form, "positionMode"),
    delayMs: numberValue(form, "delayMs"),
    pointerOffsetPx: numberValue(form, "pointerOffsetPx"),
    fixedPosition: {
      xRatio: numberValue(form, "fixedX") / 100,
      yRatio: numberValue(form, "fixedY") / 100
    },
    sourceStyle: {
      color: value(form, "sourceColor"),
      fontSizePx: numberValue(form, "sourceSize"),
      fontWeight: numberValue(form, "sourceWeight")
    },
    translationStyle: {
      color: value(form, "translationColor"),
      fontSizePx: numberValue(form, "translationSize"),
      fontWeight: numberValue(form, "translationWeight")
    },
    box: {
      backgroundColor: value(form, "boxColor"),
      opacity: numberValue(form, "boxOpacity"),
      paddingPx: numberValue(form, "paddingPx"),
      radiusPx: numberValue(form, "radiusPx"),
      lineGapPx: numberValue(form, "lineGapPx")
    },
    scope: value(form, "scope"),
    uiLocale: value(form, "uiLocale")
  });
}

export function normalizeSettingsForm(form: HTMLFormElement): UserSettings {
  const settings = readSettingsForm(form);
  populateSettingsForm(form, settings);
  return settings;
}

export function setPopupReady(
  form: HTMLFormElement,
  startButton: HTMLButtonElement | null,
  ready: boolean
): void {
  form.dataset.ready = String(ready);
  form.setAttribute("aria-busy", String(!ready));
  form.toggleAttribute("inert", !ready);
  for (const fieldset of form.querySelectorAll<HTMLFieldSetElement>("fieldset")) {
    fieldset.disabled = !ready;
  }
  if (startButton) startButton.disabled = !ready;
}

export function guardWhenReady(
  form: HTMLFormElement,
  listener: EventListener
): EventListener {
  return (event) => {
    if (form.dataset.ready !== "true") {
      event.preventDefault();
      return;
    }
    listener(event);
  };
}

export function isYouTubeVideoUrl(value: string | undefined): boolean {
  return value !== undefined && readYouTubeVideoId(value) !== null;
}

export function readVideoTimeResponse(value: unknown): number | null {
  if (typeof value !== "object" || value === null || !("videoTimeMs" in value)) return null;
  const videoTimeMs = value.videoTimeMs;
  if (typeof videoTimeMs !== "number" || !Number.isFinite(videoTimeMs) || videoTimeMs < 0) return null;
  return Math.min(videoTimeMs, Number.MAX_SAFE_INTEGER);
}

export function createStartAiCaptureMessage(
  settings: UserSettings,
  tabId: number,
  videoTimeMs: number
): Extract<RuntimeMessage, { type: "START_AI_CAPTURE" }> {
  return {
    type: "START_AI_CAPTURE",
    tabId,
    sourceLanguage: settings.sourceLanguage,
    targetLanguage: settings.targetLanguage,
    videoTimeMs: readVideoTimeResponse({ videoTimeMs }) ?? 0
  };
}

export class DebouncedSerialWriter<T> {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: T | undefined;
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly write: (value: T) => Promise<void>,
    private readonly delayMs: number,
    private readonly onError: (error: unknown) => void = () => undefined
  ) {}

  schedule(value: T): void {
    this.pending = value;
    if (this.timer !== undefined) globalThis.clearTimeout(this.timer);
    this.timer = globalThis.setTimeout(() => this.enqueuePending(), this.delayMs);
  }

  cancel(): void {
    if (this.timer !== undefined) globalThis.clearTimeout(this.timer);
    this.timer = undefined;
    this.pending = undefined;
  }

  async flush(): Promise<void> {
    if (this.pending !== undefined) {
      if (this.timer !== undefined) globalThis.clearTimeout(this.timer);
      this.enqueuePending();
    }
    await this.chain;
  }

  private enqueuePending(): void {
    this.timer = undefined;
    if (this.pending === undefined) return;
    const next = this.pending;
    this.pending = undefined;
    this.chain = this.chain.then(() => this.write(next)).catch((error: unknown) => {
      this.onError(error);
    });
  }
}
