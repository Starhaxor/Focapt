import type { CaptionCue, LanguageOption } from "@focapt/contracts/captions";
import { isYouTubeLanguageCode } from "@focapt/core/languages";

import type {
  YouTubeCaptionCatalog,
  YouTubeCaptionTrack,
} from "./player-response";
import { isYouTubeVideoId } from "./youtube-url";

export const CATALOG_CHANNEL = "focapt:youtube-catalog";
export const CAPTION_REQUEST_CHANNEL = "focapt:youtube-caption-request";
export const CAPTION_RESPONSE_CHANNEL = "focapt:youtube-caption-response";

export interface CaptionCatalogRequest {
  channel: typeof CATALOG_CHANNEL;
  type: "request";
}

export interface CaptionCatalogMessage {
  channel: typeof CATALOG_CHANNEL;
  type: "catalog";
  videoId: string;
  catalog: YouTubeCaptionCatalog;
}

export interface CaptionPageRequest {
  channel: typeof CAPTION_REQUEST_CHANNEL;
  requestId: string;
  videoId: string;
  track: YouTubeCaptionTrack;
  language: string | null;
}

export interface CaptionPageSuccess {
  channel: typeof CAPTION_RESPONSE_CHANNEL;
  requestId: string;
  videoId: string;
  ok: true;
  cues: CaptionCue[];
}

export interface CaptionPageFailure {
  channel: typeof CAPTION_RESPONSE_CHANNEL;
  requestId: string;
  videoId: string;
  ok: false;
  error: "CAPTION_LOAD_FAILED";
}

export type CaptionPageResponse = CaptionPageSuccess | CaptionPageFailure;

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isRequestId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 128;

const MAX_CATALOG_ITEMS = 1_000;
const MAX_CAPTION_CUES = 100_000;

const isYouTubeTimedTextUrl = (value: unknown): value is string => {
  if (typeof value !== "string") return false;

  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname.toLowerCase().endsWith(".youtube.com")
      && url.pathname === "/api/timedtext"
      && url.username === ""
      && url.password === ""
      && url.port === "";
  } catch {
    return false;
  }
};

const readTrack = (value: unknown): YouTubeCaptionTrack | null => {
  if (!isRecord(value)) return null;
  const baseUrl = value.baseUrl;
  const languageCode = value.languageCode;
  const label = value.label;
  const isTranslatable = value.isTranslatable;
  const isDefault = value.isDefault;
  if (
    !isYouTubeTimedTextUrl(baseUrl)
    || !isYouTubeLanguageCode(languageCode)
    || typeof label !== "string"
    || typeof isTranslatable !== "boolean"
    || typeof isDefault !== "boolean"
  ) return null;

  return {
    baseUrl,
    languageCode,
    label,
    isTranslatable,
    isDefault,
  };
};

const readLanguageOption = (value: unknown): LanguageOption | null => {
  if (!isRecord(value)) return null;
  const languageCode = value.languageCode;
  const label = value.label;
  if (
    !isYouTubeLanguageCode(languageCode)
    || typeof label !== "string"
  ) return null;

  return { languageCode, label };
};

const readCue = (value: unknown): CaptionCue | null => {
  if (!isRecord(value)) return null;
  const id = value.id;
  const startMs = value.startMs;
  const endMs = value.endMs;
  const text = value.text;
  if (
    typeof id !== "string"
    || id.length === 0
    || typeof startMs !== "number"
    || !Number.isSafeInteger(startMs)
    || startMs < 0
    || typeof endMs !== "number"
    || !Number.isSafeInteger(endMs)
    || endMs <= startMs
    || typeof text !== "string"
  ) return null;

  return {
    id,
    startMs,
    endMs,
    text,
  };
};

const readArray = <T>(
  value: unknown,
  maximumLength: number,
  readItem: (item: unknown) => T | null,
): T[] | null => {
  if (!Array.isArray(value)) return null;
  const length = value.length;
  if (!Number.isSafeInteger(length) || length < 0 || length > maximumLength) return null;

  const result: T[] = [];
  for (let index = 0; index < length; index += 1) {
    const item = value[index];
    const parsed = readItem(item);
    if (parsed === null) return null;
    result[index] = parsed;
  }
  return result;
};

const readCatalog = (value: unknown): YouTubeCaptionCatalog | null => {
  if (!isRecord(value)) return null;
  const trackValues = value.tracks;
  const languageValues = value.languages;
  const tracks = readArray(trackValues, MAX_CATALOG_ITEMS, readTrack);
  const languages = readArray(languageValues, MAX_CATALOG_ITEMS, readLanguageOption);
  if (tracks === null || languages === null) return null;

  return { tracks, languages };
};

