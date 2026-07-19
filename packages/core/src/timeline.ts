import type { BilingualCue } from "@focapt/contracts/captions";

const isValidCue = (cue: BilingualCue): boolean =>
  Number.isFinite(cue.startMs) &&
  Number.isFinite(cue.endMs) &&
  cue.startMs >= 0 &&
  cue.endMs > cue.startMs;

export class CaptionTimeline {
  private cues: BilingualCue[] = [];
  private prefixMaxEndMs: number[] = [];

  replace(cues: BilingualCue[]): void {
    this.cues = cues
      .filter(isValidCue)
      .map((cue) => ({ ...cue }))
      .sort((left, right) => left.startMs - right.startMs);

    let maxEndMs = Number.NEGATIVE_INFINITY;
    this.prefixMaxEndMs = this.cues.map((cue) => {
      maxEndMs = Math.max(maxEndMs, cue.endMs);
      return maxEndMs;
    });
  }

  append(cues: BilingualCue[]): void {
    this.replace([...this.cues, ...cues]);
  }

  at(timeMs: number): BilingualCue | null {
    if (!Number.isFinite(timeMs) || timeMs < 0) return null;

    let low = 0;
    let high = this.cues.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (this.cues[mid]!.startMs <= timeMs) low = mid + 1;
      else high = mid;
    }

    for (let index = low - 1; index >= 0; index -= 1) {
      const cue = this.cues[index]!;
      if (timeMs < cue.endMs) return cue;
      if (index === 0 || this.prefixMaxEndMs[index - 1]! <= timeMs) break;
    }

    return null;
  }
}
