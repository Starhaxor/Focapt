import { InferenceClient } from "@huggingface/inference";

import type { CaptionProvider } from "../provider";

const languageMap = {
  en: "eng_Latn",
  tr: "tur_Latn",
  de: "deu_Latn",
  es: "spa_Latn",
  fr: "fra_Latn",
} as const;

type Client = Pick<InferenceClient, "translation" | "automaticSpeechRecognition">;

export class ProviderResponseError extends Error {
  override readonly name = "ProviderResponseError";

  constructor() {
    super("PROVIDER_INVALID_RESPONSE");
  }
}

export class HuggingFaceCaptionProvider implements CaptionProvider {
  private readonly client: Client;
  private readonly timeoutMs: number;

  constructor(
    token: string,
    options: { client?: Client; timeoutMs?: number } = {},
  ) {
    this.client = options.client ?? new InferenceClient(token);
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async translate(texts: string[], source: keyof typeof languageMap, target: keyof typeof languageMap) {
    const signal = AbortSignal.timeout(this.timeoutMs);
    return Promise.all(texts.map(async (text) => {
      const result: unknown = await this.client.translation(
        {
          model: "facebook/nllb-200-distilled-600M",
          inputs: text,
          parameters: {
            src_lang: languageMap[source],
            tgt_lang: languageMap[target],
          },
        },
        { signal },
      );
      if (
        typeof result !== "object" ||
        result === null ||
        !("translation_text" in result) ||
        typeof result.translation_text !== "string"
      ) {
        throw new ProviderResponseError();
      }
      return result.translation_text;
    }));
  }

  async transcribe(audio: Uint8Array, source: keyof typeof languageMap, offsetMs: number) {
    void source;
    const result: unknown = await this.client.automaticSpeechRecognition(
      {
        model: "openai/whisper-large-v3",
        data: Uint8Array.from(audio).buffer,
        parameters: { return_timestamps: true },
      },
      { signal: AbortSignal.timeout(this.timeoutMs) },
    );
    if (typeof result !== "object" || result === null) {
      throw new ProviderResponseError();
    }
    const chunks = "chunks" in result ? result.chunks : undefined;
    if (chunks === undefined) return [];
    if (!Array.isArray(chunks)) throw new ProviderResponseError();

    return chunks.flatMap((chunk, index) => {
      if (
        typeof chunk !== "object" ||
        chunk === null ||
        !("text" in chunk) ||
        typeof chunk.text !== "string" ||
        !("timestamp" in chunk) ||
        !Array.isArray(chunk.timestamp)
      ) {
        throw new ProviderResponseError();
      }
      const start = chunk.timestamp[0];
      const end = chunk.timestamp[1];
      const text = chunk.text.trim();
      if (
        typeof start !== "number" ||
        !Number.isFinite(start) ||
        typeof end !== "number" ||
        !Number.isFinite(end)
      ) {
        throw new ProviderResponseError();
      }
      const startMs = offsetMs + Math.round(start * 1_000);
      const endMs = offsetMs + Math.round(end * 1_000);
      if (!text || !Number.isSafeInteger(startMs) || !Number.isSafeInteger(endMs) || endMs <= startMs) {
        return [];
      }
      return [{ id: `ai-${offsetMs}-${index}`, startMs, endMs, text }];
    });
  }
}
