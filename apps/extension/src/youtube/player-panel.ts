import type { LanguageOption } from "@focapt/contracts/captions";
import type { UserSettings } from "@focapt/contracts/settings";
import { normalizeSettings } from "@focapt/core/settings";
import { populateLanguageSelect } from "../popup/language-options";
import { applyTheme, resolveTheme } from "../theme/theme";

interface YouTubePlayerPanelOptions {
  onSettingsChange(settings: UserSettings): void | Promise<void>;
  translate?: (key: string) => string;
}

const PANEL_STYLES = `
  :host {
    --focapt-surface: #fff;
    --focapt-text: #0f0f0f;
    --focapt-muted: #606060;
    --focapt-border: rgb(0 0 0 / 14%);
    --focapt-field: #f8f8f8;
    --focapt-focus: #065fd4;
    position: absolute;
    inset: auto 12px 56px auto;
    z-index: 2147483646;
    inline-size: min(320px, calc(100% - 24px));
    max-inline-size: 320px;
    color: var(--focapt-text);
    font: 500 12px/1.4 Roboto, Arial, sans-serif;
    text-align: start;
  }

  :host([data-theme="dark"]) {
    --focapt-surface: #212121;
    --focapt-text: #fff;
    --focapt-muted: #aaa;
    --focapt-border: rgb(255 255 255 / 18%);
    --focapt-field: #181818;
    --focapt-focus: #3ea6ff;
  }

  [data-panel] {
    display: grid;
    gap: 10px;
    box-sizing: border-box;
    margin: 0;
    padding: 12px;
    border: 1px solid var(--focapt-border);
    border-radius: 10px;
    background: var(--focapt-surface);
    box-shadow: 0 8px 28px rgb(0 0 0 / 30%);
  }

  [data-panel][hidden] {
    display: none;
  }

  label {
    display: grid;
    gap: 5px;
    min-inline-size: 0;
    color: var(--focapt-muted);
  }

  label:first-of-type {
    grid-template-columns: auto 1fr;
    align-items: center;
    color: var(--focapt-text);
  }

  input,
  select {
    box-sizing: border-box;
    min-block-size: 32px;
    margin: 0;
    border: 1px solid var(--focapt-border);
    border-radius: 4px;
    color: var(--focapt-text);
    background: var(--focapt-field);
    font: inherit;
  }

  input[type="checkbox"] {
    inline-size: 16px;
    min-block-size: 16px;
    accent-color: var(--focapt-focus);
  }

  select {
    inline-size: 100%;
    padding: 5px 28px 5px 8px;
  }

  input:focus-visible,
  select:focus-visible {
    outline: 2px solid var(--focapt-focus);
    outline-offset: 2px;
  }

  output {
    min-block-size: 1.4em;
    color: var(--focapt-muted);
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      transition-duration: 0.01ms !important;
      animation-duration: 0.01ms !important;
    }
  }
`;

const BUTTON_MARK = `
  <svg aria-hidden="true" focusable="false" fill="currentColor" viewBox="0 0 36 36">
    <path d="M9 8h18a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V11a3 3 0 0 1 3-3Zm0 2a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V11a1 1 0 0 0-1-1H9Zm4 4h10v2h-7v2h6v2h-6v4h-3V14Z"/>
  </svg>
`;

export class YouTubePlayerPanel {
  private readonly host: HTMLElement;
  private readonly shadow: ShadowRoot;
  private readonly panel: HTMLElement;
  private readonly translate: (key: string) => string;
  private settings = normalizeSettings(undefined);
  private catalog: readonly LanguageOption[] = [];
  private status = "";
  private player: HTMLElement | undefined;
  private button: HTMLButtonElement | undefined;
  private observer: MutationObserver | undefined;
  private listening = false;
  private reattachScheduled = false;

