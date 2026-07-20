import type { LanguageCode, LanguageOption } from "@focapt/contracts/captions";
import type { UserSettings } from "@focapt/contracts/settings";
import { normalizeLanguageCatalog } from "@focapt/core/languages";
import { normalizeSettings } from "@focapt/core/settings";
import {
  selectBaseCaptionTrack,
  type YouTubeCaptionCatalog,
  type YouTubeCaptionTrack,
} from "./player-response";

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
    typeof track.label === "string" &&
    typeof track.isTranslatable === "boolean" &&
    typeof track.isDefault === "boolean"
  )) return null;
  return value as unknown as YouTubeTracksEventDetail;
}

export function selectCaptionTrack(
  tracks: readonly YouTubeCaptionTrack[],
  language: LanguageCode
): YouTubeCaptionTrack | undefined {
  return selectBaseCaptionTrack(tracks, language);
}

export interface BilingualLoadPlan {
  baseTrack: YouTubeCaptionTrack;
  sourceRequestLanguage: string | null;
  targetRequestLanguage: string | null;
}

function resolveCatalogLanguage(
  selectedLanguage: string,
  languages: readonly LanguageOption[]
): string {
  const catalog = normalizeLanguageCatalog(languages);
  if (catalog.length === 0) return selectedLanguage;

  const normalized = selectedLanguage.toLowerCase();
  return catalog.find((language) => language.languageCode.toLowerCase() === normalized)?.languageCode
    ?? catalog.find((language) => language.languageCode.toLowerCase() === "en")?.languageCode
    ?? catalog[0]!.languageCode;
}

export function createBilingualLoadPlan(
  catalog: YouTubeCaptionCatalog,
  settings: Pick<UserSettings, "sourceLanguage" | "targetLanguage">
): BilingualLoadPlan | null {
  const sourceLanguage = resolveCatalogLanguage(
    settings.sourceLanguage,
    catalog.languages
  );
  const targetLanguage = resolveCatalogLanguage(
    settings.targetLanguage,
    catalog.languages
  );
  let baseTrack = selectBaseCaptionTrack(catalog.tracks, sourceLanguage);
  if (!baseTrack) return null;

  const needsTranslation =
    baseTrack.languageCode.toLowerCase() !== sourceLanguage.toLowerCase()
    || baseTrack.languageCode.toLowerCase() !== targetLanguage.toLowerCase();
  if (needsTranslation && !baseTrack.isTranslatable) {
    baseTrack = selectBaseCaptionTrack(
      catalog.tracks.filter((track) => track.isTranslatable),
      sourceLanguage
    ) ?? baseTrack;
  }

  const requestLanguage = (language: string): string | null =>
    baseTrack.languageCode.toLowerCase() === language.toLowerCase() ? null : language;

  return {
    baseTrack,
    sourceRequestLanguage: requestLanguage(sourceLanguage),
    targetRequestLanguage: requestLanguage(targetLanguage)
  };
}

export class LanguageDefaultsInitializer {
  private initialization: Promise<void> | undefined;

  run(
    languages: readonly LanguageOption[],
    initialize: () => void | Promise<void>
  ): Promise<void> {
    if (normalizeLanguageCatalog(languages).length === 0) return Promise.resolve();
    if (!this.initialization) {
      const running = Promise.resolve().then(initialize);
      this.initialization = running.catch((error) => {
        this.initialization = undefined;
        throw error;
      });
    }
    return this.initialization;
  }
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
  private latestLanguages: LanguageOption[] = [];

  setLanguageCatalog(languages: readonly LanguageOption[]): void {
    this.latestLanguages = languages.map((option) => ({ ...option }));
  }

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
    if (isRecord(message) && message.type === "GET_LANGUAGE_CATALOG") {
      return Promise.resolve({
        languages: this.latestLanguages.map((option) => ({ ...option }))
      });
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

interface CaptionLoadFailureContext {
  requestVideoId: string;
  currentVideoId: () => string;
  generationSignal: AbortSignal;
  isGenerationCurrent: () => boolean;
}

export function reportCaptionLoadFailure(
  context: CaptionLoadFailureContext,
  report: () => void
): void {
  if (
    !context.generationSignal.aborted
    && context.isGenerationCurrent()
    && context.requestVideoId === context.currentVideoId()
  ) report();
}
