import { describe, expect, it, vi } from "vitest";

import {
  YouTubeCaptionSource,
  YouTubeCaptionSourceError,
} from "./caption-source";

const track = {
  baseUrl: "https://www.youtube.com/api/timedtext?v=1&lang=en&fmt=vtt",
  languageCode: "en",
  label: "English",
};

const json3Payload = {
  events: [
    {
      tStartMs: 0,
      dDurationMs: 1000,
      segs: [{ utf8: "Hello" }],
    },
  ],
};

describe("YouTubeCaptionSource", () => {
  it("track URL parametrelerini koruyup fmt=json3 olarak yükler", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify(json3Payload), { status: 200 }),
    );
    const controller = new AbortController();

    const cues = await new YouTubeCaptionSource(fetcher).load(
      track,
      controller.signal,
    );

    const [input, init] = fetcher.mock.calls[0]!;
    const requestedUrl = new URL(String(input));
    expect(requestedUrl.searchParams.get("v")).toBe("1");
    expect(requestedUrl.searchParams.get("lang")).toBe("en");
    expect(requestedUrl.searchParams.get("fmt")).toBe("json3");
    expect(init).toMatchObject({ signal: controller.signal });
    expect(cues).toEqual([
      { id: "yt-0-1000", startMs: 0, endMs: 1000, text: "Hello" },
    ]);
  });

  it.each([
    "file:///captions",
    "javascript:alert(1)",
    "not-a-url",
    "http://www.youtube.com/api/timedtext?v=1",
    "https://localhost/api/timedtext?v=1",
    "https://example.com/api/timedtext?v=1",
    "https://youtube.com.example.com/api/timedtext?v=1",
    "https://www.youtube.com/not-timedtext?v=1",
    "https://www.youtube.com/api/timedtext/",
  ])(
    "allowlist dışındaki track URL'sini istek atmadan reddeder: %s",
    async (baseUrl) => {
      const fetcher = vi.fn<typeof fetch>();

      await expect(
        new YouTubeCaptionSource(fetcher).load({ ...track, baseUrl }),
      ).rejects.toMatchObject({
        name: "YouTubeCaptionSourceError",
        code: "YOUTUBE_CAPTION_INVALID_URL",
      });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("başarısız HTTP yanıtını statülü, locale-bağımsız hata olarak yükseltir", async () => {
    const fetcher = vi.fn(async () => new Response("down", { status: 429 }));

    const failure = new YouTubeCaptionSource(fetcher as typeof fetch).load(track);

    await expect(failure).rejects.toMatchObject({
      name: "YouTubeCaptionSourceError",
      code: "YOUTUBE_CAPTION_HTTP_ERROR",
      status: 429,
    });
    await expect(failure).rejects.toBeInstanceOf(YouTubeCaptionSourceError);
  });

  it.each([
    ["bozuk JSON", "not-json"],
    ["bozuk kök şekli", JSON.stringify({ events: "not-an-array" })],
  ])("%s yanıtını locale-bağımsız hata olarak reddeder", async (_case, body) => {
    const fetcher = vi.fn(async () => new Response(body, { status: 200 }));

    await expect(
      new YouTubeCaptionSource(fetcher as typeof fetch).load(track),
    ).rejects.toMatchObject({
      name: "YouTubeCaptionSourceError",
      code: "YOUTUBE_CAPTION_INVALID_RESPONSE",
    });
  });

  it("karışık bozuk event ve segmentleri atıp geçerli cue'ları korur", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          events: [
            null,
            { tStartMs: "zero" },
            {
              tStartMs: 0,
              dDurationMs: 1000,
              segs: [null, { utf8: 42 }, { utf8: "Hello" }],
            },
          ],
        }),
        { status: 200 },
      ),
    );

    await expect(
      new YouTubeCaptionSource(fetcher as typeof fetch).load(track),
    ).resolves.toEqual([
      { id: "yt-0-1000", startMs: 0, endMs: 1000, text: "Hello" },
    ]);
  });
});
