import type { CaptionCue } from "@focapt/contracts/captions";

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isValidTime = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const readText = (segments: unknown): string | null => {
  if (!Array.isArray(segments)) return null;

  const text = segments
    .flatMap((segment) =>
      isRecord(segment) && typeof segment.utf8 === "string"
        ? [segment.utf8]
        : [],
    )
    .join("")
    .replace(/\s+/g, " ")
    .trim();

  return text || null;
};

export function parseJson3(payload: unknown): CaptionCue[] {
  if (!isRecord(payload) || !Array.isArray(payload.events)) return [];

  return payload.events.flatMap((event): CaptionCue[] => {
    if (!isRecord(event)) return [];

    const { tStartMs, dDurationMs } = event;
    if (
      !isValidTime(tStartMs) ||
      !isValidTime(dDurationMs) ||
      dDurationMs === 0
    ) return [];

    const endMs = tStartMs + dDurationMs;
    if (!Number.isSafeInteger(endMs)) return [];

    const text = readText(event.segs);
    if (text === null) return [];

    return [
      {
        id: `yt-${tStartMs}-${endMs}`,
        startMs: tStartMs,
        endMs,
        text,
      },
    ];
  });
}
