import { parseJson3 } from "./json3";
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
