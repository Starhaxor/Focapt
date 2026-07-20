// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "@focapt/core/settings";
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
} from "./settings-form";

function createForm(): HTMLFormElement {
  document.body.innerHTML = `<form><fieldset>
    <input name="enabled" type="checkbox"><input name="theme">
    <input name="sourceLanguage"><input name="targetLanguage"><input name="positionMode">
    <input name="delayMs" type="number"><input name="pointerOffsetPx" type="number">
    <input name="fixedX" type="number"><input name="fixedY" type="number">
    <input name="sourceColor"><input name="sourceSize" type="number"><input name="sourceWeight" type="number">
    <input name="translationColor"><input name="translationSize" type="number"><input name="translationWeight" type="number">
    <input name="boxColor"><input name="boxOpacity" type="number"><input name="paddingPx" type="number">
    <input name="radiusPx" type="number"><input name="lineGapPx" type="number">
    <input name="scope"><input name="uiLocale">
  </fieldset><button id="start-ai" type="button"></button></form>`;
  return document.querySelector("form")!;
}

afterEach(() => vi.useRealTimers());

describe("popup settings form", () => {
  it("init tamamlanana kadar formu inert/disabled tutar ve erken input yazımını engeller", () => {
    const form = createForm();
    const startButton = form.querySelector<HTMLButtonElement>("#start-ai")!;
    const save = vi.fn();
    form.addEventListener("input", guardWhenReady(form, save));

    setPopupReady(form, startButton, false);
    form.dispatchEvent(new Event("input"));
    expect(save).not.toHaveBeenCalled();
    expect(form.hasAttribute("inert")).toBe(true);
    expect(form.getAttribute("aria-busy")).toBe("true");
    expect(form.querySelector("fieldset")?.disabled).toBe(true);
    expect(startButton.disabled).toBe(true);

    setPopupReady(form, startButton, true);
    form.dispatchEvent(new Event("input"));
    expect(save).toHaveBeenCalledOnce();
    expect(form.hasAttribute("inert")).toBe(false);
    expect(form.getAttribute("aria-busy")).toBe("false");
    expect(form.querySelector("fieldset")?.disabled).toBe(false);
    expect(startButton.disabled).toBe(false);
  });

  it("AI button is optional for the MVP popup", () => {
    const form = createForm();
    form.querySelector("#start-ai")?.remove();

    expect(() => setPopupReady(form, null, true)).not.toThrow();
    expect(form.dataset.ready).toBe("true");
  });

  it("kayıtlı ayarların bütün alanlarını populate edip kayıpsız okur", () => {
    const form = createForm();
    const settings = {
      ...DEFAULT_SETTINGS,
      enabled: false,
      theme: "dark" as const,
      positionMode: "delayed" as const,
      delayMs: 1200,
      pointerOffsetPx: 32,
      fixedPosition: { xRatio: 0.24, yRatio: 0.76 },
      sourceStyle: { color: "#123456", fontSizePx: 28, fontWeight: 600 as const },
      translationStyle: { color: "#abcdef", fontSizePx: 16, fontWeight: 400 as const },
      box: { backgroundColor: "#101820", opacity: 0.7, paddingPx: 14, radiusPx: 10, lineGapPx: 6 },
      scope: "site" as const,
      uiLocale: "tr" as const
    };

    populateSettingsForm(form, settings);
    expect(readSettingsForm(form)).toEqual(settings);
    expect((form.elements.namedItem("fixedX") as HTMLInputElement).value).toBe("24");
    expect((form.elements.namedItem("fixedY") as HTMLInputElement).value).toBe("76");
    expect((form.elements.namedItem("enabled") as HTMLInputElement).checked).toBe(false);
    expect((form.elements.namedItem("theme") as HTMLInputElement).value).toBe("dark");
  });

  it("debounce edilen kayıtları aynı anda çalıştırmadan en son değerle serileştirir", async () => {
    vi.useFakeTimers();
    const releases: Array<() => void> = [];
    const starts: number[] = [];
    const writer = new DebouncedSerialWriter<number>(async (value) => {
      starts.push(value);
      await new Promise<void>((resolve) => releases.push(resolve));
    }, 100);

    writer.schedule(1);
    writer.schedule(2);
    await vi.advanceTimersByTimeAsync(100);
    expect(starts).toEqual([2]);

    writer.schedule(3);
    await vi.advanceTimersByTimeAsync(100);
    expect(starts).toEqual([2]);
    releases.shift()?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(starts).toEqual([2, 3]);
    releases.shift()?.();
    await writer.flush();
  });

  it("cancel pending reset öncesi eski form değerinin yazılmasını engeller", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => undefined);
    const writer = new DebouncedSerialWriter(save, 100);
    writer.schedule("stale");
    writer.cancel();
    await vi.advanceTimersByTimeAsync(100);
    await writer.flush();
    expect(save).not.toHaveBeenCalled();
  });

  it("change/blur normalizasyonunu forma geri yansıtıp storage değeriyle aynı tutar", () => {
    const form = createForm();
    populateSettingsForm(form, DEFAULT_SETTINGS);
    (form.elements.namedItem("delayMs") as HTMLInputElement).value = "99999";
    (form.elements.namedItem("fixedX") as HTMLInputElement).value = "-20";

    const normalized = normalizeSettingsForm(form);
    expect(normalized.delayMs).toBe(3000);
    expect(normalized.fixedPosition.xRatio).toBe(0);
    expect((form.elements.namedItem("delayMs") as HTMLInputElement).value).toBe("3000");
    expect((form.elements.namedItem("fixedX") as HTMLInputElement).value).toBe("0");
    expect(readSettingsForm(form)).toEqual(normalized);
  });

  it("yalnız YouTube video sekmesini kabul edip AI mesajını RuntimeMessage sözleşmesinde kurar", () => {
    expect(isYouTubeVideoUrl("https://www.youtube.com/watch?v=Abc_123-xYz")).toBe(true);
    expect(isYouTubeVideoUrl("https://www.youtube.com/shorts/Abc_123-xYz")).toBe(true);
    expect(isYouTubeVideoUrl("https://www.youtube.com/live/Abc_123-xYz")).toBe(true);
    expect(isYouTubeVideoUrl("https://m.youtube.com/watch?v=Abc_123-xYz")).toBe(false);
    expect(isYouTubeVideoUrl("https://music.youtube.com/watch?v=Abc_123-xYz")).toBe(false);
    expect(isYouTubeVideoUrl("https://youtu.be/Abc_123-xYz")).toBe(false);
    expect(isYouTubeVideoUrl("https://www.youtube.com/" )).toBe(false);
    expect(isYouTubeVideoUrl("https://example.com/watch?v=abc")).toBe(false);
    expect(readVideoTimeResponse({ videoTimeMs: 1250.5 })).toBe(1250.5);
    expect(readVideoTimeResponse({ videoTimeMs: Number.NaN })).toBeNull();
    expect(createStartAiCaptureMessage(DEFAULT_SETTINGS, 42, 1250.5)).toEqual({
      type: "START_AI_CAPTURE",
      tabId: 42,
      sourceLanguage: "en",
      targetLanguage: DEFAULT_SETTINGS.targetLanguage,
      videoTimeMs: 1250.5
    });
  });
});
