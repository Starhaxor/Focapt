// @vitest-environment happy-dom

import type { LanguageOption } from "@focapt/contracts/captions";
import { DEFAULT_SETTINGS } from "@focapt/core/settings";
import { afterEach, describe, expect, it, vi } from "vitest";
import { YouTubePlayerPanel } from "./player-panel";

const catalog: LanguageOption[] = [
  { languageCode: "en", label: "English" },
  { languageCode: "tr", label: "Türkçe" }
];

const messages: Record<string, string> = {
  appName: "Focapt",
  preferences: "controls",
  subtitlesEnabled: "Show subtitles",
  sourceLanguage: "Learning language",
  targetLanguage: "Native language",
  positionMode: "Mode",
  fixed: "Fixed",
  moving: "Follow pointer",
  delayed: "Delayed pointer",
  theme: "Appearance",
  themeSystem: "Use system setting",
  themeLight: "Light",
  themeDark: "Dark",
  languageUnavailable: "Unavailable"
};
const controllers: YouTubePlayerPanel[] = [];

function createPlayer(): HTMLElement {
  const player = document.createElement("div");
  player.id = "movie_player";
  player.innerHTML = '<video></video><div class="ytp-right-controls"></div>';
  document.body.append(player);
  return player;
}

function createPanel(onSettingsChange = vi.fn()) {
  const controller = new YouTubePlayerPanel(document, {
    onSettingsChange,
    translate: (key) => messages[key] ?? key
  });
  controllers.push(controller);
  return controller;
}

function shadowPanel(player: HTMLElement): HTMLElement {
  const host = player.querySelector<HTMLElement>("[data-focapt-panel-host]");
  const panel = host?.shadowRoot?.querySelector<HTMLElement>("[data-panel]");
  if (!panel) throw new Error("Focapt panel not found");
  return panel;
}

afterEach(() => {
  while (controllers.length > 0) controllers.pop()?.detach();
  document.body.replaceChildren();
});

