import type { LanguageCode } from "@focapt/contracts/captions";
import type { UserSettings } from "@focapt/contracts/settings";
import { normalizeSettings } from "@focapt/core/settings";
import type { YouTubeCaptionTrack } from "./player-response";

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export class YouTubeVideoWaitError extends Error {
  override readonly name = "YouTubeVideoWaitError";

  constructor(readonly code: "YOUTUBE_VIDEO_WAIT_TIMEOUT") {
    super(code);
  }
}

function findVideo(root: Document): HTMLVideoElement | null {
  const candidate = root.querySelector("#movie_player video");
  const Video = root.defaultView?.HTMLVideoElement;
  return Video && candidate instanceof Video ? candidate : null;
}

export function waitForYouTubeVideo(
  root: Document,
  options: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<HTMLVideoElement> {
  const current = findVideo(root);
  if (current) return Promise.resolve(current);
  if (options.signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void): void => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      globalThis.clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      action();
    };
    const onAbort = () => finish(() => reject(new DOMException("Aborted", "AbortError")));
    const observer = new MutationObserver(() => {
      const video = findVideo(root);
      if (video) finish(() => resolve(video));
    });
    observer.observe(root.documentElement, { childList: true, subtree: true });
    const timer = globalThis.setTimeout(
      () => finish(() => reject(new YouTubeVideoWaitError("YOUTUBE_VIDEO_WAIT_TIMEOUT"))),
      options.timeoutMs ?? 10_000
    );
    options.signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export interface YouTubeTracksEventDetail {
  videoId: string;
  tracks: YouTubeCaptionTrack[];
}

export function readTracksEventDetail(
  value: unknown,
  expectedVideoId: string
): YouTubeTracksEventDetail | null {
  if (!isRecord(value) || value.videoId !== expectedVideoId || !Array.isArray(value.tracks)) return null;
  if (!value.tracks.every((track) =>
    isRecord(track) &&
    typeof track.baseUrl === "string" &&
    typeof track.languageCode === "string" &&
    typeof track.label === "string"
  )) return null;
  return value as unknown as YouTubeTracksEventDetail;
}

const baseLanguage = (language: string): string => language.toLowerCase().split(/[-_]/, 1)[0] ?? "";

export function selectCaptionTrack(
  tracks: readonly YouTubeCaptionTrack[],
  language: LanguageCode
): YouTubeCaptionTrack | undefined {
  const normalized = language.toLowerCase();
  return tracks.find((track) => track.languageCode.toLowerCase() === normalized)
    ?? tracks.find((track) => baseLanguage(track.languageCode) === normalized);
}

export function readSettingsUpdate(message: unknown): UserSettings | null {
  if (!isRecord(message) || message.type !== "SETTINGS_UPDATED" || !isRecord(message.settings)) {
    return null;
  }
  return normalizeSettings(message.settings);
}

interface ContentMessageTarget {
  applySettings(settings: UserSettings): void;
  getVideoTimeMs(): number;
}

export class ContentMessageBridge {
  private target: ContentMessageTarget | undefined;
  private latestSettings: UserSettings | undefined;

  handle(message: unknown): Promise<unknown> | undefined {
    const nextSettings = readSettingsUpdate(message);
    if (nextSettings) {
      this.latestSettings = nextSettings;
      this.target?.applySettings(nextSettings);
      return Promise.resolve({ ok: true, mounted: Boolean(this.target) });
    }
    if (isRecord(message) && message.type === "GET_VIDEO_TIME") {
      return Promise.resolve({ videoTimeMs: this.target?.getVideoTimeMs() ?? null });
    }
    return undefined;
  }

  attach(target: ContentMessageTarget): () => void {
    this.target = target;
    if (this.latestSettings) target.applySettings(this.latestSettings);
    return () => {
      if (this.target === target) this.target = undefined;
    };
  }
}

export function ensurePositionedContainer(
  container: HTMLElement,
  positionProvider: (element: HTMLElement) => string = (element) => getComputedStyle(element).position
): () => void {
  const previousInlinePosition = container.style.position;
  let restored = false;
  if (positionProvider(container) === "static") container.style.position = "relative";

  return () => {
    if (restored) return;
    restored = true;
    container.style.position = previousInlinePosition;
  };
}

export class AsyncGeneration {
  private revision = 0;
  private controller: AbortController | undefined;

  begin(): { signal: AbortSignal; isCurrent: () => boolean } {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const revision = ++this.revision;
    return {
      signal: controller.signal,
      isCurrent: () => !controller.signal.aborted && revision === this.revision
    };
  }

  dispose(): void {
    this.revision += 1;
    this.controller?.abort();
    this.controller = undefined;
  }
}

export class LatestRequestController {
  private readonly generations = new AsyncGeneration();

  async run<T>(
    task: (signal: AbortSignal, isCurrent: () => boolean) => Promise<T>,
    commit: (value: T) => void
  ): Promise<void> {
    const generation = this.generations.begin();
    try {
      const value = await task(generation.signal, generation.isCurrent);
      if (generation.isCurrent()) commit(value);
    } catch (error) {
      if (generation.isCurrent()) throw error;
    }
  }

  cancel(): void {
    this.generations.dispose();
  }

  dispose(): void {
    this.cancel();
  }
}
