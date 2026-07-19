// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "@focapt/core/settings";
import { OVERLAY_LAYOUT_EVENT } from "./position-controller";
import { FocaptSubtitleOverlay } from "./subtitle-overlay";

async function observeAriaAndTextMutationOrder(
  element: FocaptSubtitleOverlay,
  action: () => void
): Promise<string[]> {
  const root = element.shadowRoot!;
  const source = root.querySelector("[data-source]");
  const translation = root.querySelector("[data-translation]");
  const records: MutationRecord[] = [];
  const observer = new MutationObserver((mutations) => records.push(...mutations));
  observer.observe(root, {
    subtree: true,
    attributes: true,
    attributeFilter: ["role", "aria-live", "aria-atomic"],
    childList: true,
    characterData: true
  });

  action();
  await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
  records.push(...observer.takeRecords());
  observer.disconnect();

  return records.map((record) => {
    if (record.type === "attributes") return `attribute:${record.attributeName}`;
    const owner = record.target.nodeType === Node.TEXT_NODE ? record.target.parentNode : record.target;
    if (owner === source) return "text:source";
    if (owner === translation) return "text:translation";
    return `text:${record.target.nodeName}`;
  });
}

describe("FocaptSubtitleOverlay", () => {
  beforeEach(() => document.body.replaceChildren());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("iki dili source ardından translation sırasıyla ve bağımsız CSS değişkenleriyle gösterir", () => {
    const element = new FocaptSubtitleOverlay();
    element.applySettings({
      ...DEFAULT_SETTINGS,
      sourceStyle: { color: "#ffffff", fontSizePx: 28, fontWeight: 700 },
      translationStyle: { color: "#ffd166", fontSizePx: 16, fontWeight: 400 }
    });
    element.setCue({
      id: "1",
      startMs: 0,
      endMs: 1000,
      text: "Hello",
      translatedText: "Merhaba"
    });

    const lines = element.shadowRoot?.querySelectorAll("[data-source], [data-translation]");
    expect([...lines!].map((line) => line.textContent)).toEqual(["Hello", "Merhaba"]);
    expect(element.style.getPropertyValue("--source-size")).toBe("28px");
    expect(element.style.getPropertyValue("--source-weight")).toBe("700");
    expect(element.style.getPropertyValue("--translation-size")).toBe("16px");
    expect(element.style.getPropertyValue("--translation-color")).toBe("#ffd166");
  });

  it("kutu ayarlarının tamamını CSS değişkenleriyle uygular", () => {
    const element = new FocaptSubtitleOverlay();
    element.applySettings({
      ...DEFAULT_SETTINGS,
      box: {
        backgroundColor: "#102030",
        opacity: 0.72,
        paddingPx: 14,
        radiusPx: 10,
        lineGapPx: 6
      }
    });

    expect(element.style.getPropertyValue("--box-bg")).toBe("#102030");
    expect(element.style.getPropertyValue("--box-opacity")).toBe("0.72");
    expect(element.style.getPropertyValue("--box-opacity-percent")).toBe("72%");
    expect(element.style.getPropertyValue("--box-padding")).toBe("14px");
    expect(element.style.getPropertyValue("--box-radius")).toBe("10px");
    expect(element.style.getPropertyValue("--line-gap")).toBe("6px");
  });

  it("kullanıcı metnini textContent ile XSS-safe tutar ve unicode/bidi metni değiştirmez", () => {
    const element = new FocaptSubtitleOverlay();
    const text = '<img src=x onerror="alert(1)"> שלום 👩🏽‍💻\nçok uzun satır';
    element.setCue({ id: "x", startMs: 0, endMs: 1, text, translatedText: "مرحبا 🌍" });

    expect(element.shadowRoot?.querySelector("[data-source]")?.textContent).toBe(text);
    expect(element.shadowRoot?.querySelector("[data-translation]")?.textContent).toBe("مرحبا 🌍");
    expect(element.shadowRoot?.querySelector("img")).toBeNull();
    expect(element.shadowRoot?.querySelector("[data-source]")?.getAttribute("dir")).toBe("auto");
    const css = element.shadowRoot?.querySelector("style")?.textContent ?? "";
    expect(css).toContain("overflow-wrap: anywhere");
    expect(css).toContain("unicode-bidi: plaintext");
    expect(css).toContain("prefers-reduced-motion: reduce");
  });

  it("host'u video-local origin için positioned parentı kaplayan mutasyonsuz katman olarak tanımlar", () => {
    const parent = document.createElement("div");
    parent.style.position = "relative";
    const element = new FocaptSubtitleOverlay();
    parent.append(element);
    const css = element.shadowRoot?.querySelector("style")?.textContent ?? "";

    expect(css).toMatch(/:host\s*\{[^}]*position:\s*absolute;/s);
    expect(css).toMatch(/:host\s*\{[^}]*inset:\s*0;/s);
    expect(parent.style.position).toBe("relative");
  });

  it("çok uzun ve çok satırlı cue'yu host yüksekliğinde tutup iki satırı da güvenli sarar", () => {
    const element = new FocaptSubtitleOverlay();
    const css = element.shadowRoot?.querySelector("style")?.textContent ?? "";

    expect(css).toMatch(/\[data-box\]\s*\{[^}]*max-block-size:\s*100%;/s);
    expect(css).toMatch(/\[data-box\]\s*\{[^}]*overflow:\s*hidden;/s);
    expect(css).toMatch(
      /\[data-source\],\s*\[data-translation\]\s*\{[^}]*overflow-wrap:\s*anywhere;/s
    );
    expect(css).toMatch(
      /\[data-source\],\s*\[data-translation\]\s*\{[^}]*white-space:\s*pre-wrap;/s
    );
  });

  it("içerik ve konum görünürlüğünü hidden ile aria-hidden semantiğinde birleştirir", () => {
    const element = new FocaptSubtitleOverlay();
    const box = element.shadowRoot?.querySelector<HTMLElement>("[data-box]");
    expect(box?.hidden).toBe(true);
    expect(box?.getAttribute("aria-hidden")).toBe("true");

    element.setCue({ id: "1", startMs: 0, endMs: 1, text: "One", translatedText: "Bir" });
    expect(box?.hidden).toBe(false);
    expect(box?.getAttribute("aria-hidden")).toBe("false");

    element.setVisible(false);
    expect(box?.style.visibility).toBe("hidden");
    expect(element.style.visibility).toBe("hidden");
    expect(element.getAttribute("aria-hidden")).toBe("true");
    expect(box?.getAttribute("aria-hidden")).toBe("true");

    element.setVisible(true);
    element.setCue(null);
    expect(box?.hidden).toBe(true);
    expect(element.getAttribute("aria-hidden")).toBe("true");
    expect(box?.getAttribute("aria-hidden")).toBe("true");
  });

  it("setStatus yalnız upstream locale metnini aynen gösterir", () => {
    const element = new FocaptSubtitleOverlay();
    const box = element.shadowRoot?.querySelector<HTMLElement>("[data-box]");
    element.setCue({ id: "1", startMs: 0, endMs: 1, text: "Hello", translatedText: "Merhaba" });
    expect(box?.hasAttribute("role")).toBe(false);
    expect(box?.hasAttribute("aria-live")).toBe(false);

    element.setStatus("Çeviri hazırlanıyor…");

    expect(element.shadowRoot?.querySelector("[data-source]")?.textContent).toBe("Çeviri hazırlanıyor…");
    expect(element.shadowRoot?.querySelector("[data-translation]")?.textContent).toBe("");
    expect(box?.getAttribute("role")).toBe("status");
    expect(box?.getAttribute("aria-live")).toBe("polite");
    expect(box?.getAttribute("aria-atomic")).toBe("true");

    element.setCue({ id: "2", startMs: 1, endMs: 2, text: "Next", translatedText: "Sonraki" });
    expect(box?.hasAttribute("role")).toBe(false);
    expect(box?.hasAttribute("aria-live")).toBe(false);
    expect(box?.hasAttribute("aria-atomic")).toBe(false);
  });

  it("setStatus live-region özniteliklerini metin mutasyonlarından önce kurar", async () => {
    const element = new FocaptSubtitleOverlay();
    element.setCue({ id: "1", startMs: 0, endMs: 1, text: "Hello", translatedText: "Merhaba" });

    const order = await observeAriaAndTextMutationOrder(element, () =>
      element.setStatus("Çeviri hazırlanıyor…")
    );
    const firstText = order.findIndex((entry) => entry.startsWith("text:"));

    expect(order.indexOf("attribute:role")).toBeLessThan(firstText);
    expect(order.indexOf("attribute:aria-live")).toBeLessThan(firstText);
    expect(order.indexOf("attribute:aria-atomic")).toBeLessThan(firstText);
  });

  it("setCue live-region özniteliklerini metin mutasyonlarından önce kaldırır", async () => {
    const element = new FocaptSubtitleOverlay();
    element.setStatus("Çeviri hazırlanıyor…");

    const order = await observeAriaAndTextMutationOrder(element, () =>
      element.setCue({ id: "2", startMs: 1, endMs: 2, text: "Next", translatedText: "Sonraki" })
    );
    const firstText = order.findIndex((entry) => entry.startsWith("text:"));

    expect(order.indexOf("attribute:role")).toBeLessThan(firstText);
    expect(order.indexOf("attribute:aria-live")).toBeLessThan(firstText);
    expect(order.indexOf("attribute:aria-atomic")).toBeLessThan(firstText);
  });

  it("cue ve stil değişimlerini tek frame'de bubbling composed layout event olarak bildirir", () => {
    let callback: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", (next: FrameRequestCallback) => {
      callback = next;
      return 41;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const parent = document.createElement("div");
    const element = new FocaptSubtitleOverlay();
    parent.append(element);
    const events: Event[] = [];
    parent.addEventListener(OVERLAY_LAYOUT_EVENT, (event) => events.push(event));

    element.setCue({ id: "1", startMs: 0, endMs: 1, text: "Hello", translatedText: "Merhaba" });
    element.applySettings(DEFAULT_SETTINGS);
    expect(events).toHaveLength(0);
    callback?.(0);

    expect(events).toHaveLength(1);
    expect(events[0]?.bubbles).toBe(true);
    expect(events[0]?.composed).toBe(true);
  });

  it("requestAnimationFrame yoksa layout event için güvenli timer fallback kullanır", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", undefined);
    vi.stubGlobal("cancelAnimationFrame", undefined);
    const element = new FocaptSubtitleOverlay();
    const listener = vi.fn();
    element.addEventListener(OVERLAY_LAYOUT_EVENT, listener);

    element.setStatus("Hazırlanıyor");
    expect(listener).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(listener).toHaveBeenCalledOnce();
  });

  it("destroy pending layout frame'ini iptal eder ve stale bildirimi etkisiz bırakır", () => {
    let callback: FrameRequestCallback | undefined;
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal("requestAnimationFrame", (next: FrameRequestCallback) => {
      callback = next;
      return 73;
    });
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);
    const element = new FocaptSubtitleOverlay();
    const listener = vi.fn();
    element.addEventListener(OVERLAY_LAYOUT_EVENT, listener);
    element.setCue({ id: "1", startMs: 0, endMs: 1, text: "A", translatedText: "B" });

    element.destroy();
    callback?.(0);
    element.destroy();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(73);
    expect(listener).not.toHaveBeenCalled();
  });

  it("konumu sonlu değerlere indirger, destroy çağrısını idempotent tutar ve kayıt guard'ını korur", () => {
    const element = new FocaptSubtitleOverlay();
    document.body.append(element);
    element.setPosition(Number.NaN, Number.POSITIVE_INFINITY);
    expect(element.shadowRoot?.querySelector<HTMLElement>("[data-box]")?.style.transform).toBe(
      "translate(0px, 0px)"
    );

    expect(customElements.get("focapt-subtitle-overlay")).toBe(FocaptSubtitleOverlay);
    element.destroy();
    element.destroy();
    expect(element.isConnected).toBe(false);
  });

  it("PositionController için host yerine görünür altyazı kutusunu ölçer", () => {
    const element = new FocaptSubtitleOverlay();
    const box = element.shadowRoot!.querySelector<HTMLElement>("[data-box]")!;
    vi.spyOn(box, "getBoundingClientRect").mockReturnValue({
      width: 284,
      height: 72
    } as DOMRect);

    expect(element.getContentSize()).toEqual({ width: 284, height: 72 });
  });

  it("host boundsunu rendered video alanına sonlu inline değerlerle hizalar", () => {
    const element = new FocaptSubtitleOverlay();
    element.setBounds({ left: 18, top: 24, width: 640, height: 360 });
    expect(element.style.inset).toBe("auto");
    expect(element.style.left).toBe("18px");
    expect(element.style.top).toBe("24px");
    expect(element.style.width).toBe("640px");
    expect(element.style.height).toBe("360px");

    element.setBounds({ left: Number.NaN, top: 0, width: Number.POSITIVE_INFINITY, height: -1 });
    expect(element.style.left).toBe("0px");
    expect(element.style.width).toBe("0px");
    expect(element.style.height).toBe("0px");
  });
});