describe("YouTubePlayerPanel", () => {
  it("attaches one accessible native control and dismisses its dialog with Escape", () => {
    const player = createPlayer();
    const controller = createPanel();
    controller.update(DEFAULT_SETTINGS, catalog, "Ready");

    controller.attach(player);
    controller.attach(player);

    expect(player.querySelectorAll("[data-focapt-button]")).toHaveLength(1);
    expect(player.querySelectorAll("[data-focapt-panel-host]")).toHaveLength(1);
    const button = player.querySelector<HTMLButtonElement>("[data-focapt-button]")!;
    const panel = shadowPanel(player);
    expect(button).toMatchObject({ type: "button" });
    expect(button.classList.contains("ytp-button")).toBe(true);
    expect(button.getAttribute("aria-label")).toBe("Focapt controls");
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.dataset.focaptEnabled).toBe("true");
    expect(button.querySelector("svg")?.getAttribute("fill")).toBe("currentColor");
    expect(panel.getAttribute("role")).toBe("dialog");
    expect(panel.hidden).toBe(true);

    button.click();
    expect(panel.hidden).toBe(false);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(panel.hidden).toBe(true);
    expect(button.getAttribute("aria-expanded")).toBe("false");

    controller.detach();
    expect(player.querySelector("[data-focapt-button]")).toBeNull();
    expect(player.querySelector("[data-focapt-panel-host]")).toBeNull();
  });

  it("reattaches without duplicates after YouTube reconstructs its controls", () => {
    const player = createPlayer();
    const controller = createPanel();
    controller.attach(player);
    player.querySelector<HTMLButtonElement>("[data-focapt-button]")!.click();
    expect(shadowPanel(player).hidden).toBe(false);

    player.querySelector(".ytp-right-controls")?.remove();
    const replacement = document.createElement("div");
    replacement.className = "ytp-right-controls";
    player.append(replacement);
    controller.attach(player);

    expect(player.querySelectorAll("[data-focapt-button]")).toHaveLength(1);
    expect(player.querySelectorAll("[data-focapt-panel-host]")).toHaveLength(1);
    expect(shadowPanel(player).hidden).toBe(true);
    expect(player.querySelector("[data-focapt-button]")?.getAttribute("aria-expanded")).toBe("false");
    controller.detach();
  });

  it("contains composed panel interactions so YouTube cannot treat them as player commands", () => {
    const player = createPlayer();
    const controller = createPanel();
    controller.attach(player);
    player.querySelector<HTMLButtonElement>("[data-focapt-button]")!.click();

    const onClick = vi.fn();
    const onPointer = vi.fn();
    const onKey = vi.fn();
    player.addEventListener("click", onClick);
    player.addEventListener("pointerdown", onPointer);
    player.addEventListener("keydown", onKey);
    const source = player.querySelector<HTMLElement>("[data-focapt-panel-host]")!
      .shadowRoot!.querySelector<HTMLSelectElement>('[name="sourceLanguage"]')!;

    source.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    source.dispatchEvent(new Event("pointerdown", { bubbles: true, composed: true }));
    source.dispatchEvent(new KeyboardEvent("keydown", {
      key: "ArrowDown",
      bubbles: true,
      composed: true
    }));
    source.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      composed: true
    }));

    expect(onClick).not.toHaveBeenCalled();
    expect(onPointer).not.toHaveBeenCalled();
    expect(onKey).not.toHaveBeenCalled();
    expect(shadowPanel(player).hidden).toBe(true);
    controller.detach();
  });

  it("renders current settings, catalog, theme and status, then emits a normalized change", () => {
    const player = createPlayer();
    const onSettingsChange = vi.fn();
    const controller = createPanel(onSettingsChange);
    const settings = {
      ...DEFAULT_SETTINGS,
      enabled: false,
      theme: "dark" as const,
      sourceLanguage: "tr",
      targetLanguage: "en",
      positionMode: "moving" as const
    };

    controller.attach(player);
    controller.update(settings, catalog, "Bilingual captions are ready");

    const host = player.querySelector<HTMLElement>("[data-focapt-panel-host]")!;
    const root = host.shadowRoot!;
    expect(host.dataset.theme).toBe("dark");
    const button = player.querySelector<HTMLButtonElement>("[data-focapt-button]")!;
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.dataset.focaptEnabled).toBe("false");
    expect(button.style.opacity).toBe("0.5");
    expect((root.querySelector('[name="enabled"]') as HTMLInputElement).checked).toBe(false);
    expect((root.querySelector('[name="sourceLanguage"]') as HTMLSelectElement).value).toBe("tr");
    expect((root.querySelector('[name="targetLanguage"]') as HTMLSelectElement).value).toBe("en");
    expect((root.querySelector('[name="positionMode"]') as HTMLSelectElement).value).toBe("moving");
    expect(root.querySelector("output")?.textContent).toBe("Bilingual captions are ready");
    expect(root.querySelector('[data-i18n="sourceLanguage"]')?.textContent).toBe("Learning language");

    const enabled = root.querySelector('[name="enabled"]') as HTMLInputElement;
    enabled.checked = true;
    enabled.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onSettingsChange).toHaveBeenCalledWith({ ...settings, enabled: true });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.dataset.focaptEnabled).toBe("true");
    expect(button.style.opacity).toBe("1");
    controller.detach();
  });

  it("dismisses on an outside pointer and follows full player replacement", async () => {
    const firstPlayer = createPlayer();
    const controller = createPanel();
    controller.attach(firstPlayer);
    firstPlayer.querySelector<HTMLButtonElement>("[data-focapt-button]")!.click();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(shadowPanel(firstPlayer).hidden).toBe(true);

    const replacement = document.createElement("div");
    replacement.id = "movie_player";
    replacement.innerHTML = '<video></video><div class="ytp-right-controls"></div>';
    firstPlayer.replaceWith(replacement);

    await vi.waitFor(() => {
      expect(replacement.querySelectorAll("[data-focapt-button]")).toHaveLength(1);
      expect(replacement.querySelectorAll("[data-focapt-panel-host]")).toHaveLength(1);
    });
    expect(firstPlayer.querySelector("[data-focapt-button]")).toBeNull();
    controller.detach();
  });
});
