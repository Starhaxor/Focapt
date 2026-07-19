import type { CaptionCue, LanguageCode } from "@focapt/contracts/captions";
import type { FastifyInstance } from "fastify";

import type { CaptionProvider } from "../provider";

const languages = new Set<LanguageCode>(["en", "tr", "de", "es", "fr"]);
const allowedMediaTypes = new Set(["audio/webm", "audio/ogg", "audio/mp4"]);

type MultipartField = { value?: unknown };

const readField = (
  fields: Record<string, MultipartField | MultipartField[] | undefined>,
  name: string,
): unknown => {
  const field = fields[name];
  return Array.isArray(field) ? field[0]?.value : field?.value;
};

const validCue = (value: CaptionCue): boolean =>
  typeof value?.id === "string" &&
  value.id.trim().length > 0 &&
  Number.isSafeInteger(value.startMs) &&
  value.startMs >= 0 &&
  Number.isSafeInteger(value.endMs) &&
  value.endMs > value.startMs &&
  typeof value.text === "string" &&
  value.text.length > 0 &&
  value.text.length <= 2_000;

const validCues = (value: unknown): value is CaptionCue[] =>
  Array.isArray(value) &&
  value.length <= 100 &&
  value.every(validCue) &&
  new Set(value.map((item) => item.id)).size === value.length;

export async function registerTranscribe(
  server: FastifyInstance,
  provider: CaptionProvider,
): Promise<void> {
  server.post("/v1/transcribe", async (request, reply) => {
    let part;
    try {
      part = await request.file({ limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
    } catch {
      return reply.code(400).send({ error: "unsupported_audio" });
    }

    if (!part || !allowedMediaTypes.has(part.mimetype)) {
      return reply.code(400).send({ error: "unsupported_audio" });
    }

    let buffer: Buffer;
    try {
      buffer = await part.toBuffer();
    } catch (error) {
      if (part.file.truncated) {
        return reply.code(413).send({ error: "audio_too_large" });
      }
      return reply.code(400).send({ error: "invalid_request" });
    }
    if (part.file.truncated) {
      return reply.code(413).send({ error: "audio_too_large" });
    }

    const fields = part.fields as Record<
      string,
      MultipartField | MultipartField[] | undefined
    >;
    const source = readField(fields, "sourceLanguage");
    const offset = readField(fields, "offsetMs");
    const offsetMs = typeof offset === "string" ? Number(offset) : Number.NaN;
    if (
      typeof source !== "string" ||
      !languages.has(source as LanguageCode) ||
      !Number.isSafeInteger(offsetMs) ||
      offsetMs < 0
    ) {
      return reply.code(400).send({ error: "invalid_request" });
    }

    let cues: unknown;
    try {
      cues = await provider.transcribe(
        new Uint8Array(buffer),
        source as LanguageCode,
        offsetMs,
      );
    } catch {
      return reply.code(502).send({ error: "transcription_provider_failed" });
    }

    if (!validCues(cues)) {
      return reply
        .code(502)
        .send({ error: "transcription_provider_invalid_response" });
    }
    return { cues };
  });
}
