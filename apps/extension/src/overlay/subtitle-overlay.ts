import type { BilingualCue } from "@focapt/contracts/captions";
import type { UserSettings } from "@focapt/contracts/settings";
import { OVERLAY_LAYOUT_EVENT } from "./position-controller";

const TAG_NAME = "focapt-subtitle-overlay";

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/**
 * Render inside a positioned parent whose top-left matches PositionController's video-local origin.
 * The host covers that parent and intentionally does not alter parent/video positioning styles.
 */
export class FocaptSubtitleOverlay extends HTMLElement {
  private readonly box: HTMLElement;
  private readonly source: HTMLElement;
  private readonly translation: HTMLElement;
  private hasContent = false;
  private positionVisible = true;
  private cancelLayoutNotification: (() => void) | undefined;
  private layoutRevision = 0;
  private destroyed = false;

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>
      :host {
        position: absolute;
        inset: 0;
        z-index: 2147483646;
        display: block;
        pointer-events: none;
        contain: layout style;
      }

      [data-box] {
        position: absolute;
        box-sizing: border-box;
        max-inline-size: min(82%, 45rem);
        max-block-size: 100%;
        overflow: hidden;
        padding: var(--box-padding);
        border-radius: var(--box-radius);
        background: color-mix(
          in srgb,
          var(--box-bg) var(--box-opacity-percent),
          transparent
        );
        color: var(--source-color);
        text-align: center;
        line-height: 1.25;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        word-break: normal;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      [data-source],
      [data-translation] {
        unicode-bidi: plaintext;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }

      [data-source] {
        color: var(--source-color);
        font-size: var(--source-size);
        font-weight: var(--source-weight);
      }

      [data-translation] {
        margin-block-start: var(--line-gap);
        color: var(--translation-color);
        font-size: var(--translation-size);
        font-weight: var(--translation-weight);
      }

      [hidden] {
        display: none !important;
      }

      @media (prefers-reduced-motion: reduce) {
        [data-box] {
          animation: none !important;
          transition: none !important;
        }
      }
    </style>
    <div data-box hidden aria-hidden="true">
      <div data-source dir="auto"></div>
      <div data-translation dir="auto"></div>
    </div>`;

    this.box = root.querySelector<HTMLElement>("[data-box]")!;
    this.source = root.querySelector<HTMLElement>("[data-source]")!;
    this.translation = root.querySelector<HTMLElement>("[data-translation]")!;
    this.syncVisibility();
  }

  setCue(cue: BilingualCue | null): void {
    this.box.removeAttribute("role");
    this.box.removeAttribute("aria-live");
    this.box.removeAttribute("aria-atomic");
    this.source.textContent = cue?.text ?? "";
    this.translation.textContent = cue?.translatedText ?? "";
    this.hasContent = cue !== null;
    this.syncVisibility();
    this.scheduleLayoutNotification();
  }

  setStatus(text: string): void {
    this.box.setAttribute("role", "status");
    this.box.setAttribute("aria-live", "polite");
    this.box.setAttribute("aria-atomic", "true");
    this.source.textContent = text;
    this.translation.textContent = "";
    this.hasContent = true;
    this.syncVisibility();
    this.scheduleLayoutNotification();
  }

  setPosition(x: number, y: number): void {
    this.box.style.transform = `translate(${finiteOrZero(x)}px, ${finiteOrZero(y)}px)`;
  }

  setVisible(visible: boolean): void {
    this.positionVisible = visible;
    this.syncVisibility();
  }

  applySettings(value: UserSettings): void {
    const style = this.style;
    style.setProperty("--source-color", value.sourceStyle.color);
    style.setProperty("--source-size", `${value.sourceStyle.fontSizePx}px`);
    style.setProperty("--source-weight", String(value.sourceStyle.fontWeight));
    style.setProperty("--translation-color", value.translationStyle.color);
    style.setProperty("--translation-size", `${value.translationStyle.fontSizePx}px`);
    style.setProperty("--translation-weight", String(value.translationStyle.fontWeight));
    style.setProperty("--box-bg", value.box.backgroundColor);
    style.setProperty("--box-opacity", String(value.box.opacity));
    style.setProperty("--box-opacity-percent", `${value.box.opacity * 100}%`);
    style.setProperty("--box-padding", `${value.box.paddingPx}px`);
    style.setProperty("--box-radius", `${value.box.radiusPx}px`);
    style.setProperty("--line-gap", `${value.box.lineGapPx}px`);
    this.dataset.mode = value.positionMode;
    this.scheduleLayoutNotification();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.layoutRevision += 1;
    this.cancelLayoutNotification?.();
    this.cancelLayoutNotification = undefined;
    this.remove();
  }

  private scheduleLayoutNotification(): void {
    if (this.destroyed || this.cancelLayoutNotification) return;
    const revision = this.layoutRevision;
    const notify = (): void => {
      this.cancelLayoutNotification = undefined;
      if (this.destroyed || revision !== this.layoutRevision) return;
      this.dispatchEvent(
        new CustomEvent(OVERLAY_LAYOUT_EVENT, { bubbles: true, composed: true })
      );
    };

    if (
      typeof globalThis.requestAnimationFrame === "function" &&
      typeof globalThis.cancelAnimationFrame === "function"
    ) {
      let completedSynchronously = false;
      const cancelFrame = globalThis.cancelAnimationFrame.bind(globalThis);
      const handle = globalThis.requestAnimationFrame(() => {
        completedSynchronously = true;
        notify();
      });
      this.cancelLayoutNotification = completedSynchronously
        ? undefined
        : () => cancelFrame(handle);
      return;
    }

    const handle = globalThis.setTimeout(notify, 0);
    this.cancelLayoutNotification = () => globalThis.clearTimeout(handle);
  }

  private syncVisibility(): void {
    this.box.hidden = !this.hasContent;
    this.box.style.visibility = this.positionVisible ? "visible" : "hidden";
    this.style.visibility = this.positionVisible ? "visible" : "hidden";
    const ariaHidden = String(!this.hasContent || !this.positionVisible);
    this.box.setAttribute("aria-hidden", ariaHidden);
    this.setAttribute("aria-hidden", ariaHidden);
  }
}

if (typeof customElements !== "undefined" && !customElements.get(TAG_NAME)) {
  customElements.define(TAG_NAME, FocaptSubtitleOverlay);
}
