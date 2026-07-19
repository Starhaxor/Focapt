import type { CaptionCue, LanguageCode } from "@focapt/contracts/captions";

import { parseJson3 } from "./json3";
import type { YouTubeCaptionTrack } from "./player-response";

export type YouTubeCaptionSourceErrorCode =
  | "YOUTUBE_CAPTION_INVALID_URL"
  | "YOUTUBE_CAPTION_HTTP_ERROR"
  | "YOUTUBE_CAPTION_INVALID_RESPONSE";

export class YouTubeCaptionSourceError extends Error {
  override readonly name = "YouTubeCaptionSourceError";

  constructor(
    readonly code: YouTubeCaptionSourceErrorCode,
    readonly status: number | undefined = undefined,
  ) {
    super(code);
  }
}

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isJson3Payload = (
  value: unknown,
): value is UnknownRecord & { events: unknown[] } =>
  isRecord(value) && Array.isArray(value.events);

const isYouTubeHostname = (hostname: string): boolean =>
  hostname === "youtube.com" || hostname.endsWith(".youtube.com");

const createJson3Url = (baseUrl: string, targetLanguage?: LanguageCode): URL => {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new YouTubeCaptionSourceError("YOUTUBE_CAPTION_INVALID_URL");
  }

  if (
    url.protocol !== "https:" ||
    !isYouTubeHostname(url.hostname) ||
    url.pathname !== "/api/timedtext"
  ) {
    throw new YouTubeCaptionSourceError("YOUTUBE_CAPTION_INVALID_URL");
  }

  url.searchParams.set("fmt", "json3");
  if (targetLanguage) url.searchParams.set("tlang", targetLanguage);
  else url.searchParams.delete("tlang");
  return url;
};

export class YouTubeCaptionSource {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async load(
    track: YouTubeCaptionTrack,
    signal?: AbortSignal,
  ): Promise<CaptionCue[]> {
    return this.loadUrl(createJson3Url(track.baseUrl), signal);
  }

  async loadTranslated(
    track: YouTubeCaptionTrack,
    targetLanguage: LanguageCode,
    signal?: AbortSignal,
  ): Promise<CaptionCue[]> {
    return this.loadUrl(createJson3Url(track.baseUrl, targetLanguage), signal);
  }

  private async loadUrl(url: URL, signal?: AbortSignal): Promise<CaptionCue[]> {
    const response = await this.fetcher(url, signal ? { signal } : undefined);

    if (!response.ok) {
      throw new YouTubeCaptionSourceError(
        "YOUTUBE_CAPTION_HTTP_ERROR",
        response.status,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new YouTubeCaptionSourceError("YOUTUBE_CAPTION_INVALID_RESPONSE");
    }

    if (!isJson3Payload(payload)) {
      throw new YouTubeCaptionSourceError("YOUTUBE_CAPTION_INVALID_RESPONSE");
    }

    return parseJson3(payload);
  }
}
