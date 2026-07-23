import { parseJson3 } from "./json3";
import {
  extractCaptionCatalog,
  extractInitialPlayerResponse,
  readPlayerResponseForVideo,
  type YouTubeCaptionCatalog,
} from "./player-response";
import {
  createCaptionFailure,
  createCaptionSuccess,
  createJson3Url,
  readCaptionRequest,
  type CaptionPageResponse,
} from "./page-caption-protocol";

interface InstallYouTubeTracksBridgeOptions {
  host: object;
  publish: () => void;
  addNavigationListener: (listener: () => void) => void;
  addRequestListener?: (listener: () => void) => void;
  addCaptionRequestListener?: (listener: (event: unknown) => void) => void;
  handleCaptionRequest?: (event: unknown) => void | Promise<void>;
}

const publishersByHost = new WeakMap<object, () => void>();

const runSafely = (callback: () => void): void => {
  try {
    callback();
  } catch {
    // Page-facing publication is best-effort.
  }
};

interface CaptionRequestEvent {
  source: unknown;
  data: unknown;
}

interface CaptionFetchResponse {
  ok: boolean;
  text(): Promise<string>;
}

interface YouTubeCaptionRequestDependencies {
  host: object;
  currentVideoId: () => string;
  fetchCaption: (
    url: URL,
    init: { credentials: "include" },
  ) => Promise<CaptionFetchResponse>;
  postMessage: (message: CaptionPageResponse, targetOrigin: string) => void;
  targetOrigin: string;
}

type TimedTextUrlListener = (videoId: string, url: string) => void;

const readProofTimedTextUrl = (
  value: string,
  expectedVideoId?: string,
): { videoId: string; language: string; url: string } | null => {
  try {
    const url = new URL(value);
    const videoId = url.searchParams.get("v") ?? "";
    const language = url.searchParams.get("lang") ?? "";
    if (
      url.protocol !== "https:"
      || !url.hostname.toLowerCase().endsWith(".youtube.com")
      || url.pathname !== "/api/timedtext"
      || !videoId
      || (expectedVideoId !== undefined && videoId !== expectedVideoId)
      || !language
      || !url.searchParams.get("pot")
      || !url.searchParams.get("potc")
    ) return null;
    url.searchParams.delete("tlang");
    return { videoId, language, url: url.href };
  } catch {
    return null;
  }
};

export class YouTubeTimedTextUrlRegistry {
  private readonly urls = new Map<string, string>();
  private readonly listeners = new Set<TimedTextUrlListener>();

  capture(value: string): boolean {
    const proof = readProofTimedTextUrl(value);
    if (!proof || this.urls.get(proof.videoId) === proof.url) return false;
    this.urls.set(proof.videoId, proof.url);
    for (const listener of [...this.listeners]) listener(proof.videoId, proof.url);
    return true;
  }

  get(videoId: string): string | null {
    return this.urls.get(videoId) ?? null;
  }

  subscribe(listener: TimedTextUrlListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  wait(videoId: string, timeoutMs: number): Promise<string | null> {
    const current = this.get(videoId);
    if (current) return Promise.resolve(current);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value: string | null): void => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timer);
        unsubscribe();
        resolve(value);
      };
      const unsubscribe = this.subscribe((capturedVideoId, url) => {
        if (capturedVideoId === videoId) finish(url);
      });
      const timer = globalThis.setTimeout(() => finish(null), timeoutMs);
    });
  }
}

export function enrichYouTubeCaptionCatalogWithTimedText(
  catalog: YouTubeCaptionCatalog,
  proofUrl: string,
  videoId: string,
): YouTubeCaptionCatalog {
  const proof = readProofTimedTextUrl(proofUrl, videoId);
  if (!proof) return catalog;
  let applied = false;
  const tracks = catalog.tracks.map((track) => {
    if (track.languageCode.toLowerCase() !== proof.language.toLowerCase()) return track;
    applied = true;
    return { ...track, baseUrl: proof.url };
  });
  return applied ? { tracks, languages: catalog.languages } : catalog;
}
interface WatchPageFetchResponse {
  ok: boolean;
  text(): Promise<string>;
}

interface YouTubeCaptionCatalogDependencies {
  videoId: string;
  watchUrl: string;
  inlineSources: readonly string[];
  playerResponses?: readonly unknown[];
  fetchWatchPage: (
    url: string,
    init: { credentials: "include"; cache: "no-store" },
  ) => Promise<WatchPageFetchResponse>;
}

const emptyCaptionCatalog = (): YouTubeCaptionCatalog => ({ tracks: [], languages: [] });

export async function loadYouTubeCaptionCatalog({
  videoId,
  watchUrl,
  inlineSources,
  playerResponses = [],
  fetchWatchPage,
}: YouTubeCaptionCatalogDependencies): Promise<YouTubeCaptionCatalog> {
  for (const response of playerResponses) {
    const current = readPlayerResponseForVideo(response, videoId);
    if (current) return extractCaptionCatalog(current);
  }

  for (const source of inlineSources) {
    const response = extractInitialPlayerResponse(source, videoId);
    if (response) return extractCaptionCatalog(response);
  }

  try {
    const response = await fetchWatchPage(watchUrl, {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) return emptyCaptionCatalog();
    const playerResponse = extractInitialPlayerResponse(await response.text(), videoId);
    return playerResponse ? extractCaptionCatalog(playerResponse) : emptyCaptionCatalog();
  } catch {
    return emptyCaptionCatalog();
  }
}
export async function handleYouTubeCaptionRequest(
  event: CaptionRequestEvent,
  dependencies: YouTubeCaptionRequestDependencies,
): Promise<void> {
  let request;
  try {
    if (event.source !== dependencies.host) return;
    request = readCaptionRequest(event.data);
    if (!request || request.videoId !== dependencies.currentVideoId()) return;
  } catch {
    return;
  }

  const postSafely = (message: CaptionPageResponse): void => {
    try {
      dependencies.postMessage(message, dependencies.targetOrigin);
    } catch {
      // Page-facing publication is best-effort.
    }
  };

  try {
    const url = createJson3Url(request.track.baseUrl, request.language);
    const response = await dependencies.fetchCaption(url, { credentials: "include" });
    if (!response.ok) throw new Error("CAPTION_LOAD_FAILED");
    const text = await response.text();
    const cues = text ? parseJson3(JSON.parse(text)) : [];
    postSafely(createCaptionSuccess(request, cues));
  } catch {
    postSafely(createCaptionFailure(request, "CAPTION_LOAD_FAILED"));
  }
}

export function installYouTubeTracksBridge({
  host,
  publish,
  addNavigationListener,
  addRequestListener,
  addCaptionRequestListener,
  handleCaptionRequest,
}: InstallYouTubeTracksBridgeOptions): void {
  const existingPublish = publishersByHost.get(host);
  if (existingPublish !== undefined) {
    existingPublish();
    return;
  }

  const safePublish = () => runSafely(publish);
  try {
    addNavigationListener(safePublish);
  } catch {
    safePublish();
    return;
  }

  try {
    addRequestListener?.(safePublish);
  } catch {
    // Navigation publication still works if the request channel is unavailable.
  }

  if (addCaptionRequestListener && handleCaptionRequest) {
    try {
      addCaptionRequestListener((event) => {
        try {
          void Promise.resolve(handleCaptionRequest(event)).catch(() => undefined);
        } catch {
          // Caption loading is best-effort and must never affect page playback.
        }
      });
    } catch {
      // Catalog publication still works if caption request handling is unavailable.
    }
  }

  publishersByHost.set(host, safePublish);
  safePublish();
}
