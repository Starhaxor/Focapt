export interface LayoutRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface IntrinsicSize {
  width: number;
  height: number;
}

const finite = (value: number, fallback = 0): number => Number.isFinite(value) ? value : fallback;
const length = (value: number): number => Math.max(0, finite(value));

export function calculateRenderedVideoRect(
  elementRect: LayoutRect,
  intrinsic: IntrinsicSize,
  objectFit: string
): LayoutRect {
  const box = {
    left: finite(elementRect.left),
    top: finite(elementRect.top),
    width: length(elementRect.width),
    height: length(elementRect.height)
  };
  const intrinsicWidth = length(intrinsic.width);
  const intrinsicHeight = length(intrinsic.height);
  if (
    objectFit !== "contain" ||
    box.width === 0 ||
    box.height === 0 ||
    intrinsicWidth === 0 ||
    intrinsicHeight === 0
  ) {
    return box;
  }

  const scale = Math.min(box.width / intrinsicWidth, box.height / intrinsicHeight);
  const scaledWidth = intrinsicWidth * scale;
  const scaledHeight = intrinsicHeight * scale;
  const width = Math.abs(scaledWidth - box.width) < 1e-9 ? box.width : scaledWidth;
  const height = Math.abs(scaledHeight - box.height) < 1e-9 ? box.height : scaledHeight;
  return {
    left: box.left + (box.width - width) / 2,
    top: box.top + (box.height - height) / 2,
    width,
    height
  };
}

export interface LayoutResizeObserver {
  observe(target: Element): void;
  disconnect(): void;
}

export type LayoutResizeObserverFactory = (callback: () => void) => LayoutResizeObserver | undefined;

export interface VideoLayoutView {
  setBounds(bounds: LayoutRect): void;
  refresh(): void;
}

interface VideoLayoutOptions {
  getObjectFit?: (video: HTMLVideoElement) => string;
  resizeObserverFactory?: LayoutResizeObserverFactory;
  windowTarget?: EventTarget;
  documentTarget?: EventTarget;
}

const defaultResizeObserverFactory: LayoutResizeObserverFactory = (callback) => {
  if (typeof globalThis.ResizeObserver !== "function") return undefined;
  return new globalThis.ResizeObserver(() => callback());
};

export class VideoLayoutController {
  private attached = false;
  private resizeObserver: LayoutResizeObserver | undefined;
  private renderedRect: LayoutRect = { left: 0, top: 0, width: 0, height: 0 };
  private readonly getObjectFit: (video: HTMLVideoElement) => string;
  private readonly resizeObserverFactory: LayoutResizeObserverFactory;
  private readonly windowTarget: EventTarget;
  private readonly documentTarget: EventTarget;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly container: HTMLElement,
    private readonly view: VideoLayoutView,
    options: VideoLayoutOptions = {}
  ) {
    this.getObjectFit = options.getObjectFit ?? ((element) => getComputedStyle(element).objectFit);
    this.resizeObserverFactory = options.resizeObserverFactory ?? defaultResizeObserverFactory;
    this.windowTarget = options.windowTarget ?? window;
    this.documentTarget = options.documentTarget ?? document;
  }

  attach(): void {
    if (this.attached) {
      this.sync();
      return;
    }
    this.attached = true;
    this.video.addEventListener("loadedmetadata", this.onLayoutChange);
    this.windowTarget.addEventListener("resize", this.onLayoutChange);
    this.documentTarget.addEventListener("fullscreenchange", this.onLayoutChange);
    this.resizeObserver = this.resizeObserverFactory(this.sync);
    this.resizeObserver?.observe(this.video);
    this.resizeObserver?.observe(this.container);
    this.sync();
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    this.video.removeEventListener("loadedmetadata", this.onLayoutChange);
    this.windowTarget.removeEventListener("resize", this.onLayoutChange);
    this.documentTarget.removeEventListener("fullscreenchange", this.onLayoutChange);
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
  }

  currentRect(): LayoutRect {
    return { ...this.renderedRect };
  }

  private readonly onLayoutChange = (): void => this.sync();

  private readonly sync = (): void => {
    if (!this.attached) return;
    const videoRect = this.video.getBoundingClientRect();
    const containerRect = this.container.getBoundingClientRect();
    this.renderedRect = calculateRenderedVideoRect(
      { left: videoRect.left, top: videoRect.top, width: videoRect.width, height: videoRect.height },
      { width: this.video.videoWidth, height: this.video.videoHeight },
      this.getObjectFit(this.video)
    );
    this.view.setBounds({
      left: this.renderedRect.left - finite(containerRect.left),
      top: this.renderedRect.top - finite(containerRect.top),
      width: this.renderedRect.width,
      height: this.renderedRect.height
    });
    this.view.refresh();
  };
}
