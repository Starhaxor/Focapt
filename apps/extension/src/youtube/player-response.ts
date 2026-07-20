import type { LanguageOption } from "@focapt/contracts/captions";
import {
  isYouTubeLanguageCode,
  normalizeLanguageCatalog,
} from "@focapt/core/languages";

export interface YouTubeCaptionTrack {
  baseUrl: string;
  languageCode: string;
  label: string;
  isTranslatable: boolean;
  isDefault: boolean;
}

export interface YouTubeCaptionCatalog {
  tracks: YouTubeCaptionTrack[];
  languages: LanguageOption[];
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

export function extractCaptionCatalog(response: unknown): YouTubeCaptionCatalog {
  const captions = readRecord(response, "captions");
  const tracklist = readRecord(captions, "playerCaptionsTracklistRenderer");
  const captionTracks = tracklist?.captionTracks;
  const defaultAudioTrackIndex = tracklist?.defaultAudioTrackIndex;

  const tracks = Array.isArray(captionTracks)
    ? captionTracks.flatMap((track, index): YouTubeCaptionTrack[] => {
      if (!isRecord(track)) return [];

      const baseUrl =
        typeof track.baseUrl === "string" ? track.baseUrl.trim() : "";
      const languageCode =
        typeof track.languageCode === "string"
          ? track.languageCode.trim()
          : "";

      if (!baseUrl || !isHttpUrl(baseUrl) || !isYouTubeLanguageCode(languageCode)) {
        return [];
      }

      return [
        {
          baseUrl,
          languageCode,
          label: readLabel(track.name, languageCode),
          isTranslatable: track.isTranslatable === true,
          isDefault: index === defaultAudioTrackIndex,
        },
      ];
    })
    : [];

  const translationLanguages = tracklist?.translationLanguages;
  const languages = Array.isArray(translationLanguages)
    ? normalizeLanguageCatalog(translationLanguages.flatMap((language): LanguageOption[] => {
      if (!isRecord(language)) return [];

      const languageCode =
        typeof language.languageCode === "string"
          ? language.languageCode.trim()
          : "";
      if (!isYouTubeLanguageCode(languageCode)) return [];

      return [{
        languageCode,
        label: readLabel(language.languageName, languageCode),
      }];
    }))
    : [];

  return { tracks, languages };
}

export function extractCaptionTracks(response: unknown): YouTubeCaptionTrack[] {
  return extractCaptionCatalog(response).tracks;
}

const baseLanguage = (language: string): string =>
  language.toLowerCase().split(/[-_]/, 1)[0] ?? "";

export function selectBaseCaptionTrack(
  tracks: readonly YouTubeCaptionTrack[],
  selectedLanguage: string,
): YouTubeCaptionTrack | undefined {
  const normalized = selectedLanguage.toLowerCase();
  const selectedBaseLanguage = baseLanguage(selectedLanguage);

  return tracks.find((track) => track.languageCode.toLowerCase() === normalized)
    ?? tracks.find((track) => baseLanguage(track.languageCode) === selectedBaseLanguage)
    ?? tracks.find((track) => track.isDefault)
    ?? tracks[0];
}
