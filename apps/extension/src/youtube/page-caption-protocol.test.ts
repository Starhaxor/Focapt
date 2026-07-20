import { describe, expect, it } from "vitest";

import type { YouTubeCaptionTrack } from "./player-response";
import {
  CAPTION_REQUEST_CHANNEL,
  CAPTION_RESPONSE_CHANNEL,
  CATALOG_CHANNEL,
  createCaptionCatalog,
  createCaptionCatalogRequest,
  createCaptionFailure,
  createCaptionRequest,
  createCaptionSuccess,
  createJson3Url,
  readCaptionCatalog,
  readCaptionCatalogRequest,
  readCaptionRequest,
  readCaptionResponse,
} from "./page-caption-protocol";

const track: YouTubeCaptionTrack = {
  baseUrl: "https://www.youtube.com/api/timedtext?v=HAG4uyrkVfA&lang=en&tlang=de&fmt=vtt",
  languageCode: "en",
  label: "English",
  isTranslatable: true,
  isDefault: true,
};

describe("page caption protocol", () => {
  it("uses the stable cross-world channel names", () => {
    expect(CATALOG_CHANNEL).toBe("focapt:youtube-catalog");
    expect(CAPTION_REQUEST_CHANNEL).toBe("focapt:youtube-caption-request");
    expect(CAPTION_RESPONSE_CHANNEL).toBe("focapt:youtube-caption-response");
  });

  it("round-trips a valid caption request", () => {
    const request = createCaptionRequest("req-1", "HAG4uyrkVfA", track, "tr");

    expect(readCaptionRequest(request)).toEqual(request);
  });

  it("rejects invalid languages and non-YouTube timed-text URLs", () => {
    const request = createCaptionRequest("req-1", "HAG4uyrkVfA", track, "tr");
    const invalidUrls = [
      "http://www.youtube.com/api/timedtext?v=1",
      "https://youtube.com/api/timedtext?v=1",
      "https://www.youtube.com.evil.example/api/timedtext?v=1",
      "https://evil.example/api/timedtext?v=1",
      "https://www.youtube.com/watch?v=1",
      "https://user:pass@www.youtube.com/api/timedtext?v=1",
      "https://www.youtube.com:444/api/timedtext?v=1",
    ];

    expect(readCaptionRequest({ ...request, language: "javascript:" })).toBeNull();
    expect(readCaptionRequest({ ...request, videoId: "not a video id" })).toBeNull();
    expect(readCaptionRequest({ ...request, requestId: "" })).toBeNull();
    for (const baseUrl of invalidUrls) {
      expect(readCaptionRequest({ ...request, track: { ...track, baseUrl } })).toBeNull();
    }
  });

  it("forces JSON3 and controls the translation parameter", () => {
    const translated = createJson3Url(track.baseUrl, "zh-Hans");
    expect(translated.origin).toBe("https://www.youtube.com");
    expect(translated.pathname).toBe("/api/timedtext");
    expect(translated.searchParams.get("fmt")).toBe("json3");
    expect(translated.searchParams.get("tlang")).toBe("zh-Hans");

    const raw = createJson3Url(track.baseUrl, null);
    expect(raw.searchParams.get("fmt")).toBe("json3");
    expect(raw.searchParams.has("tlang")).toBe(false);
  });

  it("throws before constructing an unsafe JSON3 URL", () => {
    expect(() => createJson3Url("https://evil.example/api/timedtext", "tr")).toThrow(TypeError);
    expect(() => createJson3Url(track.baseUrl, "javascript:")).toThrow(TypeError);
  });

  it("validates success and failure responses including cue structure", () => {
    const request = createCaptionRequest("req-1", "HAG4uyrkVfA", track, "tr");
    const success = createCaptionSuccess(request, [
      { id: "1", startMs: 0, endMs: 1000, text: "Merhaba" },
    ]);
    const failure = createCaptionFailure(request, "CAPTION_LOAD_FAILED");

    expect(readCaptionResponse(success)).toEqual(success);
    expect(readCaptionResponse(failure)).toEqual(failure);
    expect(readCaptionResponse({ ...success, cues: [{ id: "1", startMs: 1000, endMs: 0, text: "x" }] })).toBeNull();
    expect(readCaptionResponse({ ...failure, error: "UNKNOWN" })).toBeNull();
  });

  it("validates catalog requests and cloned catalog publications", () => {
    const request = createCaptionCatalogRequest();
    const publication = createCaptionCatalog("HAG4uyrkVfA", {
      tracks: [track],
      languages: [{ languageCode: "tr", label: "Türkçe" }],
    });

    expect(readCaptionCatalogRequest(request)).toEqual(request);
    expect(readCaptionCatalog(publication)).toEqual(publication);
    expect(readCaptionCatalog({
      ...publication,
      catalog: { ...publication.catalog, languages: [{ languageCode: "javascript:", label: "bad" }] },
    })).toBeNull();
    expect(readCaptionCatalog({
      ...publication,
      catalog: { ...publication.catalog, tracks: [{ ...track, baseUrl: "https://evil.example/x" }] },
    })).toBeNull();
  });

  it("treats hostile accessors as invalid instead of throwing across the page boundary", () => {
    const hostile = Object.defineProperty({}, "channel", {
      get() {
        throw new Error("hostile getter");
      },
    });

    expect(() => readCaptionRequest(hostile)).not.toThrow();
    expect(readCaptionRequest(hostile)).toBeNull();
    expect(() => readCaptionResponse(hostile)).not.toThrow();
    expect(readCaptionResponse(hostile)).toBeNull();
    expect(() => readCaptionCatalog(hostile)).not.toThrow();
    expect(readCaptionCatalog(hostile)).toBeNull();
    expect(() => readCaptionCatalogRequest(hostile)).not.toThrow();
    expect(readCaptionCatalogRequest(hostile)).toBeNull();
  });

  it("snapshots caption request fields once and returns fresh plain records", () => {
    const expected = createCaptionRequest("req-1", "HAG4uyrkVfA", track, "tr");
    let requestIdReads = 0;
    let baseUrlReads = 0;
    const pageTrack = { ...track };
    Object.defineProperty(pageTrack, "baseUrl", {
      enumerable: true,
      get() {
        baseUrlReads += 1;
        return baseUrlReads === 1 ? track.baseUrl : "https://evil.example/x";
      },
    });
    const pageRequest = { ...expected, track: pageTrack };
    Object.defineProperty(pageRequest, "requestId", {
      enumerable: true,
      get() {
        requestIdReads += 1;
        return requestIdReads === 1 ? "req-1" : "";
      },
    });

    const parsed = readCaptionRequest(pageRequest);
    const requestIdReadsAfterParse = requestIdReads;
    const baseUrlReadsAfterParse = baseUrlReads;

    expect(parsed).toEqual(expected);
    expect(parsed).not.toBe(pageRequest);
    expect(parsed?.track).not.toBe(pageTrack);
    expect(requestIdReadsAfterParse).toBe(1);
    expect(baseUrlReadsAfterParse).toBe(1);
  });

  it("traverses valid cue arrays without invoking page-owned methods", () => {
    const request = createCaptionRequest("req-1", "HAG4uyrkVfA", track, "tr");
    const expected = createCaptionSuccess(request, [
      { id: "1", startMs: 0, endMs: 1000, text: "Merhaba" },
    ]);
    const pageCues = expected.cues.map((cue) => ({ ...cue }));
    Object.defineProperty(pageCues, "map", {
      value: () => { throw new Error("page-owned map called"); },
    });
    Object.defineProperty(pageCues, "some", {
      value: () => { throw new Error("page-owned some called"); },
    });

    const parsed = readCaptionResponse({ ...expected, cues: pageCues });

    expect(parsed).toEqual(expected);
    expect(parsed && parsed.ok ? parsed.cues : null).not.toBe(pageCues);
    expect(parsed && parsed.ok ? parsed.cues[0] : null).not.toBe(pageCues[0]);
  });

  it("rejects malformed cues even when page-owned array methods try to hide them", () => {
    const request = createCaptionRequest("req-1", "HAG4uyrkVfA", track, "tr");
    const malformedCues = [{ id: "1", startMs: 1000, endMs: 0, text: "bad" }];
    Object.defineProperty(malformedCues, "map", {
      value: () => [{ id: "1", startMs: 0, endMs: 1000, text: "forged" }],
    });

    expect(readCaptionResponse({
      channel: CAPTION_RESPONSE_CHANNEL,
      requestId: request.requestId,
      videoId: request.videoId,
      ok: true,
      cues: malformedCues,
    })).toBeNull();
  });

  it("snapshots cue fields once before validating and copying", () => {
    let textReads = 0;
    const pageCue = {
      id: "1",
      startMs: 0,
      endMs: 1000,
      get text() {
        textReads += 1;
        return textReads === 1 ? "Merhaba" : 42;
      },
    };

    const parsed = readCaptionResponse({
      channel: CAPTION_RESPONSE_CHANNEL,
      requestId: "req-1",
      videoId: "HAG4uyrkVfA",
      ok: true,
      cues: [pageCue],
    });

    expect(parsed).toEqual({
      channel: CAPTION_RESPONSE_CHANNEL,
      requestId: "req-1",
      videoId: "HAG4uyrkVfA",
      ok: true,
      cues: [{ id: "1", startMs: 0, endMs: 1000, text: "Merhaba" }],
    });
    expect(textReads).toBe(1);
  });

  it("traverses valid catalog arrays without page-owned methods and copies every record", () => {
    const expected = createCaptionCatalog("HAG4uyrkVfA", {
      tracks: [track],
      languages: [{ languageCode: "tr", label: "Türkçe" }],
    });
    const pageTracks = expected.catalog.tracks.map((item) => ({ ...item }));
    const pageLanguages = expected.catalog.languages.map((item) => ({ ...item }));
    for (const array of [pageTracks, pageLanguages]) {
      Object.defineProperty(array, "map", {
        value: () => { throw new Error("page-owned map called"); },
      });
      Object.defineProperty(array, "some", {
        value: () => { throw new Error("page-owned some called"); },
      });
    }

    const parsed = readCaptionCatalog({
      ...expected,
      catalog: { tracks: pageTracks, languages: pageLanguages },
    });

    expect(parsed).toEqual(expected);
    expect(parsed?.catalog.tracks).not.toBe(pageTracks);
    expect(parsed?.catalog.tracks[0]).not.toBe(pageTracks[0]);
    expect(parsed?.catalog.languages).not.toBe(pageLanguages);
    expect(parsed?.catalog.languages[0]).not.toBe(pageLanguages[0]);
  });

  it("rejects malformed catalog items even when page-owned methods forge valid ones", () => {
    const malformedTracks = [{ ...track, baseUrl: "https://evil.example/x" }];
    const malformedLanguages = [{ languageCode: "javascript:", label: "bad" }];
    Object.defineProperty(malformedTracks, "map", { value: () => [{ ...track }] });
    Object.defineProperty(malformedLanguages, "map", {
      value: () => [{ languageCode: "tr", label: "Türkçe" }],
    });

    expect(readCaptionCatalog({
      channel: CATALOG_CHANNEL,
      type: "catalog",
      videoId: "HAG4uyrkVfA",
      catalog: { tracks: malformedTracks, languages: malformedLanguages },
    })).toBeNull();
  });
});
