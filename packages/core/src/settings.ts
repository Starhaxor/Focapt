import type { LanguageCode } from "@focapt/contracts/captions";
import type { UserSettings } from "@focapt/contracts/settings";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const LANGUAGE_CODES: readonly LanguageCode[] = ["en", "tr", "de", "es", "fr"];
const POSITION_MODES: readonly UserSettings["positionMode"][] = ["fixed", "moving", "delayed"];
const SCOPES: readonly UserSettings["scope"][] = ["global", "site"];
const UI_LOCALES: readonly UserSettings["uiLocale"][] = ["auto", "tr", "en"];
const FONT_WEIGHTS: readonly UserSettings["sourceStyle"]["fontWeight"][] = [400, 500, 600, 700];
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

type UnknownRecord = Record<string, unknown>;

function isPlainObject(value: unknown): value is UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function finiteNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

function allowedValue<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback;
}

function hexColor(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX_COLOR.test(value) ? value : fallback;
}

export const DEFAULT_SETTINGS: UserSettings = {
  sourceLanguage: "en",
  targetLanguage: "tr",
  positionMode: "fixed",
  delayMs: 600,
  pointerOffsetPx: 18,
  fixedPosition: { xRatio: 0.5, yRatio: 0.82 },
  sourceStyle: { color: "#FFFFFF", fontSizePx: 24, fontWeight: 700 },
  translationStyle: { color: "#FFD166", fontSizePx: 18, fontWeight: 500 },
  box: {
    backgroundColor: "#080C14",
    opacity: 0.86,
    paddingPx: 12,
    radiusPx: 8,
    lineGapPx: 4
  },
  scope: "global",
  uiLocale: "auto"
};

export function normalizeSettings(input: unknown): UserSettings {
  const value = isPlainObject(input) ? input : {};
  const fixedPosition = isPlainObject(value.fixedPosition) ? value.fixedPosition : {};
  const sourceStyle = isPlainObject(value.sourceStyle) ? value.sourceStyle : {};
  const translationStyle = isPlainObject(value.translationStyle) ? value.translationStyle : {};
  const box = isPlainObject(value.box) ? value.box : {};

  return {
    sourceLanguage: allowedValue(value.sourceLanguage, LANGUAGE_CODES, DEFAULT_SETTINGS.sourceLanguage),
    targetLanguage: allowedValue(value.targetLanguage, LANGUAGE_CODES, DEFAULT_SETTINGS.targetLanguage),
    positionMode: allowedValue(value.positionMode, POSITION_MODES, DEFAULT_SETTINGS.positionMode),
    delayMs: finiteNumber(value.delayMs, DEFAULT_SETTINGS.delayMs, 0, 3000),
    pointerOffsetPx: finiteNumber(value.pointerOffsetPx, DEFAULT_SETTINGS.pointerOffsetPx, 4, 80),
    fixedPosition: {
      xRatio: finiteNumber(fixedPosition.xRatio, DEFAULT_SETTINGS.fixedPosition.xRatio, 0, 1),
      yRatio: finiteNumber(fixedPosition.yRatio, DEFAULT_SETTINGS.fixedPosition.yRatio, 0, 1)
    },
    sourceStyle: {
      color: hexColor(sourceStyle.color, DEFAULT_SETTINGS.sourceStyle.color),
      fontSizePx: finiteNumber(sourceStyle.fontSizePx, DEFAULT_SETTINGS.sourceStyle.fontSizePx, 12, 48),
      fontWeight: allowedValue(
        sourceStyle.fontWeight,
        FONT_WEIGHTS,
        DEFAULT_SETTINGS.sourceStyle.fontWeight
      )
    },
    translationStyle: {
      color: hexColor(translationStyle.color, DEFAULT_SETTINGS.translationStyle.color),
      fontSizePx: finiteNumber(
        translationStyle.fontSizePx,
        DEFAULT_SETTINGS.translationStyle.fontSizePx,
        12,
        48
      ),
      fontWeight: allowedValue(
        translationStyle.fontWeight,
        FONT_WEIGHTS,
        DEFAULT_SETTINGS.translationStyle.fontWeight
      )
    },
    box: {
      backgroundColor: hexColor(box.backgroundColor, DEFAULT_SETTINGS.box.backgroundColor),
      opacity: finiteNumber(box.opacity, DEFAULT_SETTINGS.box.opacity, 0.2, 1),
      paddingPx: finiteNumber(box.paddingPx, DEFAULT_SETTINGS.box.paddingPx, 4, 32),
      radiusPx: finiteNumber(box.radiusPx, DEFAULT_SETTINGS.box.radiusPx, 0, 32),
      lineGapPx: finiteNumber(box.lineGapPx, DEFAULT_SETTINGS.box.lineGapPx, 0, 24)
    },
    scope: allowedValue(value.scope, SCOPES, DEFAULT_SETTINGS.scope),
    uiLocale: allowedValue(value.uiLocale, UI_LOCALES, DEFAULT_SETTINGS.uiLocale)
  };
}
