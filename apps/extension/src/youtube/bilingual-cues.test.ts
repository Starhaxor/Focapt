import { describe, expect, it } from "vitest";

import { mergeBilingualCues } from "./bilingual-cues";

const source = [
  { id: "a", startMs: 0, endMs: 1000, text: "Hello" },
  { id: "b", startMs: 1200, endMs: 2200, text: "World" },
];

describe("mergeBilingualCues", () => {
  it("kaynak kimlik ve zamanlarını koruyup orta noktadaki çeviriyi seçer", () => {
    expect(mergeBilingualCues(source, [
      { id: "t1", startMs: 0, endMs: 1100, text: "Merhaba" },
      { id: "t2", startMs: 1100, endMs: 2300, text: "Dünya" },
    ])).toEqual([
      { ...source[0], translatedText: "Merhaba" },
      { ...source[1], translatedText: "Dünya" },
    ]);
  });

  it("orta noktada cue yoksa en çok örtüşen çeviriyi kullanır", () => {
    const result = mergeBilingualCues([source[0]!], [
      { id: "short", startMs: 0, endMs: 300, text: "Kısa" },
      { id: "long", startMs: 650, endMs: 1000, text: "Uzun" },
    ]);
    expect(result[0]?.translatedText).toBe("Uzun");
  });

  it("çeviri bulunamazsa kaynak metni kullanır", () => {
    expect(mergeBilingualCues(source, [])[0]?.translatedText).toBe("Hello");
  });

  it("kaynak ve hedef dil aynıysa ikinci isteğe gerek bırakmadan kaynak metni kullanır", () => {
    expect(mergeBilingualCues(source, source).map((cue) => cue.translatedText))
      .toEqual(["Hello", "World"]);
  });
});
