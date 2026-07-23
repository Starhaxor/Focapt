import { describe, expect, it } from "vitest";

import {
  extractCaptionCatalog,
  extractInitialPlayerResponse,
  extractCaptionTracks,
  selectBaseCaptionTrack,
} from "./player-response";
describe("extractInitialPlayerResponse", () => {
  it("YouTube'un globalden kaldirdigi inline player response'u beklenen video icin okur", () => {
    const response = {
      videoDetails: { videoId: "HAG4uyrkVfA", title: "Brace } and quote \" stay valid" },
      captions: { playerCaptionsTracklistRenderer: { captionTracks: [] } },
    };
    const html = `<script>var ytInitialPlayerResponse = ${JSON.stringify(response)};</script>`;

    expect(extractInitialPlayerResponse(html, "HAG4uyrkVfA")).toEqual(response);
    expect(extractInitialPlayerResponse(html, "dJOX0wjjAPQ")).toBeNull();
  });
});

describe("extractCaptionTracks", () => {
  it("extracts the complete translation catalog and default-track fallback", () => {
    const response = { captions: { playerCaptionsTracklistRenderer: {
      captionTracks: [
        { baseUrl: "https://www.youtube.com/api/timedtext?v=1", languageCode: "en", name: { simpleText: "English" }, isTranslatable: true },
        { baseUrl: "https://www.youtube.com/api/timedtext?v=2", languageCode: "de", name: { simpleText: "Deutsch" } }
      ],
      translationLanguages: [
        { languageCode: "tr", languageName: { simpleText: "TÃ¼rkÃ§e" } },
        { languageCode: "zh-Hans", languageName: { simpleText: "ä¸­æ–‡ï¼ˆç®€ä½“ï¼‰" } }
      ],
      defaultAudioTrackIndex: 0
    }}};

    expect(extractCaptionCatalog(response)).toMatchObject({
      tracks: [
        { languageCode: "en", isTranslatable: true, isDefault: true },
        { languageCode: "de", isTranslatable: false, isDefault: false },
      ],
      languages: [
        { languageCode: "tr", label: "TÃ¼rkÃ§e" },
        { languageCode: "zh-Hans", label: "ä¸­æ–‡ï¼ˆç®€ä½“ï¼‰" }
      ]
    });
    expect(selectBaseCaptionTrack(extractCaptionCatalog(response).tracks, "fr")?.languageCode).toBe("en");
  });

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
        isTranslatable: false,
        isDefault: false,
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
        isTranslatable: false,
        isDefault: false,
      },
      {
        baseUrl: "https://youtube.com/captions",
        languageCode: "tr",
        label: "tr",
        isTranslatable: false,
        isDefault: false,
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
        isTranslatable: false,
        isDefault: false,
      },
      {
        baseUrl: "https://youtube.com/captions?lang=tr",
        languageCode: "tr",
        isTranslatable: false,
        isDefault: false,
        label: "Türkçe (auto)",
      },
      {
        baseUrl: "https://youtube.com/captions?lang=de",
        languageCode: "de",
        label: "de",
        isTranslatable: false,
        isDefault: false,
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
