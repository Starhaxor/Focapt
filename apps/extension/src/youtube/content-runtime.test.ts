// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "@focapt/core/settings";
import {
  AsyncGeneration,
  ContentMessageBridge,
  createBilingualLoadPlan,
  ensurePositionedContainer,
  LanguageDefaultsInitializer,
  LatestRequestController,
  loadBilingualCaptionCues,
  reportCaptionLoadFailure,
  readSettingsUpdate,
  readTracksEventDetail,
  selectCaptionTrack,
  waitForYouTubeVideo
} from "./content-runtime";

afterEach(() => vi.useRealTimers());

describe("YouTube content runtime helpers", () => {
  it("ikinci dil istegini kaynak altyazi tamamlandiktan sonra baslatir", async () => {
    let releaseSource: ((value: Array<{ id: string; startMs: number; endMs: number; text: string }>) => void) | undefined;
    const sourcePending = new Promise<Array<{ id: string; startMs: number; endMs: number; text: string }>>(
      (resolve) => { releaseSource = resolve; },
    );
    const calls: Array<string | null> = [];
    const plan = {
      baseTrack: {
        baseUrl: "https://www.youtube.com/api/timedtext?v=1&lang=en",
        languageCode: "en",
        label: "English",
        isTranslatable: true,
        isDefault: true,
      },
      sourceRequestLanguage: "fr",
      targetRequestLanguage: "tr",
    };

    const pending = loadBilingualCaptionCues(plan, async (language) => {
      calls.push(language);
      if (language === "fr") return sourcePending;
      return [{ id: "tr-1", startMs: 0, endMs: 1000, text: "Merhaba" }];
    });

    expect(calls).toEqual(["fr"]);
    releaseSource?.([{ id: "fr-1", startMs: 0, endMs: 1000, text: "Bonjour" }]);
    await expect(pending).resolves.toEqual([
      { id: "fr-1", startMs: 0, endMs: 1000, text: "Bonjour", translatedText: "Merhaba" },
    ]);
    expect(calls).toEqual(["fr", "tr"]);
  });

  it("falls back to a real base track and requests the selected source translation", () => {
    const catalog = {
      tracks: [
        { baseUrl: "https://www.youtube.com/api/timedtext?v=1", languageCode: "en", label: "English", isTranslatable: true, isDefault: true }
      ],
      languages: [
        { languageCode: "en", label: "English" },
        { languageCode: "fr", label: "Français" },
        { languageCode: "tr", label: "Türkçe" }
      ]
    };

    expect(createBilingualLoadPlan(catalog, { sourceLanguage: "fr", targetLanguage: "tr" }))
      .toMatchObject({
        baseTrack: { languageCode: "en" },
        sourceRequestLanguage: "fr",
        targetRequestLanguage: "tr"
      });
    expect(createBilingualLoadPlan(catalog, { sourceLanguage: "en", targetLanguage: "tr" }))
      .toMatchObject({ sourceRequestLanguage: null, targetRequestLanguage: "tr" });
    expect(createBilingualLoadPlan({ ...catalog, tracks: [] }, DEFAULT_SETTINGS)).toBeNull();
  });

  it("uses catalog fallbacks only for caption requests while preserving saved languages", () => {
    const settings = { sourceLanguage: "de", targetLanguage: "ja" };
    const catalog = {
      tracks: [
        { baseUrl: "https://www.youtube.com/api/timedtext?v=1", languageCode: "en", label: "English", isTranslatable: true, isDefault: true }
      ],
      languages: [
        { languageCode: "en", label: "English" },
        { languageCode: "de", label: "Deutsch" }
      ]
    };

    expect(createBilingualLoadPlan(catalog, settings)).toMatchObject({
      baseTrack: { languageCode: "en" },
      sourceRequestLanguage: "de",
      targetRequestLanguage: null
    });
    expect(settings).toEqual({ sourceLanguage: "de", targetLanguage: "ja" });

    expect(createBilingualLoadPlan({
      ...catalog,
      tracks: [
        { baseUrl: "https://www.youtube.com/api/timedtext?v=2", languageCode: "es", label: "Español", isTranslatable: true, isDefault: true }
      ],
      languages: [{ languageCode: "de", label: "Deutsch" }]
    }, { sourceLanguage: "ja", targetLanguage: "ko" })).toMatchObject({
      sourceRequestLanguage: "de",
      targetRequestLanguage: "de"
    });
  });

  it("does not treat a same-base or direct track language as a saved catalog match", () => {
    const catalog = {
      tracks: [
        { baseUrl: "https://www.youtube.com/api/timedtext?v=1", languageCode: "zh-TW", label: "中文 (台灣)", isTranslatable: false, isDefault: true },
        { baseUrl: "https://www.youtube.com/api/timedtext?v=2", languageCode: "en", label: "English", isTranslatable: true, isDefault: false }
      ],
      languages: [
        { languageCode: "zh-Hans", label: "中文 (简体)" },
        { languageCode: "en", label: "English" }
      ]
    };

    expect(createBilingualLoadPlan(catalog, {
      sourceLanguage: "zh-TW",
      targetLanguage: "zh-TW"
    })).toMatchObject({
      baseTrack: { languageCode: "en" },
      sourceRequestLanguage: null,
      targetRequestLanguage: null
    });
  });

  it("uses a translatable base instead of an exact non-translatable track when translation is needed", () => {
    const catalog = {
      tracks: [
        { baseUrl: "https://www.youtube.com/api/timedtext?v=1", languageCode: "fr", label: "Français", isTranslatable: false, isDefault: true },
        { baseUrl: "https://www.youtube.com/api/timedtext?v=2", languageCode: "en", label: "English", isTranslatable: true, isDefault: false }
      ],
      languages: [
        { languageCode: "en", label: "English" },
        { languageCode: "fr", label: "Français" },
        { languageCode: "tr", label: "Türkçe" }
      ]
    };

    expect(createBilingualLoadPlan(catalog, { sourceLanguage: "fr", targetLanguage: "tr" }))
      .toMatchObject({
        baseTrack: { languageCode: "en", isTranslatable: true },
        sourceRequestLanguage: "fr",
        targetRequestLanguage: "tr"
      });
    expect(createBilingualLoadPlan(catalog, { sourceLanguage: "fr", targetLanguage: "fr" }))
      .toMatchObject({
        baseTrack: { languageCode: "fr", isTranslatable: false },
        sourceRequestLanguage: null,
        targetRequestLanguage: null
      });
  });

  it("does not consume one-shot language defaults until a valid catalog arrives", async () => {
    const initializer = new LanguageDefaultsInitializer();
    const initialize = vi.fn(async () => undefined);

    await initializer.run([], initialize);
    expect(initialize).not.toHaveBeenCalled();

    const valid = [{ languageCode: "en", label: "English" }];
    await initializer.run(valid, initialize);
    await initializer.run(valid, initialize);
    expect(initialize).toHaveBeenCalledTimes(1);
  });

  it("caches the latest language catalog as plain cloned options", async () => {
    const bridge = new ContentMessageBridge();
    const languages = [
      { languageCode: "tr", label: "Türkçe" },
      { languageCode: "zh-Hans", label: "中文（简体）" }
    ];

    await expect(bridge.handle({ type: "GET_LANGUAGE_CATALOG" }))
      .resolves.toEqual({ languages: [] });
    bridge.setLanguageCatalog(languages);
    const response = await bridge.handle({ type: "GET_LANGUAGE_CATALOG" });
    expect(response).toEqual({ languages });
    expect((response as { languages: unknown[] }).languages).not.toBe(languages);

    languages[0]!.label = "mutated";
    await expect(bridge.handle({ type: "GET_LANGUAGE_CATALOG" }))
      .resolves.toEqual({
        languages: [
          { languageCode: "tr", label: "Türkçe" },
          { languageCode: "zh-Hans", label: "中文（简体）" }
        ]
      });
  });

  it("video mount edilmeden gelen ayarlari kabul edip mount olunca uygular", async () => {
    const bridge = new ContentMessageBridge();
    const settings = { ...DEFAULT_SETTINGS, delayMs: 750 };

    await expect(bridge.handle({ type: "SETTINGS_UPDATED", settings }))
      .resolves.toEqual({ ok: true, mounted: false });

    const applySettings = vi.fn();
    const detach = bridge.attach({
      applySettings,
      getVideoTimeMs: () => 1250
    });
    expect(applySettings).toHaveBeenCalledWith(settings);
    await expect(bridge.handle({ type: "GET_VIDEO_TIME" }))
      .resolves.toEqual({ videoTimeMs: 1250 });

    detach();
    await expect(bridge.handle({ type: "GET_VIDEO_TIME" }))
      .resolves.toEqual({ videoTimeMs: null });
  });

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

  it("eski videonun load rejection'ı URL değiştikten sonra captionLoadFailed yayınlamaz", () => {
    const report = vi.fn();
    const controller = new AbortController();

    reportCaptionLoadFailure({
      requestVideoId: "oldVideo01",
      currentVideoId: () => "newVideo02",
      generationSignal: controller.signal,
      isGenerationCurrent: () => true
    }, report);

    expect(report).not.toHaveBeenCalled();
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
      tracks: [{ baseUrl: "https://www.youtube.com/api/timedtext?v=abc", languageCode: "en-US", label: "English", isTranslatable: true, isDefault: true }]
    };
    expect(readTracksEventDetail(valid, "abc")).toEqual(valid);
    expect(readTracksEventDetail(valid, "other")).toBeNull();
    expect(readTracksEventDetail({ ...valid, tracks: [{ languageCode: "en" }] }, "abc")).toBeNull();
    expect(readTracksEventDetail({
      ...valid,
      tracks: [{ baseUrl: "https://www.youtube.com/api/timedtext?v=abc", languageCode: "en", label: "English" }]
    }, "abc")).toBeNull();
  });

  it("caption dilinde exact eşleşmeyi base-language eşleşmesinden önce seçer", () => {
    const tracks = [
      { baseUrl: "https://www.youtube.com/api/timedtext?v=1", languageCode: "en-US", label: "US", isTranslatable: false, isDefault: true },
      { baseUrl: "https://www.youtube.com/api/timedtext?v=2", languageCode: "en", label: "Exact", isTranslatable: false, isDefault: false }
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
