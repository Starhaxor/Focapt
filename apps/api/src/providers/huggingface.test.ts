import { expect, it, vi } from "vitest";

import { HuggingFaceCaptionProvider, ProviderResponseError } from "./huggingface";

it("uses NLLB language codes and validates translation text", async () => {
  const translation = vi.fn(async () => ({ translation_text: "Merhaba" }));
  const client = { translation, automaticSpeechRecognition: vi.fn() };
  const provider = new HuggingFaceCaptionProvider("token", { client: client as never });

  await expect(provider.translate(["Hello"], "en", "tr")).resolves.toEqual(["Merhaba"]);
  expect(translation).toHaveBeenCalledWith(
    {
      model: "facebook/nllb-200-distilled-600M",
      inputs: "Hello",
      parameters: { src_lang: "eng_Latn", tgt_lang: "tur_Latn" },
    },
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
});

it("rejects a non-string Hugging Face translation", async () => {
  const client = {
    translation: vi.fn(async () => ({ translation_text: 42 })),
    automaticSpeechRecognition: vi.fn(),
  };
  const provider = new HuggingFaceCaptionProvider("token", { client: client as never });

  await expect(provider.translate(["Hello"], "en", "tr")).rejects.toThrowError(
    ProviderResponseError,
  );
});