export function createJson3Url(baseUrl: string, language: string | null): URL {
  if (!isYouTubeTimedTextUrl(baseUrl) || (language !== null && !isYouTubeLanguageCode(language))) {
    throw new TypeError("Invalid YouTube timed-text request");
  }

  const url = new URL(baseUrl);
  url.hash = "";
  url.searchParams.set("fmt", "json3");
  if (language === null) url.searchParams.delete("tlang");
  else url.searchParams.set("tlang", language);
  return url;
}

export function createCaptionCatalogRequest(): CaptionCatalogRequest {
  return { channel: CATALOG_CHANNEL, type: "request" };
}

export function readCaptionCatalogRequest(value: unknown): CaptionCatalogRequest | null {
  try {
    if (!isRecord(value)) return null;
    const channel = value.channel;
    const type = value.type;
    if (channel !== CATALOG_CHANNEL || type !== "request") {
      return null;
    }
    return createCaptionCatalogRequest();
  } catch {
    return null;
  }
}

export function createCaptionCatalog(
  videoId: string,
  catalog: YouTubeCaptionCatalog,
): CaptionCatalogMessage {
  const message = {
    channel: CATALOG_CHANNEL,
    type: "catalog",
    videoId,
    catalog,
  } satisfies CaptionCatalogMessage;
  const validated = readCaptionCatalog(message);
  if (!validated) throw new TypeError("Invalid YouTube caption catalog");
  return validated;
}

export function readCaptionCatalog(value: unknown): CaptionCatalogMessage | null {
  try {
    if (!isRecord(value)) return null;
    const channel = value.channel;
    const type = value.type;
    const videoId = value.videoId;
    const catalogValue = value.catalog;
    if (
      channel !== CATALOG_CHANNEL
      || type !== "catalog"
      || !isYouTubeVideoId(videoId)
    ) return null;

    const catalog = readCatalog(catalogValue);
    return catalog
      ? { channel: CATALOG_CHANNEL, type: "catalog", videoId, catalog }
      : null;
  } catch {
    return null;
  }
}

export function createCaptionRequest(
  requestId: string,
  videoId: string,
  track: YouTubeCaptionTrack,
  language: string | null,
): CaptionPageRequest {
  const request = {
    channel: CAPTION_REQUEST_CHANNEL,
    requestId,
    videoId,
    track,
    language,
  } satisfies CaptionPageRequest;
  const validated = readCaptionRequest(request);
  if (!validated) throw new TypeError("Invalid YouTube caption request");
  return validated;
}

export function readCaptionRequest(value: unknown): CaptionPageRequest | null {
  try {
    if (!isRecord(value)) return null;
    const channel = value.channel;
    const requestId = value.requestId;
    const videoId = value.videoId;
    const language = value.language;
    const trackValue = value.track;
    if (
      channel !== CAPTION_REQUEST_CHANNEL
      || !isRequestId(requestId)
      || !isYouTubeVideoId(videoId)
      || (language !== null && !isYouTubeLanguageCode(language))
    ) return null;

    const track = readTrack(trackValue);
    return track
      ? {
        channel: CAPTION_REQUEST_CHANNEL,
        requestId,
        videoId,
        track,
        language,
      }
      : null;
  } catch {
    return null;
  }
}

export function createCaptionSuccess(
  request: CaptionPageRequest,
  cues: readonly CaptionCue[],
): CaptionPageSuccess {
  const response = {
    channel: CAPTION_RESPONSE_CHANNEL,
    requestId: request.requestId,
    videoId: request.videoId,
    ok: true,
    cues,
  };
  const validated = readCaptionResponse(response);
  if (!validated || !validated.ok) throw new TypeError("Invalid caption success response");
  return validated;
}

export function createCaptionFailure(
  request: CaptionPageRequest,
  error: CaptionPageFailure["error"],
): CaptionPageFailure {
  return {
    channel: CAPTION_RESPONSE_CHANNEL,
    requestId: request.requestId,
    videoId: request.videoId,
    ok: false,
    error,
  };
}

export function readCaptionResponse(value: unknown): CaptionPageResponse | null {
  try {
    if (!isRecord(value)) return null;
    const channel = value.channel;
    const requestId = value.requestId;
    const videoId = value.videoId;
    const ok = value.ok;
    const error = value.error;
    const cueValues = value.cues;
    if (
      channel !== CAPTION_RESPONSE_CHANNEL
      || !isRequestId(requestId)
      || !isYouTubeVideoId(videoId)
    ) return null;

    if (ok === false) {
      return error === "CAPTION_LOAD_FAILED"
        ? {
          channel: CAPTION_RESPONSE_CHANNEL,
          requestId,
          videoId,
          ok: false,
          error,
        }
        : null;
    }

    if (ok !== true) return null;
    const cues = readArray(cueValues, MAX_CAPTION_CUES, readCue);
    if (cues === null) return null;
    return {
      channel: CAPTION_RESPONSE_CHANNEL,
      requestId,
      videoId,
      ok: true,
      cues,
    };
  } catch {
    return null;
  }
}
