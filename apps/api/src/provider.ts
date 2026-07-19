import type { CaptionCue, LanguageCode } from "@focapt/contracts/captions";

export interface CaptionProvider {
  translate(
    texts: string[],
    source: LanguageCode,
    target: LanguageCode,
  ): Promise<string[]>;
  transcribe(
    audio: Uint8Array,
    source: LanguageCode,
    offsetMs: number,
  ): Promise<CaptionCue[]>;
}
