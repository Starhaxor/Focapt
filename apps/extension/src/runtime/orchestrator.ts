import type { BilingualCue } from "@focapt/contracts/captions";

export interface FrameScheduler {
  request(callback: FrameRequestCallback): unknown;
  cancel(handle: unknown): void;
}

function defaultFrameScheduler(): FrameScheduler {
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
    request: (callback) => globalThis.setTimeout(() => callback(Date.now()), 16),
    cancel: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>)
  };
}

export class SubtitleOrchestrator {
  private frame: unknown;
  private running = false;
  private destroyed = false;
  private revision = 0;
  private rendered = true;
  private lastCue: BilingualCue | null = null;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly timeline: { at(ms: number): BilingualCue | null },
    private readonly overlay: { setCue(cue: BilingualCue | null): void },
    private readonly scheduler: FrameScheduler = defaultFrameScheduler()
  ) {}

  start(): void {
    if (this.running || this.destroyed) return;
    this.running = true;
    const revision = ++this.revision;

    const render = (): void => {
      if (!this.running || revision !== this.revision) return;
      const timeMs = Number.isFinite(this.video.currentTime)
        ? Math.max(0, Math.min(this.video.currentTime * 1000, Number.MAX_SAFE_INTEGER))
        : 0;
      const cue = this.timeline.at(timeMs);
      if (!this.rendered || cue !== this.lastCue) {
        this.overlay.setCue(cue);
        this.lastCue = cue;
        this.rendered = true;
      }
      if (this.running && revision === this.revision) {
        this.frame = this.scheduler.request(render);
      }
    };

    render();
  }

  reset(): void {
    if (this.destroyed) return;
    this.overlay.setCue(null);
    this.lastCue = null;
    this.rendered = true;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.running = false;
    this.revision += 1;
    if (this.frame !== undefined) this.scheduler.cancel(this.frame);
    this.frame = undefined;
    this.rendered = true;
    this.lastCue = null;
    this.overlay.setCue(null);
  }
}
