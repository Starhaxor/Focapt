// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "@focapt/core/settings";
import {
  PositionController,
  type AnimationFrameScheduler,
  type OverlayPositionView,
  type RectProvider,
  type ResizeObserverFactory,
  type SizeProvider
} from "./position-controller";

const OVERLAY_LAYOUT_EVENT = "focapt-overlay-layout";

class ControlledFrames implements AnimationFrameScheduler {
  private nextId = 1;
  private callbacks = new Map<number, FrameRequestCallback>();
  readonly cancelled: number[] = [];

  request(callback: FrameRequestCallback): number {
    const id = this.nextId++;
    this.callbacks.set(id, callback);
    return id;
  }

  cancel(handle: unknown): void {
    if (typeof handle !== "number") return;
    this.cancelled.push(handle);
    this.callbacks.delete(handle);
  }

  flush(): void {
    const pending = [...this.callbacks.entries()];
    this.callbacks.clear();
    for (const [, callback] of pending) callback(0);
  }
}

function setup(
  videoRect: RectProvider = () => ({ left: 100, top: 50, width: 1000, height: 720 }),
  overlayRect: SizeProvider = () => ({ width: 300, height: 100 }),
  options: { target?: EventTarget; resizeObserverFactory?: ResizeObserverFactory } = {}
) {
  const target = options.target ?? new EventTarget();
  const moves: Array<{ x: number; y: number }> = [];
  const states: boolean[] = [];
  const view: OverlayPositionView = {
    move: (x, y) => moves.push({ x, y }),
    setVisible: (visible) => states.push(visible),
    saveFixed: vi.fn()
  };
  const frames = new ControlledFrames();
  const controller = new PositionController(
    target,
    videoRect,
    overlayRect,
    view,
    frames,
    options.resizeObserverFactory
  );
  return { controller, frames, moves, states, target };
}

afterEach(() => vi.useRealTimers());

