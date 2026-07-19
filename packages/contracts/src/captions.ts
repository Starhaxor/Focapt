export type LanguageCode = "en" | "tr" | "de" | "es" | "fr";

export interface CaptionCue {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
}

export interface BilingualCue extends CaptionCue {
  translatedText: string;
}

export const isCueActive = (cue: CaptionCue, timeMs: number): boolean =>
  cue.startMs <= timeMs && timeMs < cue.endMs;

export type RuntimeMessage =
  | { type: "START_AI_CAPTURE"; tabId?: number; sourceLanguage: LanguageCode; targetLanguage: LanguageCode; videoTimeMs: number }
  | { type: "STOP_AI_CAPTURE" }
  | { type: "VIDEO_CLOCK"; videoTimeMs: number; paused: boolean; playbackRate: number }
  | { type: "AI_CUES"; cues: BilingualCue[] }
  | { type: "CAPTURE_ERROR"; messageKey: "serviceUnavailable" }
  | { type: "SETTINGS_UPDATED"; settings: import("./settings").UserSettings }
  | { type: "OFFSCREEN_START"; target: "offscreen"; streamId: string; sourceLanguage: LanguageCode; targetLanguage: LanguageCode; videoTimeMs: number }
  | { type: "OFFSCREEN_STOP"; target: "offscreen" };