  constructor(
    private readonly root: Document,
    private readonly options: YouTubePlayerPanelOptions
  ) {
    this.translate = options.translate ?? ((key) => key);
    this.host = root.createElement("div");
    this.host.dataset.focaptPanelHost = "";
    this.shadow = this.host.attachShadow({ mode: "open" });
    this.shadow.innerHTML = `
      <style>${PANEL_STYLES}</style>
      <section role="dialog" aria-label="Focapt" data-panel hidden>
        <label><input name="enabled" type="checkbox"><span data-i18n="subtitlesEnabled"></span></label>
        <label><span data-i18n="sourceLanguage"></span><select name="sourceLanguage"></select></label>
        <label><span data-i18n="targetLanguage"></span><select name="targetLanguage"></select></label>
        <label><span data-i18n="positionMode"></span><select name="positionMode"></select></label>
        <label><span data-i18n="theme"></span><select name="theme"></select></label>
        <output role="status" aria-live="polite"></output>
      </section>
    `;
    const panel = this.shadow.querySelector<HTMLElement>("[data-panel]");
    if (!panel) throw new Error("FOCAPT_PLAYER_PANEL_UNAVAILABLE");
    this.panel = panel;
    this.shadow.addEventListener("click", this.stopPanelEvent);
    this.shadow.addEventListener("pointerdown", this.stopPanelEvent);
    this.shadow.addEventListener("keydown", this.onPanelKeyDown);
    this.shadow.addEventListener("change", this.onControlChange);
    this.render();
  }

  attach(player: HTMLElement): void {
    if (this.player && this.player !== player) {
      this.button?.remove();
      this.host.remove();
      this.button = undefined;
    }
    this.player = player;

    for (const host of player.querySelectorAll<HTMLElement>("[data-focapt-panel-host]")) {
      if (host !== this.host) host.remove();
    }
    if (this.host.parentElement !== player) player.append(this.host);

    const controls = player.querySelector<HTMLElement>(".ytp-right-controls");
    if (this.button && (!this.button.isConnected || this.button.parentElement !== controls)) {
      this.close(false);
      this.button.remove();
      this.button = undefined;
    }
    for (const button of player.querySelectorAll<HTMLElement>("[data-focapt-button]")) {
      if (button !== this.button) button.remove();
    }
    if (controls && !this.button) {
      this.button = this.createButton();
      controls.prepend(this.button);
      this.renderButtonState();
    }

    if (!this.listening) {
      this.root.addEventListener("keydown", this.onKeyDown);
      this.root.addEventListener("pointerdown", this.onOutsidePointer);
      this.listening = true;
    }
    if (!this.observer) {
      const Observer = this.root.defaultView?.MutationObserver ?? MutationObserver;
      this.observer = new Observer(this.scheduleReattach);
      this.observer.observe(this.root.documentElement, { childList: true, subtree: true });
    }
  }

  update(
    settings: UserSettings,
    catalog: readonly LanguageOption[],
    status: string
  ): void {
    this.settings = normalizeSettings(settings);
    this.catalog = catalog.map((option) => ({ ...option }));
    this.status = status;
    this.render();
  }

  detach(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    this.reattachScheduled = false;
    if (this.listening) {
      this.root.removeEventListener("keydown", this.onKeyDown);
      this.root.removeEventListener("pointerdown", this.onOutsidePointer);
      this.listening = false;
    }
    this.close(false);
    this.button?.remove();
    this.host.remove();
    this.button = undefined;
    this.player = undefined;
  }

  private createButton(): HTMLButtonElement {
    const button = this.root.createElement("button");
    button.type = "button";
    button.className = "ytp-button";
    button.dataset.focaptButton = "";
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", this.buttonLabel());
    button.title = this.buttonLabel();
    button.innerHTML = BUTTON_MARK;
    button.addEventListener("click", this.onButtonClick);
    return button;
  }

  private buttonLabel(): string {
    return `${this.translate("appName")} ${this.translate("preferences")}`;
  }

  private render(): void {
    const media = this.root.defaultView?.matchMedia?.("(prefers-color-scheme: dark)")
      ?? { matches: false };
    applyTheme(this.host, resolveTheme(this.settings.theme, media));
    this.button?.setAttribute("aria-label", this.buttonLabel());
    if (this.button) this.button.title = this.buttonLabel();
    this.renderButtonState();
    this.panel.setAttribute("aria-label", this.translate("appName"));

    for (const element of this.shadow.querySelectorAll<HTMLElement>("[data-i18n]")) {
      element.textContent = this.translate(element.dataset.i18n ?? "");
    }

    const enabled = this.control<HTMLInputElement>("enabled");
    enabled.checked = this.settings.enabled;
    populateLanguageSelect(
      this.control<HTMLSelectElement>("sourceLanguage"),
      this.catalog,
      this.settings.sourceLanguage,
      { unavailableLabel: this.translate("languageUnavailable") }
    );
    populateLanguageSelect(
      this.control<HTMLSelectElement>("targetLanguage"),
      this.catalog,
      this.settings.targetLanguage,
      { unavailableLabel: this.translate("languageUnavailable") }
    );
    this.populateSelect("positionMode", ["fixed", "moving", "delayed"]);
    this.populateSelect("theme", ["system", "light", "dark"], "theme");
    this.control<HTMLSelectElement>("positionMode").value = this.settings.positionMode;
    this.control<HTMLSelectElement>("theme").value = this.settings.theme;
    const output = this.shadow.querySelector<HTMLOutputElement>("output");
    if (output) output.textContent = this.status;
  }

