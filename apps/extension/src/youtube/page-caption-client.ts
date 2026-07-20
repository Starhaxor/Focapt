import type { CaptionCue } from "@focapt/contracts/captions";

import {
  createCaptionCatalogRequest,
  createCaptionRequest,
  readCaptionResponse,
} from "./page-caption-protocol";
import type { YouTubeCaptionTrack } from "./player-response";
import { readYouTubeVideoId } from "./youtube-url";

export type CaptionMessageListener = (event: MessageEvent<unknown>) => void;

export interface CaptionClientWindow {
  readonly location: Pick<Location, "href" | "origin">;
  addEventListener(type: "message", listener: CaptionMessageListener): void;
  removeEventListener(type: "message", listener: CaptionMessageListener): void;
  postMessage(message: unknown, targetOrigin: string): void;
}

interface YouTubePageCaptionClientOptions {
  timeoutMs?: number;
  maxEmptyRetries?: number;
}

let requestSequence = 0;

const abortError = (): DOMException => new DOMException("Aborted", "AbortError");

export class YouTubePageCaptionClient {
  private readonly timeoutMs: number;
  private readonly maxEmptyRetries: number;

  constructor(
    private readonly host: CaptionClientWindow,
    options: YouTubePageCaptionClientOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxEmptyRetries = options.maxEmptyRetries ?? 1;
  }

  requestCatalog(): void {
    try {
      this.host.postMessage(createCaptionCatalogRequest(), this.host.location.origin);
    } catch {
      // Catalog discovery is best-effort and must not affect page playback.
    }
  }

  load(
    track: YouTubeCaptionTrack,
    language: string | null,
    signal: AbortSignal,
  ): Promise<CaptionCue[]> {
    if (signal.aborted) return Promise.reject(abortError());

    const videoId = readYouTubeVideoId(this.host.location.href);
    if (!videoId) return Promise.reject(new Error("YOUTUBE_VIDEO_UNAVAILABLE"));

    return new Promise((resolve, reject) => {
      let settled = false;
      let activeListener: CaptionMessageListener | undefined;
      let activeTimer: ReturnType<typeof globalThis.setTimeout> | undefined;

      const cleanupAttempt = (): void => {
        if (activeListener) this.host.removeEventListener("message", activeListener);
        activeListener = undefined;
        if (activeTimer !== undefined) globalThis.clearTimeout(activeTimer);
        activeTimer = undefined;
      };
      const finish = (action: () => void): void => {
        if (settled) return;
        settled = true;
        cleanupAttempt();
        signal.removeEventListener("abort", onAbort);
        action();
      };
      const onAbort = (): void => finish(() => reject(abortError()));

      const runAttempt = (emptyRetriesRemaining: number): void => {
        if (settled) return;
        if (signal.aborted) {
          onAbort();
          return;
        }

        let request;
        try {
          request = createCaptionRequest(
            `focapt-caption-${++requestSequence}`,
            videoId,
            track,
            language,
          );
        } catch (error) {
          finish(() => reject(error));
          return;
        }

        const listener: CaptionMessageListener = (event) => {
          if (event.source !== this.host) return;
          const response = readCaptionResponse(event.data);
          if (
            !response
            || response.requestId !== request.requestId
            || response.videoId !== videoId
          ) return;

          cleanupAttempt();
          if (!response.ok) {
            finish(() => reject(new Error(response.error)));
            return;
          }
          if (response.cues.length === 0 && emptyRetriesRemaining > 0) {
            runAttempt(emptyRetriesRemaining - 1);
            return;
          }
          finish(() => resolve(response.cues));
        };

        activeListener = listener;
        try {
          this.host.addEventListener("message", listener);
          activeTimer = globalThis.setTimeout(
            () => finish(() => reject(new Error("CAPTION_REQUEST_TIMEOUT"))),
            this.timeoutMs,
          );
          if (signal.aborted) {
            onAbort();
            return;
          }
          this.host.postMessage(request, this.host.location.origin);
        } catch (error) {
          finish(() => reject(error));
        }
      };

      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
      else runAttempt(this.maxEmptyRetries);
    });
  }
}
