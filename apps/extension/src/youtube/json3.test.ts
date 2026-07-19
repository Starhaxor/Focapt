import { describe, expect, it } from "vitest";

import { parseJson3 } from "./json3";

describe("parseJson3", () => {
  it("segmentleri tek cue metninde birleştirir", () => {
    const cues = parseJson3({
      events: [
        {
          tStartMs: 1000,
          dDurationMs: 2000,
          segs: [{ utf8: "Hello " }, { utf8: "world" }],
        },
      ],
    });

    expect(cues).toEqual([
      {
        id: "yt-1000-3000",
        startMs: 1000,
        endMs: 3000,
        text: "Hello world",
      },
    ]);
  });

  it.each([
    undefined,
    null,
    "caption",
    { events: "not-an-array" },
  ])("geçersiz payload için boş liste döndürür: %j", (payload) => {
    expect(parseJson3(payload)).toEqual([]);
  });

  it.each([
    { tStartMs: -1, dDurationMs: 100, segs: [{ utf8: "negative start" }] },
    { tStartMs: 1, dDurationMs: -1, segs: [{ utf8: "negative duration" }] },
    { tStartMs: 1, dDurationMs: 0, segs: [{ utf8: "zero duration" }] },
    { tStartMs: 0.5, dDurationMs: 100, segs: [{ utf8: "fractional start" }] },
    { tStartMs: 1, dDurationMs: 0.5, segs: [{ utf8: "fractional duration" }] },
    { tStartMs: Number.NaN, dDurationMs: 100, segs: [{ utf8: "nan" }] },
    { tStartMs: 1, dDurationMs: Number.POSITIVE_INFINITY, segs: [{ utf8: "infinite" }] },
    { tStartMs: Number.MAX_SAFE_INTEGER + 1, dDurationMs: 0, segs: [{ utf8: "unsafe start" }] },
    { tStartMs: Number.MAX_SAFE_INTEGER, dDurationMs: 1, segs: [{ utf8: "unsafe end" }] },
    { tStartMs: Number.MAX_VALUE, dDurationMs: Number.MAX_VALUE, segs: [{ utf8: "overflow" }] },
  ])("geçersiz zamanlı event'i atlar: %j", (event) => {
    expect(parseJson3({ events: [event] })).toEqual([]);
  });

  it("boş ve geçersiz segmentleri atlayıp geçerli metni normalize eder", () => {
    expect(
      parseJson3({
        events: [
          {
            tStartMs: 0,
            dDurationMs: 500,
            segs: [null, {}, { utf8: 42 }, { utf8: "  Hello\n" }, { utf8: " world  " }],
          },
          { tStartMs: 500, dDurationMs: 500, segs: [{ utf8: "   " }] },
          { tStartMs: 1000, dDurationMs: 500, segs: "invalid" },
        ],
      }),
    ).toEqual([
      { id: "yt-0-500", startMs: 0, endMs: 500, text: "Hello world" },
    ]);
  });
});
