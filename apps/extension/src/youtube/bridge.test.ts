import { describe, expect, it, vi } from "vitest";

import {
  handleYouTubeCaptionRequest,
  installYouTubeTracksBridge,
} from "./bridge";
import {
  CAPTION_RESPONSE_CHANNEL,
  createCaptionRequest,
} from "./page-caption-protocol";
import type { YouTubeCaptionTrack } from "./player-response";

const legacyBridgeStateKey = "__focaptYouTubeTracksBridge__";

const captionTrack: YouTubeCaptionTrack = {
  baseUrl: "https://www.youtube.com/api/timedtext?v=HAG4uyrkVfA&lang=en",
  languageCode: "en",
  label: "English",
  isTranslatable: true,
  isDefault: true,
};

describe("installYouTubeTracksBridge", () => {
  it("isolated listener hazır olduktan sonra gelen request eventinde tekrar yayınlar", () => {
    const host = {};
    let requestListener: (() => void) | undefined;
    const publish = vi.fn();

    installYouTubeTracksBridge({
      host,
      publish,
      addNavigationListener: () => undefined,
      addRequestListener: (listener) => {
        requestListener = listener;
      }
    });
    expect(publish).toHaveBeenCalledOnce();
    requestListener?.();
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it("module-private registry ile normal yeniden kurulumda listener'ı çoğaltmaz", () => {
    const host = {};
    const listeners: Array<() => void> = [];
    let publishCount = 0;
    const options = {
      host,
      addNavigationListener: (listener: () => void) => listeners.push(listener),
      publish: () => {
        publishCount += 1;
      },
    };

    installYouTubeTracksBridge(options);
    installYouTubeTracksBridge(options);

    expect(listeners).toHaveLength(1);
    expect(publishCount).toBe(2);
    expect(Object.getOwnPropertyNames(host)).toEqual([]);
  });

  it("global spoof state olsa bile tek internal listener kurar", () => {
    const host = {};
    Object.defineProperty(host, legacyBridgeStateKey, {
      configurable: false,
      value: Object.freeze({
        brand: "focapt:youtube-tracks-bridge",
        version: 1,
      }),
      writable: false,
    });
    const listeners: Array<() => void> = [];
    let publishCount = 0;
    const options = {
      host,
      addNavigationListener: (listener: () => void) => listeners.push(listener),
      publish: () => {
        publishCount += 1;
      },
    };

    installYouTubeTracksBridge(options);
    installYouTubeTracksBridge(options);

    expect(listeners).toHaveLength(1);
    expect(publishCount).toBe(2);
  });

  it("non-writable hostile property ikinci kurulumda listener çoğaltmaz", () => {
    const host = {};
    Object.defineProperty(host, legacyBridgeStateKey, {
      configurable: false,
      value: Object.freeze({ hostile: true }),
      writable: false,
    });
    const listeners: Array<() => void> = [];
    let publishCount = 0;
    const options = {
      host,
      addNavigationListener: (listener: () => void) => listeners.push(listener),
      publish: () => {
        publishCount += 1;
      },
    };

    installYouTubeTracksBridge(options);
    installYouTubeTracksBridge(options);

    expect(listeners).toHaveLength(1);
    expect(publishCount).toBe(2);
  });

  it("throwing hostile property'ye hiç erişmez ve listener'ı çoğaltmaz", () => {
    const host = {};
    let getterReads = 0;
    Object.defineProperty(host, legacyBridgeStateKey, {
      configurable: false,
      get() {
        getterReads += 1;
        throw new Error("hostile getter");
      },
    });
    const listeners: Array<() => void> = [];
    let publishCount = 0;
    const options = {
      host,
      addNavigationListener: (listener: () => void) => listeners.push(listener),
      publish: () => {
        publishCount += 1;
      },
    };

    installYouTubeTracksBridge(options);
    installYouTubeTracksBridge(options);

    expect(getterReads).toBe(0);
    expect(listeners).toHaveLength(1);
    expect(publishCount).toBe(2);
  });

  it("yeniden kurulumda mevcut internal publish'i kullanır ve hataları yalıtır", () => {
    const host = {};
    let navigationListener: (() => void) | undefined;
    let originalPublishAttempts = 0;
    let replacementPublishAttempts = 0;

    expect(() =>
      installYouTubeTracksBridge({
        host,
        addNavigationListener: (listener) => {
          navigationListener = listener;
        },
        publish: () => {
          originalPublishAttempts += 1;
          throw new Error("publish failed");
        },
      }),
    ).not.toThrow();

    expect(() =>
      installYouTubeTracksBridge({
        host,
        addNavigationListener: () => {
          throw new Error("duplicate listener");
        },
        publish: () => {
          replacementPublishAttempts += 1;
        },
      }),
    ).not.toThrow();

    expect(() => navigationListener?.()).not.toThrow();
    expect(originalPublishAttempts).toBe(3);
    expect(replacementPublishAttempts).toBe(0);
  });

  it("caption request listener'ini bir kez kurar ve senkron hataları yalıtır", () => {
    const host = {};
    const listeners: Array<(event: unknown) => void> = [];
    let attempts = 0;
    const options = {
      host,
      publish: () => undefined,
      addNavigationListener: () => undefined,
      addCaptionRequestListener: (listener: (event: unknown) => void) => listeners.push(listener),
      handleCaptionRequest: () => {
        attempts += 1;
        throw new Error("caption handler failed");
      },
    };

    installYouTubeTracksBridge(options);
    installYouTubeTracksBridge(options);

    expect(listeners).toHaveLength(1);
    expect(() => listeners[0]?.({ data: "request" })).not.toThrow();
    expect(attempts).toBe(1);
  });

  it("caption request listener'inin asenkron reddini yakalar", async () => {
    const host = {};
    let listener: ((event: unknown) => void) | undefined;
    installYouTubeTracksBridge({
      host,
      publish: () => undefined,
      addNavigationListener: () => undefined,
      addCaptionRequestListener: (nextListener) => {
        listener = nextListener;
      },
      handleCaptionRequest: async () => {
        throw new Error("async caption handler failed");
      },
    });

    expect(() => listener?.({ data: "request" })).not.toThrow();
    await Promise.resolve();
  });
});

describe("handleYouTubeCaptionRequest", () => {
  it("valid same-window request'i credentialed JSON3 fetch ile cevaplar", async () => {
    const host = {};
    const request = createCaptionRequest("req-1", "HAG4uyrkVfA", captionTrack, "tr");
    const fetchCaption = vi.fn(async (
      _url: URL,
      _init: { credentials: "include" },
    ) => ({
      ok: true,
      text: async () => JSON.stringify({
        events: [{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: "Merhaba" }] }],
      }),
    }));
    const postMessage = vi.fn();

    await handleYouTubeCaptionRequest(
      { source: host, data: request },
      {
        host,
        currentVideoId: () => "HAG4uyrkVfA",
        fetchCaption,
        postMessage,
        targetOrigin: "https://www.youtube.com",
      },
    );

    expect(fetchCaption).toHaveBeenCalledOnce();
    const [url, init] = fetchCaption.mock.calls[0] ?? [];
    expect(url).toBeInstanceOf(URL);
    expect((url as URL).searchParams.get("fmt")).toBe("json3");
    expect((url as URL).searchParams.get("tlang")).toBe("tr");
    expect(init).toEqual({ credentials: "include" });
    expect(postMessage).toHaveBeenCalledWith({
      channel: CAPTION_RESPONSE_CHANNEL,
      requestId: "req-1",
      videoId: "HAG4uyrkVfA",
      ok: true,
      cues: [{ id: "yt-0-1000", startMs: 0, endMs: 1000, text: "Merhaba" }],
    }, "https://www.youtube.com");
  });

  it("wrong-source ve stale-video request'lerini yok sayar", async () => {
    const host = {};
    const request = createCaptionRequest("req-1", "HAG4uyrkVfA", captionTrack, null);
    const fetchCaption = vi.fn();
    const postMessage = vi.fn();
    const dependencies = {
      host,
      currentVideoId: () => "dQw4w9WgXcQ",
      fetchCaption,
      postMessage,
      targetOrigin: "https://www.youtube.com",
    };

    await handleYouTubeCaptionRequest({ source: {}, data: request }, dependencies);
    await handleYouTubeCaptionRequest({ source: host, data: request }, dependencies);

    expect(fetchCaption).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("HTTP, parse ve fetch hatalarını structured failure'a dönüştürür", async () => {
    const host = {};
    const request = createCaptionRequest("req-1", "HAG4uyrkVfA", captionTrack, null);

    for (const fetchCaption of [
      vi.fn(async () => ({ ok: false, text: async () => "" })),
      vi.fn(async () => ({ ok: true, text: async () => "not json" })),
      vi.fn(async () => { throw new Error("network"); }),
    ]) {
      const postMessage = vi.fn();
      await expect(handleYouTubeCaptionRequest(
        { source: host, data: request },
        {
          host,
          currentVideoId: () => "HAG4uyrkVfA",
          fetchCaption,
          postMessage,
          targetOrigin: "https://www.youtube.com",
        },
      )).resolves.toBeUndefined();

      expect(postMessage).toHaveBeenCalledWith({
        channel: CAPTION_RESPONSE_CHANNEL,
        requestId: "req-1",
        videoId: "HAG4uyrkVfA",
        ok: false,
        error: "CAPTION_LOAD_FAILED",
      }, "https://www.youtube.com");
    }
  });

  it("response publication failure'ini playback'e yansıtmaz", async () => {
    const host = {};
    const request = createCaptionRequest("req-1", "HAG4uyrkVfA", captionTrack, null);

    await expect(handleYouTubeCaptionRequest(
      { source: host, data: request },
      {
        host,
        currentVideoId: () => "HAG4uyrkVfA",
        fetchCaption: async () => ({ ok: true, text: async () => "" }),
        postMessage: () => { throw new Error("hostile page"); },
        targetOrigin: "https://www.youtube.com",
      },
    )).resolves.toBeUndefined();
  });
});
