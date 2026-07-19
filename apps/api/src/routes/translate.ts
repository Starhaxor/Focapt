import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { CaptionProvider } from "../provider";

const language = z.enum(["en", "tr", "de", "es", "fr"]);
const cue = z.object({
  id: z.string().min(1).max(128).refine((id) => id.trim().length > 0),
  startMs: z.number().safe().int().nonnegative(),
  endMs: z.number().safe().int().positive(),
  text: z.string().min(1).max(2_000),
}).strict().refine((value) => value.endMs > value.startMs, {
  path: ["endMs"],
});
const body = z.object({
  sourceLanguage: language,
  targetLanguage: language,
  cues: z.array(cue).min(1).max(100),
}).strict().refine(
  (value) => new Set(value.cues.map((item) => item.id)).size === value.cues.length,
  { path: ["cues"] },
);

const validTranslations = (value: unknown, count: number): value is string[] =>
  Array.isArray(value) &&
  value.length === count &&
  value.every((translation) => typeof translation === "string");

export async function registerTranslate(
  server: FastifyInstance,
  provider: CaptionProvider,
): Promise<void> {
  server.post(
    "/v1/translate",
    { bodyLimit: 256 * 1024 },
    async (request, reply) => {
      const parsed = body.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_request" });
      }

      const { cues, sourceLanguage, targetLanguage } = parsed.data;
      if (sourceLanguage === targetLanguage) {
        return {
          cues: cues.map((item) => ({ ...item, translatedText: item.text })),
        };
      }

      let translations: unknown;
      try {
        translations = await provider.translate(
          cues.map((item) => item.text),
          sourceLanguage,
          targetLanguage,
        );
      } catch {
        return reply.code(502).send({ error: "translation_provider_failed" });
      }

      if (!validTranslations(translations, cues.length)) {
        return reply
          .code(502)
          .send({ error: "translation_provider_invalid_response" });
      }

      return {
        cues: cues.map((item, index) => ({
          ...item,
          translatedText: translations[index]!,
        })),
      };
    },
  );
}
