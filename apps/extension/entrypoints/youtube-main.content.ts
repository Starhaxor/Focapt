import { installYouTubeTracksBridge } from "../src/youtube/bridge";
import { extractCaptionTracks } from "../src/youtube/player-response";
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

        const videoData = callSafely(player?.getVideoData?.bind(player));
        const playerVideoId =
          isRecord(videoData) && isYouTubeVideoId(videoData.video_id)
            ? videoData.video_id
            : "";
        const videoId =
          playerVideoId || readYouTubeVideoId(location.href) || "";

        window.dispatchEvent(
          new CustomEvent("focapt:youtube-tracks", {
            detail: { videoId, tracks: extractCaptionTracks(response) },
          }),
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
        window.addEventListener("focapt:request-youtube-tracks", listener),
    });
  },
});