  private populateSelect(name: string, values: readonly string[], prefix = ""): void {
    const select = this.control<HTMLSelectElement>(name);
    const options = values.map((value) => {
      const option = this.root.createElement("option");
      option.value = value;
      option.text = this.translate(`${prefix}${prefix ? value[0]?.toUpperCase() : ""}${prefix ? value.slice(1) : value}`);
      return option;
    });
    select.replaceChildren(...options);
  }

  private renderButtonState(): void {
    if (!this.button) return;
    const enabled = String(this.settings.enabled);
    this.button.dataset.focaptEnabled = enabled;
    this.button.setAttribute("aria-pressed", enabled);
    this.button.style.opacity = this.settings.enabled ? "1" : "0.5";
    this.button.style.color = this.settings.enabled
      ? "var(--yt-spec-static-brand-red, #ff0033)"
      : "";
  }

  private control<T extends HTMLInputElement | HTMLSelectElement>(name: string): T {
    const control = this.shadow.querySelector<T>(`[name="${name}"]`);
    if (!control) throw new Error(`FOCAPT_PLAYER_CONTROL_UNAVAILABLE:${name}`);
    return control;
  }

  private readonly onButtonClick = (event: MouseEvent): void => {
    event.stopPropagation();
    if (this.panel.hidden) {
      this.panel.hidden = false;
      this.button?.setAttribute("aria-expanded", "true");
      this.control<HTMLInputElement>("enabled").focus();
    } else {
      this.close(false);
    }
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && !this.panel.hidden) this.close(true);
  };

  private readonly onPanelKeyDown = (event: Event): void => {
    event.stopPropagation();
    if (event instanceof KeyboardEvent && event.key === "Escape" && !this.panel.hidden) {
      this.close(true);
    }
  };

  private readonly stopPanelEvent = (event: Event): void => {
    event.stopPropagation();
  };

  private readonly onOutsidePointer = (event: Event): void => {
    if (this.panel.hidden) return;
    const target = event.target;
    const NodeType = this.root.defaultView?.Node;
    if (!NodeType || !(target instanceof NodeType)) return;
    if (this.host.contains(target) || this.button?.contains(target)) return;
    this.close(false);
  };

  private readonly onControlChange = (event: Event): void => {
    event.stopPropagation();
    const target = event.target;
    const view = this.root.defaultView;
    if (!view || (!(target instanceof view.HTMLInputElement) && !(target instanceof view.HTMLSelectElement))) {
      return;
    }
    const name = target.name as keyof Pick<
      UserSettings,
      "enabled" | "sourceLanguage" | "targetLanguage" | "positionMode" | "theme"
    >;
    if (!["enabled", "sourceLanguage", "targetLanguage", "positionMode", "theme"].includes(name)) {
      return;
    }
    const value = target instanceof view.HTMLInputElement ? target.checked : target.value;
    const next = normalizeSettings({ ...this.settings, [name]: value });
    this.settings = next;
    this.render();
    void Promise.resolve(this.options.onSettingsChange(next)).catch(() => undefined);
  };

  private close(restoreFocus: boolean): void {
    this.panel.hidden = true;
    this.button?.setAttribute("aria-expanded", "false");
    if (restoreFocus) this.button?.focus();
  }

  private readonly scheduleReattach = (): void => {
    if (this.reattachScheduled || !this.player) return;
    this.reattachScheduled = true;
    queueMicrotask(() => {
      this.reattachScheduled = false;
      if (!this.player) return;
      const candidate = this.root.querySelector("#movie_player");
      const ElementType = this.root.defaultView?.HTMLElement;
      if (ElementType && candidate instanceof ElementType) this.attach(candidate);
    });
  };
}
