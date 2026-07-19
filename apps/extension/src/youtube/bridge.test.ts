import { describe, expect, it, vi } from "vitest";

import { installYouTubeTracksBridge } from "./bridge";

const legacyBridgeStateKey = "__focaptYouTubeTracksBridge__";

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
});