describe("PositionController", () => {
  it("fixed modu attach ve setMode sırasında oranlardan görünür konuma taşır", () => {
    const { controller, moves, states } = setup();
    controller.setMode({
      ...DEFAULT_SETTINGS,
      positionMode: "fixed",
      fixedPosition: { xRatio: 0.5, yRatio: 0.5 }
    });

    controller.attach();
    expect(moves.at(-1)).toEqual({ x: 350, y: 310 });
    expect(states.at(-1)).toBe(true);

    controller.setMode({
      ...DEFAULT_SETTINGS,
      positionMode: "fixed",
      fixedPosition: { xRatio: 1, yRatio: 1 }
    });
    expect(moves.at(-1)).toEqual({ x: 700, y: 620 });
    expect(states.at(-1)).toBe(true);
  });

  it("moving modunda client koordinatını video-local koordinata çevirip kutuyu imlecin altında gösterir", () => {
    const { controller, frames, moves, states, target } = setup();
    controller.setMode({ ...DEFAULT_SETTINGS, positionMode: "moving", pointerOffsetPx: 18 });
    controller.attach();

    expect(states.at(-1)).toBe(false);
    target.dispatchEvent(new PointerEvent("pointermove", { clientX: 400, clientY: 200 }));
    expect(states.at(-1)).toBe(true);
    frames.flush();
    expect(moves.at(-1)).toEqual({ x: 300, y: 168 });
  });

  it("delayed modunda her harekette gizlenir ve yalnız son konumda gecikme sonunda görünür", () => {
    vi.useFakeTimers();
    const { controller, frames, moves, states, target } = setup();
    controller.setMode({ ...DEFAULT_SETTINGS, positionMode: "delayed", delayMs: 600 });
    controller.attach();

    target.dispatchEvent(new PointerEvent("pointermove", { clientX: 400, clientY: 200 }));
    frames.flush();
    vi.advanceTimersByTime(500);
    target.dispatchEvent(new PointerEvent("pointermove", { clientX: 700, clientY: 300 }));
    frames.flush();

    expect(states.at(-1)).toBe(false);
    expect(moves.at(-1)).toEqual({ x: 600, y: 268 });
    vi.advanceTimersByTime(599);
    expect(states.at(-1)).toBe(false);
    vi.advanceTimersByTime(1);
    expect(states.at(-1)).toBe(true);
  });

  it("mod değişiminde eski timer ve animation frame callbacklerini iptal eder", () => {
    vi.useFakeTimers();
    const { controller, frames, moves, states, target } = setup();
    controller.setMode({ ...DEFAULT_SETTINGS, positionMode: "delayed", delayMs: 600 });
    controller.attach();
    target.dispatchEvent(new PointerEvent("pointermove", { clientX: 900, clientY: 700 }));

    controller.setMode({
      ...DEFAULT_SETTINGS,
      positionMode: "fixed",
      fixedPosition: { xRatio: 0, yRatio: 0 }
    });
    const stateCount = states.length;
    frames.flush();
    vi.advanceTimersByTime(600);

    expect(frames.cancelled).toContain(1);
    expect(moves.at(-1)).toEqual({ x: 0, y: 0 });
    expect(states).toHaveLength(stateCount);
    expect(states.at(-1)).toBe(true);
  });

  it("attach ve detach çağrılarını idempotent tutar", () => {
    const { controller, frames, moves, target } = setup();
    controller.setMode({ ...DEFAULT_SETTINGS, positionMode: "moving" });
    controller.attach();
    controller.attach();
    target.dispatchEvent(new PointerEvent("pointermove", { clientX: 200, clientY: 100 }));
    frames.flush();
    expect(moves).toHaveLength(1);

    controller.detach();
    controller.detach();
    target.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 200 }));
    frames.flush();
    expect(moves).toHaveLength(1);
  });

  it("refresh ile değişen video ölçülerinde fixed konumu yeniden hesaplar", () => {
    let video = { left: 20, top: 30, width: 1000, height: 720 };
    const { controller, moves } = setup(() => video);
    controller.setMode({
      ...DEFAULT_SETTINGS,
      positionMode: "fixed",
      fixedPosition: { xRatio: 1, yRatio: 1 }
    });
    controller.attach();
    video = { left: 40, top: 60, width: 500, height: 300 };

    controller.refresh();
    expect(moves.at(-1)).toEqual({ x: 200, y: 200 });
  });

  it("Element hedefinin resize bildiriminde fixed konumu otomatik yeniler", () => {
    const target = document.createElement("div");
    let notifyResize: () => void = () => undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    const resizeObserverFactory: ResizeObserverFactory = (callback) => {
      notifyResize = callback;
      return { observe, disconnect };
    };
    let video = { left: 20, top: 30, width: 1000, height: 720 };
    const { controller, moves } = setup(
      () => video,
      () => ({ width: 300, height: 100 }),
      { target, resizeObserverFactory }
    );
    controller.setMode({
      ...DEFAULT_SETTINGS,
      positionMode: "fixed",
      fixedPosition: { xRatio: 1, yRatio: 1 }
    });
    controller.attach();
    video = { left: 40, top: 60, width: 500, height: 300 };

    notifyResize();
    expect(observe).toHaveBeenCalledWith(target);
    expect(moves.at(-1)).toEqual({ x: 200, y: 200 });

    controller.detach();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it.each(["moving", "delayed"] as const)(
    "%s modunda bubbling layout event ile yeni overlay ölçüsüne göre yeniden clamp eder",
    (positionMode) => {
      const target = document.createElement("div");
      const overlay = document.createElement("div");
      target.append(overlay);
      let overlaySize = { width: 100, height: 50 };
      const { controller, frames, moves } = setup(
        undefined,
        () => overlaySize,
        { target, resizeObserverFactory: () => undefined }
      );
      controller.setMode({ ...DEFAULT_SETTINGS, positionMode });
      controller.attach();
      target.dispatchEvent(new PointerEvent("pointermove", { clientX: 900, clientY: 700 }));
      frames.flush();
      overlaySize = { width: 500, height: 400 };

      overlay.dispatchEvent(
        new CustomEvent(OVERLAY_LAYOUT_EVENT, { bubbles: true, composed: true })
      );
      expect(moves.at(-1)).toEqual({ x: 500, y: 320 });
      controller.detach();
    }
  );

  it("detach sonrasında layout event ve resize callbacklerini etkisiz bırakır", () => {
    const target = document.createElement("div");
    let notifyResize: () => void = () => undefined;
    const resizeObserverFactory: ResizeObserverFactory = (callback) => {
      notifyResize = callback;
      return { observe: vi.fn(), disconnect: vi.fn() };
    };
    const { controller, moves } = setup(undefined, undefined, { target, resizeObserverFactory });
    controller.setMode({ ...DEFAULT_SETTINGS, positionMode: "fixed" });
    controller.attach();
    controller.detach();
    const moveCount = moves.length;

    notifyResize();
    target.dispatchEvent(new CustomEvent(OVERLAY_LAYOUT_EVENT, { bubbles: true, composed: true }));
    expect(moves).toHaveLength(moveCount);
  });

  it("attach sağlayıcılarını sonradan değiştirmeye izin verir", () => {
    const { controller, moves } = setup();
    controller.setMode({
      ...DEFAULT_SETTINGS,
      positionMode: "fixed",
      fixedPosition: { xRatio: 1, yRatio: 1 }
    });

    controller.attach(
      () => ({ left: 0, top: 0, width: 600, height: 400 }),
      () => ({ width: 100, height: 50 })
    );
    expect(moves.at(-1)).toEqual({ x: 500, y: 350 });
  });
});
