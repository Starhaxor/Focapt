import type { BilingualCue, CaptionCue } from "@focapt/contracts/captions";

const overlapMs = (left: CaptionCue, right: CaptionCue): number =>
  Math.max(0, Math.min(left.endMs, right.endMs) - Math.max(left.startMs, right.startMs));

function selectTranslation(source: CaptionCue, translated: readonly CaptionCue[]): CaptionCue | undefined {
  const midpoint = source.startMs + (source.endMs - source.startMs) / 2;
  const active = translated.filter((cue) => cue.startMs <= midpoint && midpoint < cue.endMs);
  const candidates = active.length > 0
    ? active
    : translated.filter((cue) => overlapMs(source, cue) > 0);

  return candidates.reduce<CaptionCue | undefined>((best, cue) => {
    if (!best) return cue;
    const cueOverlap = overlapMs(source, cue);
    const bestOverlap = overlapMs(source, best);
    if (cueOverlap !== bestOverlap) return cueOverlap > bestOverlap ? cue : best;
    return cue.startMs < best.startMs ? cue : best;
  }, undefined);
}

export function mergeBilingualCues(
  source: readonly CaptionCue[],
  translated: readonly CaptionCue[],
): BilingualCue[] {
  return source.map((cue) => {
    const translatedCue = selectTranslation(cue, translated);
    const translatedText = translatedCue?.text.trim() || cue.text;
    return { ...cue, translatedText };
  });
}
