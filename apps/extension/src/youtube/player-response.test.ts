import { describe, expect, it } from "vitest";

import { extractCaptionTracks } from "./player-response";

describe("extractCaptionTracks", () => {
  it("player response içinden geçerli caption track alanlarını çıkarır", () => {
    const response = {
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [
            {
              baseUrl: "https://www.youtube.com/api/timedtext?v=1",
              languageCode: "en",
              name: { simpleText: "English" },
              extra: "ignored",
            },
            { languageCode: "tr" },
          ],
        },
      },
    };

    expect(extractCaptionTracks(response)).toEqual([
      {
        baseUrl: "https://www.youtube.com/api/timedtext?v=1",
        languageCode: "en",
        label: "English",
      },
    ]);
  });

  it("yalnız mutlak HTTP ve HTTPS caption URL'lerini kabul eder", () => {
    const captionTracks = [
      { baseUrl: "http://youtube.com/captions", languageCode: "en" },
      { baseUrl: "https://youtube.com/captions", languageCode: "tr" },
      { baseUrl: "javascript:alert(1)", languageCode: "de" },
      { baseUrl: "/api/timedtext", languageCode: "es" },
      { baseUrl: "not a url", languageCode: "fr" },
    ];

    expect(
      extractCaptionTracks({
        captions: { playerCaptionsTracklistRenderer: { captionTracks } },
      }),
    ).toEqual([
      {
        baseUrl: "http://youtube.com/captions",
        languageCode: "en",
        label: "en",
      },
      {
        baseUrl: "https://youtube.com/captions",
        languageCode: "tr",
        label: "tr",
      },
    ]);
  });

  it("etiketi simpleText, runs ve dil kodu sırasıyla çözer", () => {
    const captionTracks = [
      {
        baseUrl: "https://youtube.com/captions?lang=en",
        languageCode: "en",
        name: { simpleText: " English " },
      },
      {
        baseUrl: "https://youtube.com/captions?lang=tr",
        languageCode: "tr",
        name: { runs: [{ text: "Türkçe" }, {}, { text: " (auto)" }] },
      },
      {
        baseUrl: "https://youtube.com/captions?lang=de",
        languageCode: "de",
        name: { simpleText: "  ", runs: [{ text: " " }] },
      },
    ];

    expect(
      extractCaptionTracks({
        captions: { playerCaptionsTracklistRenderer: { captionTracks } },
      }),
    ).toEqual([
      {
        baseUrl: "https://youtube.com/captions?lang=en",
        languageCode: "en",
        label: "English",
      },
      {
        baseUrl: "https://youtube.com/captions?lang=tr",
        languageCode: "tr",
        label: "Türkçe (auto)",
      },
      {
        baseUrl: "https://youtube.com/captions?lang=de",
        languageCode: "de",
        label: "de",
      },
    ]);
  });

  it.each([undefined, null, [], {}, { captions: "invalid" }])(
    "geçersiz response için boş liste döndürür: %j",
    (response) => {
      expect(extractCaptionTracks(response)).toEqual([]);
    },
  );

  it("boş dil kodlu veya record olmayan track'leri atlar", () => {
    const captionTracks = [
      null,
      "track",
      { baseUrl: "https://youtube.com/captions", languageCode: " " },
      { baseUrl: "https://youtube.com/captions", languageCode: 123 },
    ];

    expect(
      extractCaptionTracks({
        captions: { playerCaptionsTracklistRenderer: { captionTracks } },
      }),
    ).toEqual([]);
  });
});
