import { describe, expect, it } from "vitest";

import { CaptionTimeline } from "./timeline";

const cue = (
  id: string,
  startMs: number,
  endMs: number,
) => ({ id, startMs, endMs, text: id, translatedText: `${id}-translated` });

describe("CaptionTimeline", () => {
  it("ileri ve geri sarmada doğru cue'yu seçer", () => {
    const timeline = new CaptionTimeline();
    timeline.replace([cue("a", 0, 1000), cue("b", 2000, 3000)]);

    expect(timeline.at(2500)?.id).toBe("b");
    expect(timeline.at(500)?.id).toBe("a");
    expect(timeline.at(1500)).toBeNull();
  });

  it("başlangıcı dahil, bitişi hariç tutar", () => {
    const timeline = new CaptionTimeline();
    timeline.replace([cue("a", 1000, 2000)]);

    expect(timeline.at(1000)?.id).toBe("a");
    expect(timeline.at(2000)).toBeNull();
  });

  it("çakışan cue'larda en son başlayan aktif cue'yu seçer", () => {
    const timeline = new CaptionTimeline();
    timeline.replace([
      cue("long", 0, 5000),
      cue("expired", 3000, 3500),
      cue("latest-active", 2000, 4500),
    ]);

    expect(timeline.at(4000)?.id).toBe("latest-active");
  });

  it("aynı başlangıçtaki aktif cue'larda son girdiyi deterministik seçer", () => {
    const timeline = new CaptionTimeline();
    timeline.replace([cue("first", 1000, 3000), cue("last", 1000, 3000)]);

    expect(timeline.at(1500)?.id).toBe("last");
  });

  it("geçersiz cue'ları ve geçersiz sorgu zamanlarını güvenle yok sayar", () => {
    const timeline = new CaptionTimeline();
    timeline.replace([
      cue("valid", 0, 1000),
      cue("nan", Number.NaN, 1000),
      cue("infinite", 1000, Number.POSITIVE_INFINITY),
      cue("negative", -100, 100),
      cue("backwards", 2000, 1000),
      cue("empty", 3000, 3000),
    ]);

    expect(timeline.at(500)?.id).toBe("valid");
    expect(timeline.at(Number.NaN)).toBeNull();
    expect(timeline.at(Number.POSITIVE_INFINITY)).toBeNull();
    expect(timeline.at(-50)).toBeNull();
  });

  it("replace girdisini sonraki mutasyonlardan yalıtır", () => {
    const input = cue("original", 0, 1000);
    const cues = [input];
    const timeline = new CaptionTimeline();
    timeline.replace(cues);

    input.startMs = 5000;
    cues.splice(0, 1);

    expect(timeline.at(500)?.id).toBe("original");
  });

  it("append sonrasında cue'ları zaman sırasına koyar", () => {
    const timeline = new CaptionTimeline();
    timeline.replace([cue("late", 3000, 4000)]);
    timeline.append([cue("early", 0, 1000), cue("middle", 1500, 2500)]);

    expect(timeline.at(500)?.id).toBe("early");
    expect(timeline.at(2000)?.id).toBe("middle");
    expect(timeline.at(3500)?.id).toBe("late");
  });

  it("append sonrası boşluk lookup'ında bitmiş prefix'i erken bırakır", () => {
    const allCues = Array.from({ length: 128 }, (_, index) =>
      cue(`cue-${index}`, index * 10, index * 10 + 5),
    );
    const timeline = new CaptionTimeline();
    timeline.replace(allCues.slice(0, 64));
    timeline.append(allCues.slice(64));

    let endReads = 0;
    for (const original of allCues) {
      const stored = timeline.at(original.startMs)!;
      const endMs = stored.endMs;
      Object.defineProperty(stored, "endMs", {
        configurable: true,
        get: () => {
          endReads += 1;
          return endMs;
        },
      });
    }

    endReads = 0;
    expect(timeline.at(10_000)).toBeNull();
    expect(endReads).toBeLessThanOrEqual(1);
  });
});
