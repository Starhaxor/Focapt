import type { LanguageCode } from "./captions";

export type PositionMode = "fixed" | "moving" | "delayed";
export type ThemePreference = "system" | "light" | "dark";

export interface TextStyle {
  color: string;
  fontSizePx: number;
  fontWeight: 400 | 500 | 600 | 700;
}

export interface UserSettings {
  enabled: boolean;
  theme: ThemePreference;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  positionMode: PositionMode;
  delayMs: number;
  pointerOffsetPx: number;
  fixedPosition: { xRatio: number; yRatio: number };
  sourceStyle: TextStyle;
  translationStyle: TextStyle;
  box: { backgroundColor: string; opacity: number; paddingPx: number; radiusPx: number; lineGapPx: number };
  scope: "global" | "site";
  uiLocale: "auto" | "tr" | "en";
}
