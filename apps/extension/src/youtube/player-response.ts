export interface YouTubeCaptionTrack {
  baseUrl: string;
  languageCode: string;
  label: string;
}

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readRecord = (value: unknown, key: string): UnknownRecord | null => {
  if (!isRecord(value)) return null;
  const nested = value[key];
  return isRecord(nested) ? nested : null;
};

const isHttpUrl = (value: string): boolean => {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

const normalizeText = (value: string): string =>
  value.replace(/\s+/g, " ").trim();

const readLabel = (name: unknown, languageCode: string): string => {
  if (!isRecord(name)) return languageCode;

  if (typeof name.simpleText === "string") {
    const simpleText = normalizeText(name.simpleText);
    if (simpleText) return simpleText;
  }

  if (Array.isArray(name.runs)) {
    const runsText = normalizeText(
      name.runs
        .flatMap((run) =>
          isRecord(run) && typeof run.text === "string" ? [run.text] : [],
        )
        .join(""),
    );
    if (runsText) return runsText;
  }

  return languageCode;
};

export function extractCaptionTracks(
  response: unknown,
): YouTubeCaptionTrack[] {
  const captions = readRecord(response, "captions");
  const tracklist = readRecord(captions, "playerCaptionsTracklistRenderer");
  const tracks = tracklist?.captionTracks;
  if (!Array.isArray(tracks)) return [];

  return tracks.flatMap((track): YouTubeCaptionTrack[] => {
    if (!isRecord(track)) return [];

    const baseUrl =
      typeof track.baseUrl === "string" ? track.baseUrl.trim() : "";
    const languageCode =
      typeof track.languageCode === "string"
        ? track.languageCode.trim()
        : "";

    if (!baseUrl || !isHttpUrl(baseUrl) || !languageCode) return [];

    return [
      {
        baseUrl,
        languageCode,
        label: readLabel(track.name, languageCode),
      },
    ];
  });
}
