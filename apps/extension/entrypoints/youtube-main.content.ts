import {
  enrichYouTubeCaptionCatalogWithTimedText,
  handleYouTubeCaptionRequest,
  installYouTubeTracksBridge,
  loadYouTubeCaptionCatalog,
  YouTubeTimedTextUrlRegistry,
} from "../src/youtube/bridge";
import {
  createCaptionCatalog,
  readCaptionCatalogRequest,
} from "../src/youtube/page-caption-protocol";
import { isYouTubeVideoId, readYouTubeVideoId } from "../src/youtube/youtube-url";

type UnknownRecord = Record<string, unknown>;

type YouTubePlayerElement = Element & {
  getPlayerResponse?: () => unknown;
  getVideoData?: () => unknown;
};

type BridgeWindow = Window &
  typeof globalThis & {
    ytInitialPlayerResponse?: unknown;
  };

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const callSafely = (callback: (() => unknown) | undefined): unknown => {
  try {
    return callback?.();
  } catch {
    return undefined;
  }
};

const currentVideoId = (): string => {
  try {
    const player = document.querySelector(
      "#movie_player",
    ) as YouTubePlayerElement | null;
    const videoData = callSafely(player?.getVideoData?.bind(player));
    const playerVideoId =
      isRecord(videoData) && isYouTubeVideoId(videoData.video_id)
        ? videoData.video_id
        : "";
    return playerVideoId || readYouTubeVideoId(location.href) || "";
  } catch {
    return "";
  }
};

export default defineContentScript({
  matches: ["https://www.youtube.com/*"],
  world: "MAIN",
  runAt: "document_start",
  main() {
    const bridgeWindow = window as BridgeWindow;
    const timedTextUrls = new YouTubeTimedTextUrlRegistry();
    try {
      const captureEntries = (entries: readonly PerformanceEntry[]): void => {
        for (const entry of entries) timedTextUrls.capture(entry.name);
      };
      captureEntries(performance.getEntriesByType("resource"));
      const observer = new PerformanceObserver((list) => captureEntries(list.getEntries()));
      observer.observe({ type: "resource", buffered: true });
    } catch {
      // Caption discovery continues through the page response fallback.
    }

    const primeTimedTextUrl = async (videoId: string): Promise<string | null> => {
      const current = timedTextUrls.get(videoId);
      if (current) return current;
      const button = document.querySelector<HTMLButtonElement>(".ytp-subtitles-button");
      const shouldRestore = button?.getAttribute("aria-pressed") !== "true";
      try {
        if (button && shouldRestore) button.click();
        return await timedTextUrls.wait(videoId, 3_000);
      } finally {
        if (
          button?.isConnected
          && shouldRestore
          && button.getAttribute("aria-pressed") === "true"
        ) button.click();
      }
    };
    let publishRevision = 0;
    const publish = (): void => {
      const revision = ++publishRevision;
      try {
        const videoId = currentVideoId();
        if (!videoId) return;
        const player = document.querySelector(
          "#movie_player",
        ) as YouTubePlayerElement | null;
        const playerResponse = callSafely(
          player?.getPlayerResponse?.bind(player),
        );
        const inlineSources = Array.from(document.scripts).flatMap((script) => {
          const source = script.textContent ?? "";
          return source.includes("ytInitialPlayerResponse") ? [source] : [];
        });
        const watchUrl = new URL("/watch", location.origin);
        watchUrl.searchParams.set("v", videoId);

        void loadYouTubeCaptionCatalog({
          videoId,
          watchUrl: watchUrl.href,
          inlineSources,
          playerResponses: [playerResponse, bridgeWindow.ytInitialPlayerResponse],
          fetchWatchPage: (url, init) => fetch(url, init),
        }).then(async (catalog) => {
          const proofUrl = timedTextUrls.get(videoId) ?? await primeTimedTextUrl(videoId);
          if (revision !== publishRevision || videoId !== currentVideoId()) return;
          const currentCatalog = proofUrl
            ? enrichYouTubeCaptionCatalogWithTimedText(catalog, proofUrl, videoId)
            : catalog;
          window.postMessage(
            createCaptionCatalog(videoId, currentCatalog),
            location.origin,
          );
        }).catch(() => undefined);
      } catch {
        // Publishing is best-effort and must not interfere with YouTube's page code.
      }
    };

    timedTextUrls.subscribe((videoId) => {
      if (videoId === currentVideoId()) publish();
    });
    installYouTubeTracksBridge({
      host: window,
      publish,
      addNavigationListener: (listener) =>
        document.addEventListener("yt-navigate-finish", listener),
      addRequestListener: (listener) =>
        window.addEventListener("message", (event) => {
          try {
            if (event.source === window && readCaptionCatalogRequest(event.data)) {
              listener();
            }
          } catch {
            // Invalid page messages are ignored.
          }
        }),
      addCaptionRequestListener: (listener) =>
        window.addEventListener("message", listener),
      handleCaptionRequest: (event) => handleYouTubeCaptionRequest(
        event as MessageEvent<unknown>,
        {
          host: window,
          currentVideoId,
          fetchCaption: (url, init) => fetch(url, init),
          postMessage: (message, targetOrigin) =>
            window.postMessage(message, targetOrigin),
          targetOrigin: location.origin,
        },
      ),
    });
  },
});
