import type { UserSettings } from "@focapt/contracts/settings";
import { clampOverlayPosition } from "./geometry";

export interface Size {
  width: number;
  height: number;
}

/** Viewport client rect for the video; emitted positions are local to its top-left origin. */
export interface VideoRect extends Size {
  left?: number;
  top?: number;
}

export type RectProvider = () => VideoRect;
export type SizeProvider = () => Size;
export const OVERLAY_LAYOUT_EVENT = "focapt-overlay-layout";

export interface OverlayPositionView {
  move(x: number, y: number): void;
  setVisible(visible: boolean): void;
  saveFixed(xRatio: number, yRatio: number): void;
}

export interface AnimationFrameScheduler {
  request(callback: FrameRequestCallback): unknown;
  cancel(handle: unknown): void;
}

export interface ElementResizeObserver {
  observe(target: Element): void;
  disconnect(): void;
}

export type ResizeObserverFactory = (callback: () => void) => ElementResizeObserver | undefined;

function createDefaultScheduler(): AnimationFrameScheduler {
  if (
    typeof globalThis.requestAnimationFrame === "function" &&
    typeof globalThis.cancelAnimationFrame === "function"
  ) {
    return {
      request: (callback) => globalThis.requestAnimationFrame(callback),
      cancel: (handle) => globalThis.cancelAnimationFrame(handle as number)
    };
  }

  return {
    request: (callback) =>
      globalThis.setTimeout(() => {
        const timestamp = typeof performance === "undefined" ? Date.now() : performance.now();
        callback(timestamp);
      }, 0),
    cancel: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>)
  };
}

const createDefaultResizeObserver: ResizeObserverFactory = (callback) => {
  if (typeof globalThis.ResizeObserver !== "function") return undefined;
  return new globalThis.ResizeObserver(() => callback());
};

function finiteOrZero(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Keeps `view.move()` coordinates video-local. The overlay host must cover the same video region
 * from a positioned parent (`position: absolute; inset: 0`); this controller never mutates that
 * parent or any YouTube-owned DOM node to establish positioning.
 */
export class PositionController {
  private settings: UserSettings | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private frame: unknown;
  private attached = false;
  private revision = 0;
  private lastPointer: { clientX: number; clientY: number } | undefined;
  private resizeObserver: ElementResizeObserver | undefined;

  constructor(
    private readonly target: EventTarget,
    private videoRectProvider: RectProvider,
    private overlayRectProvider: SizeProvider,
    private readonly view: OverlayPositionView,
    private readonly scheduler: AnimationFrameScheduler = createDefaultScheduler(),
    private readonly resizeObserverFactory: ResizeObserverFactory = createDefaultResizeObserver
  ) {}

  setMode(settings: UserSettings): void {
    this.cancelPending();
    this.settings = settings;
    if (!this.attached) return;
    this.applyCurrentMode();
  }

  attach(videoRectProvider?: RectProvider, overlayRectProvider?: SizeProvider): void {
    if (videoRectProvider) this.videoRectProvider = videoRectProvider;
    if (overlayRectProvider) this.overlayRectProvider = overlayRectProvider;

    if (this.attached) {
      this.refresh();
      return;
    }

    this.attached = true;
    this.target.addEventListener("pointermove", this.onMove as EventListener);
    this.target.addEventListener(OVERLAY_LAYOUT_EVENT, this.onLayoutChange);
    this.observeTargetSize();
    this.applyCurrentMode();
  }

  detach(): void {
    if (this.attached) {
      this.target.removeEventListener("pointermove", this.onMove as EventListener);
      this.target.removeEventListener(OVERLAY_LAYOUT_EVENT, this.onLayoutChange);
      this.attached = false;
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    this.cancelPending();
  }

  refresh(): void {
    if (!this.attached || !this.settings) return;
    if (this.settings.positionMode === "fixed") {
      this.moveToFixedPosition();
      this.view.setVisible(true);
      return;
    }
    if (this.lastPointer) this.moveToPointer(this.lastPointer);
  }

  private applyCurrentMode(): void {
    if (!this.settings) return;

    if (this.settings.positionMode === "fixed") {
      this.moveToFixedPosition();
      this.view.setVisible(true);
      return;
    }

    if (this.settings.positionMode === "moving") {
      if (this.lastPointer) this.moveToPointer(this.lastPointer);
      this.view.setVisible(this.lastPointer !== undefined);
      return;
    }

    this.view.setVisible(false);
  }

  private onMove = (event: PointerEvent): void => {
    const settings = this.settings;
    if (!this.attached || !settings || settings.positionMode === "fixed") return;

    this.cancelPending();
    this.lastPointer = { clientX: event.clientX, clientY: event.clientY };
    const revision = this.revision;

    if (settings.positionMode === "moving") {
      this.view.setVisible(true);
    } else {
      this.view.setVisible(false);
      this.timer = globalThis.setTimeout(() => {
        if (
          !this.attached ||
          revision !== this.revision ||
          this.settings?.positionMode !== "delayed" ||
          !this.lastPointer
        ) {
          return;
        }
        this.cancelFrame();
        this.moveToPointer(this.lastPointer);
        this.view.setVisible(true);
        this.timer = undefined;
      }, settings.delayMs);
    }

    this.schedulePointerMove(revision);
  };

  private onLayoutChange = (): void => {
    this.refresh();
  };

  private observeTargetSize(): void {
    if (typeof Element === "undefined" || !(this.target instanceof Element)) return;
    this.resizeObserver = this.resizeObserverFactory(() => {
      if (this.attached) this.refresh();
    });
    this.resizeObserver?.observe(this.target);
  }

  private schedulePointerMove(revision: number): void {
    let completedSynchronously = false;
    const handle = this.scheduler.request(() => {
      completedSynchronously = true;
      if (this.attached && revision === this.revision && this.lastPointer) {
        this.moveToPointer(this.lastPointer);
      }
      this.frame = undefined;
    });
    this.frame = completedSynchronously ? undefined : handle;
  }

  private moveToPointer(pointer: { clientX: number; clientY: number }): void {
    const settings = this.settings;
    if (!settings) return;
    const video = this.videoRectProvider();
    const overlay = this.overlayRectProvider();
    const point = clampOverlayPosition({
      x: pointer.clientX - finiteOrZero(video.left),
      y: pointer.clientY - finiteOrZero(video.top) + settings.pointerOffsetPx,
      overlayWidth: overlay.width,
      overlayHeight: overlay.height,
      videoWidth: video.width,
      videoHeight: video.height
    });
    this.view.move(point.x, point.y);
  }

  private moveToFixedPosition(): void {
    const settings = this.settings;
    if (!settings) return;
    const video = this.videoRectProvider();
    const overlay = this.overlayRectProvider();
    const availableWidth = Math.max(0, finiteOrZero(video.width) - finiteOrZero(overlay.width));
    const availableHeight = Math.max(0, finiteOrZero(video.height) - finiteOrZero(overlay.height));
    const point = clampOverlayPosition({
      x: settings.fixedPosition.xRatio * availableWidth,
      y: settings.fixedPosition.yRatio * availableHeight,
      overlayWidth: overlay.width,
      overlayHeight: overlay.height,
      videoWidth: video.width,
      videoHeight: video.height
    });
    this.view.move(point.x, point.y);
  }

  private cancelFrame(): void {
    if (this.frame === undefined) return;
    this.scheduler.cancel(this.frame);
    this.frame = undefined;
  }

  private cancelPending(): void {
    this.revision += 1;
    if (this.timer !== undefined) {
      globalThis.clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.cancelFrame();
  }
}
