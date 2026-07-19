import type {
  BilingualCue,
  CaptionCue,
  LanguageCode,
} from "@focapt/contracts/captions";

export type CaptionApiErrorCode =
  | "CAPTION_API_INVALID_BASE_URL"
  | "CAPTION_API_HTTP_ERROR"
  | "CAPTION_API_INVALID_RESPONSE";

export class CaptionApiError extends Error {
  override readonly name = "CaptionApiError";

  constructor(
    readonly code: CaptionApiErrorCode,
    readonly status: number | undefined = undefined,
  ) {
    super(code);
  }
}

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isValidTime = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const isBilingualCue = (value: unknown): value is BilingualCue => {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    isValidTime(value.startMs) &&
    isValidTime(value.endMs) &&
    value.endMs > value.startMs &&
    typeof value.text === "string" &&
    typeof value.translatedText === "string"
  );
};

const readCues = (payload: unknown): BilingualCue[] | null => {
  if (!isRecord(payload) || !Array.isArray(payload.cues)) return null;
  return payload.cues.every(isBilingualCue) ? payload.cues : null;
};

const createTranslateUrl = (baseUrl: string): string => {
  if (baseUrl.includes("?") || baseUrl.includes("#")) {
    throw new CaptionApiError("CAPTION_API_INVALID_BASE_URL");
  }

  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new CaptionApiError("CAPTION_API_INVALID_BASE_URL");
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new CaptionApiError("CAPTION_API_INVALID_BASE_URL");
  }

  return new URL("/v1/translate", url.origin).toString();
};

export class CaptionApi {
  constructor(
    private readonly baseUrl: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async translate(
    cues: CaptionCue[],
    sourceLanguage: LanguageCode,
    targetLanguage: LanguageCode,
    signal?: AbortSignal,
  ): Promise<BilingualCue[]> {
    const response = await this.fetcher(createTranslateUrl(this.baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cues, sourceLanguage, targetLanguage }),
      ...(signal ? { signal } : {}),
    });

    if (!response.ok) {
      throw new CaptionApiError("CAPTION_API_HTTP_ERROR", response.status);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new CaptionApiError("CAPTION_API_INVALID_RESPONSE");
    }

    const translatedCues = readCues(payload);
    if (translatedCues === null) {
      throw new CaptionApiError("CAPTION_API_INVALID_RESPONSE");
    }

    return translatedCues;
  }
}
