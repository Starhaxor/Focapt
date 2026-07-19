import { describe, expect, it, vi } from "vitest";

import { CaptionApi, CaptionApiError } from "./caption-api";

const sourceCue = { id: "c1", startMs: 0, endMs: 1000, text: "Hello" };
const translatedCue = { ...sourceCue, translatedText: "Merhaba" };

describe("CaptionApi", () => {
  it("çeviri isteğini güvenli URL, JSON header ve beklenen body ile gönderir", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ cues: [translatedCue] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const controller = new AbortController();

    const result = await new CaptionApi(
      "http://localhost:8787/",
      fetcher,
    ).translate([sourceCue], "en", "tr", controller.signal);

    expect(result).toEqual([translatedCue]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("http://localhost:8787/v1/translate");
    expect(init).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
    });
    expect(JSON.parse(init!.body as string)).toEqual({
      cues: [sourceCue],
      sourceLanguage: "en",
      targetLanguage: "tr",
    });
  });

  it("başarısız HTTP yanıtını statülü, locale-bağımsız hata olarak yükseltir", async () => {
    const fetcher = vi.fn(async () => new Response("down", { status: 503 }));

    const failure = new CaptionApi(
      "http://localhost:8787",
      fetcher as typeof fetch,
    ).translate([sourceCue], "en", "tr");

    await expect(failure).rejects.toMatchObject({
      name: "CaptionApiError",
      code: "CAPTION_API_HTTP_ERROR",
      status: 503,
    });
    await expect(failure).rejects.toBeInstanceOf(CaptionApiError);
  });

  it.each([
    ["bozuk JSON", "not-json"],
    ["bozuk kök şekli", JSON.stringify({ cues: "not-an-array" })],
    [
      "bozuk cue şekli",
      JSON.stringify({ cues: [{ ...translatedCue, endMs: Number.NaN }] }),
    ],
    [
      "geçersiz cue aralığı",
      JSON.stringify({ cues: [{ ...translatedCue, endMs: 0 }] }),
    ],
    [
      "güvenli tamsayı sınırını aşan cue zamanı",
      JSON.stringify({
        cues: [{ ...translatedCue, endMs: Number.MAX_SAFE_INTEGER + 1 }],
      }),
    ],
  ])("%s yanıtını locale-bağımsız hata olarak reddeder", async (_case, body) => {
    const fetcher = vi.fn(async () => new Response(body, { status: 200 }));

    await expect(
      new CaptionApi("http://localhost:8787", fetcher as typeof fetch).translate(
        [sourceCue],
        "en",
        "tr",
      ),
    ).rejects.toMatchObject({
      name: "CaptionApiError",
      code: "CAPTION_API_INVALID_RESPONSE",
    });
  });

  it("MAX_SAFE_INTEGER sınırındaki cue zamanını kabul eder", async () => {
    const boundaryCue = {
      ...translatedCue,
      startMs: Number.MAX_SAFE_INTEGER - 1,
      endMs: Number.MAX_SAFE_INTEGER,
    };
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ cues: [boundaryCue] }), { status: 200 }),
    );

    await expect(
      new CaptionApi("https://api.example.com", fetcher as typeof fetch)
        .translate([sourceCue], "en", "tr"),
    ).resolves.toEqual([boundaryCue]);
  });

  it.each([
    "http://localhost:8787",
    "http://localhost:8787/",
    "http://localhost:8787////",
    "http://localhost:8787/nested/base/",
  ])("endpoint'i base URL origininden üretir: %s", async (baseUrl) => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ cues: [] }), { status: 200 }),
    );

    await new CaptionApi(baseUrl, fetcher).translate([], "en", "tr");

    expect(fetcher.mock.calls[0]![0]).toBe(
      "http://localhost:8787/v1/translate",
    );
  });

  it.each([
    "not-a-url",
    "ftp://api.example.com",
    "https://api.example.com?tenant=one",
    "https://api.example.com/?",
    "https://api.example.com/#fragment",
    "https://api.example.com/#",
  ])("geçersiz base URL'yi istek atmadan reddeder: %s", async (baseUrl) => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      new CaptionApi(baseUrl, fetcher).translate([], "en", "tr"),
    ).rejects.toMatchObject({
      name: "CaptionApiError",
      code: "CAPTION_API_INVALID_BASE_URL",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
