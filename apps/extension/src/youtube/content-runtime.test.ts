// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "@focapt/core/settings";
import {
  AsyncGeneration,
  ensurePositionedContainer,
  LatestRequestController,
  readSettingsUpdate,
  readTracksEventDetail,
  selectCaptionTrack,
  waitForYouTubeVideo
} from "./content-runtime";

afterEach(() => vi.useRealTimers());

describe("YouTube content runtime helpers", () => {
  it("reentrant caption requestte önceki işi abort eder ve stale sonucu commit etmez", async () => {
    const requests = new LatestRequestController();
    const commits: string[] = [];
    const releases: Array<(value: string) => void> = [];
    const signals: AbortSignal[] = [];
    const task = (signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<string>((resolve) => releases.push(resolve));
    };

    const first = requests.run(task, (value) => commits.push(value));
    const second = requests.run(task, (value) => commits.push(value));
    expect(signals[0]?.aborted).toBe(true);
    releases[1]?.("new");
    await second;
    releases[0]?.("stale");
    await first;

    expect(commits).toEqual(["new"]);
  });

  it("cancel settings update sırasında devam eden caption requesti etkisiz bırakır", async () => {
    const requests = new LatestRequestController();
    let release: ((value: string) => void) | undefined;
    const commit = vi.fn();
    const running = requests.run(
      () => new Promise<string>((resolve) => { release = resolve; }),
      commit
    );

    requests.cancel();
    release?.("old settings");
    await running;
    expect(commit).not.toHaveBeenCalled();
  });

  it("geciken video öğesini MutationObserver ile bekler", async () => {
    const pending = waitForYouTubeVideo(document, { timeoutMs: 1000 });
    document.body.innerHTML = `<div id="movie_player"><video></video></div>`;
    await expect(pending).resolves.toBe(document.querySelector("video"));
  });

  it("beklemeyi timeout ve abort ile güvenli biçimde sonlandırır", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
    const timedOut = waitForYouTubeVideo(document, { timeoutMs: 50 });
    const timedOutAssertion = expect(timedOut).rejects.toMatchObject({ code: "YOUTUBE_VIDEO_WAIT_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(50);
    await timedOutAssertion;

    const controller = new AbortController();
    const aborted = waitForYouTubeVideo(document, { signal: controller.signal, timeoutMs: 1000 });
    controller.abort();
    await expect(aborted).rejects.toMatchObject({ name: "AbortError" });
  });

  it("track event detail'ini runtime'da doğrular ve video id eşleşmesini korur", () => {
    const valid = {
      videoId: "abc",
      tracks: [{ baseUrl: "https://www.youtube.com/api/timedtext?v=abc", languageCode: "en-US", label: "English" }]
    };
    expect(readTracksEventDetail(valid, "abc")).toEqual(valid);
    expect(readTracksEventDetail(valid, "other")).toBeNull();
    expect(readTracksEventDetail({ ...valid, tracks: [{ languageCode: "en" }] }, "abc")).toBeNull();
  });

  it("caption dilinde exact eşleşmeyi base-language eşleşmesinden önce seçer", () => {
    const tracks = [
      { baseUrl: "https://www.youtube.com/api/timedtext?v=1", languageCode: "en-US", label: "US" },
      { baseUrl: "https://www.youtube.com/api/timedtext?v=2", languageCode: "en", label: "Exact" }
    ];
    expect(selectCaptionTrack(tracks, "en")?.label).toBe("Exact");
    expect(selectCaptionTrack(tracks.slice(0, 1), "en")?.label).toBe("US");
  });

  it("settings mesajını yalnız doğru şekle sahipse normalize eder", () => {
    expect(readSettingsUpdate({ type: "SETTINGS_UPDATED", settings: { delayMs: 99999 } }))
      .toEqual({ ...DEFAULT_SETTINGS, delayMs: 3000 });
    expect(readSettingsUpdate({ type: "SETTINGS_UPDATED", settings: null })).toBeNull();
    expect(readSettingsUpdate({ type: "OTHER", settings: DEFAULT_SETTINGS })).toBeNull();
  });

  it("container position değişikliğini dispose sırasında aynı inline değere döndürür", () => {
    const container = document.createElement("div");
    container.style.position = "static";
    document.body.append(container);
    const restore = ensurePositionedContainer(container, () => "static");
    expect(container.style.position).toBe("relative");
    restore();
    restore();
    expect(container.style.position).toBe("static");
  });

  it("yeni mount generation başladığında eskisini abort edip stale sonuçları tanır", () => {
    const generations = new AsyncGeneration();
    const first = generations.begin();
    const second = generations.begin();
    expect(first.signal.aborted).toBe(true);
    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);
    generations.dispose();
    expect(second.signal.aborted).toBe(true);
    expect(second.isCurrent()).toBe(false);
  });
});
