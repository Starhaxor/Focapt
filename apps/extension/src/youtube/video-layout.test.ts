// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import {
  calculateRenderedVideoRect,
  VideoLayoutController,
  type LayoutResizeObserverFactory
} from "./video-layout";

describe("calculateRenderedVideoRect", () => {
  it("contain dikey videoda pillarbox dışındaki gerçek içeriği döndürür", () => {
    expect(calculateRenderedVideoRect(
      { left: 100, top: 50, width: 1000, height: 562.5 },
      { width: 1080, height: 1920 },
      "contain"
    )).toEqual({ left: 441.796875, top: 50, width: 316.40625, height: 562.5 });
  });

  it("contain yatay videoda letterbox boşluğunu çıkarır", () => {
    expect(calculateRenderedVideoRect(
      { left: 20, top: 30, width: 1000, height: 1000 },
      { width: 1920, height: 1080 },
      "contain"
    )).toEqual({ left: 20, top: 248.75, width: 1000, height: 562.5 });
  });

  it.each(["cover", "fill"])("%s için görünür element kutusunu kullanır", (objectFit) => {
    const box = { left: 20, top: 30, width: 1000, height: 600 };
    expect(calculateRenderedVideoRect(box, { width: 1080, height: 1920 }, objectFit)).toEqual(box);
  });
});

describe("VideoLayoutController", () => {
  it("video/container resize ve metadata/window/fullscreen olaylarında bounds senkronlar, detach ile temizler", () => {
    const video = document.createElement("video");
    const container = document.createElement("div");
    Object.defineProperties(video, {
      videoWidth: { value: 1920, configurable: true },
      videoHeight: { value: 1080, configurable: true },
      getBoundingClientRect: { value: () => ({ left: 110, top: 70, width: 800, height: 600 }) }
    });
    Object.defineProperty(container, "getBoundingClientRect", {
      value: () => ({ left: 100, top: 50, width: 1000, height: 700 })
    });
    let notifyResize = (): void => undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    const resizeObserverFactory: LayoutResizeObserverFactory = (callback) => {
      notifyResize = callback;
      return { observe, disconnect };
    };
    const windowTarget = new EventTarget();
    const documentTarget = new EventTarget();
    const setBounds = vi.fn();
    const refresh = vi.fn();
    const controller = new VideoLayoutController(video, container, { setBounds, refresh }, {
      getObjectFit: () => "contain",
      resizeObserverFactory,
      windowTarget,
      documentTarget
    });

    controller.attach();
    expect(observe.mock.calls.map(([target]) => target)).toEqual([video, container]);
    expect(setBounds).toHaveBeenLastCalledWith({ left: 10, top: 95, width: 800, height: 450 });
    expect(controller.currentRect()).toEqual({ left: 110, top: 145, width: 800, height: 450 });

    notifyResize();
    video.dispatchEvent(new Event("loadedmetadata"));
    windowTarget.dispatchEvent(new Event("resize"));
    documentTarget.dispatchEvent(new Event("fullscreenchange"));
    expect(setBounds).toHaveBeenCalledTimes(5);
    expect(refresh).toHaveBeenCalledTimes(5);

    controller.detach();
    controller.detach();
    video.dispatchEvent(new Event("loadedmetadata"));
    windowTarget.dispatchEvent(new Event("resize"));
    documentTarget.dispatchEvent(new Event("fullscreenchange"));
    expect(setBounds).toHaveBeenCalledTimes(5);
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
