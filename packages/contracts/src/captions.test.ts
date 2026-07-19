import { describe, expect, it } from "vitest";
import { isCueActive } from "./captions";

describe("isCueActive", () => {
  it("başlangıç dahil, bitiş hariç zaman aralığını kullanır", () => {
    const cue = { id: "c1", startMs: 1000, endMs: 2000, text: "Hello" };
    expect(isCueActive(cue, 1000)).toBe(true);
    expect(isCueActive(cue, 1999)).toBe(true);
    expect(isCueActive(cue, 2000)).toBe(false);
  });
});
