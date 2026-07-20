import {
  handleYouTubeCaptionRequest,
  installYouTubeTracksBridge,
} from "../src/youtube/bridge";
import {
  createCaptionCatalog,
  readCaptionCatalogRequest,
} from "../src/youtube/page-caption-protocol";
import { extractCaptionCatalog } from "../src/youtube/player-response";
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
  main() {
    const bridgeWindow = window as BridgeWindow;
    const publish = () => {
      try {
        const player = document.querySelector(
          "#movie_player",
        ) as YouTubePlayerElement | null;

        const playerResponse = callSafely(
          player?.getPlayerResponse?.bind(player),
        );
        const response =
          playerResponse === undefined
            ? bridgeWindow.ytInitialPlayerResponse
            : playerResponse;
        const videoId = currentVideoId();
        if (!videoId) return;
        window.postMessage(
          createCaptionCatalog(videoId, extractCaptionCatalog(response)),
          location.origin,
        );
      } catch {
        // Publishing is best-effort and must not interfere with YouTube's page code.
      }
    };

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
