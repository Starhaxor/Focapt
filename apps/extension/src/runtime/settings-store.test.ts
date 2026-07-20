import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@focapt/core/settings";
import { SettingsStore } from "./settings-store";

describe("SettingsStore", () => {
  it("popup başlangıcı ayarları ve explicit durumunu aynı storage snapshot'ından okur", async () => {
    let state: Record<string, unknown> = {};
    let reads = 0;
    let writes = 0;
    const newerSettings = { ...DEFAULT_SETTINGS, enabled: false, targetLanguage: "de" };
    const store = new SettingsStore({
      async get() {
        reads += 1;
        const snapshot = structuredClone(state);
        if (reads === 1) state = { focaptSettings: { global: newerSettings } };
        return snapshot;
      },
      async set(value: Record<string, unknown>) {
        writes += 1;
        state = structuredClone(value);
      }
    });

    const initial = await store.getSnapshot("youtube.com");

    expect(reads).toBe(1);
    expect(initial).toEqual({ settings: DEFAULT_SETTINGS, hasExplicitSettings: false });
    await expect(store.setDefaultsIfImplicit(initial.settings, "youtube.com")).resolves.toBe(false);
    expect(writes).toBe(0);
    expect(state).toEqual({ focaptSettings: { global: newerSettings } });
  });

  it("change bildirimi gecikse de popup ayarını yazma sınırında yeniden okuyup korur", async () => {
    let state: Record<string, unknown> = {};
    let reads = 0;
    let defaultWrites = 0;
    let store!: SettingsStore;
    const popupSettings = { ...DEFAULT_SETTINGS, delayMs: 975, targetLanguage: "de" };
    store = new SettingsStore({
      async get() {
        reads += 1;
        const snapshot = structuredClone(state);
        if (reads === 1) {
          state = { focaptSettings: { global: popupSettings } };
        }
        return snapshot;
      },
      async set(value: Record<string, unknown>) {
        defaultWrites += 1;
        state = structuredClone(value);
      }
    });

    await expect(store.setDefaultsIfImplicit({
      ...DEFAULT_SETTINGS,
      sourceLanguage: "en",
      targetLanguage: "tr"
    }, "youtube.com")).resolves.toBe(false);

    expect(defaultWrites).toBe(0);
    expect(state).toEqual({ focaptSettings: { global: popupSettings } });
  });

  it("birden fazla yeni ayar revision'ından sonra en yenisini default repair ile ezmez", async () => {
    let state: Record<string, unknown> = {};
    let reads = 0;
    let defaultWrites = 0;
    let store!: SettingsStore;
    const latestSettings = { ...DEFAULT_SETTINGS, enabled: false, delayMs: 1_500 };
    store = new SettingsStore({
      async get() {
        reads += 1;
        const snapshot = structuredClone(state);
        if (reads === 1) {
          state = { focaptSettings: { global: { ...DEFAULT_SETTINGS, delayMs: 800 } } };
          store.noteSettingsChanged();
          state = { focaptSettings: { global: latestSettings } };
          store.noteSettingsChanged();
        }
        return snapshot;
      },
      async set(value: Record<string, unknown>) {
        defaultWrites += 1;
        state = structuredClone(value);
      }
    });

    await expect(store.setDefaultsIfImplicit(DEFAULT_SETTINGS, "youtube.com"))
      .resolves.toBe(false);

    expect(defaultWrites).toBe(0);
    expect(state).toEqual({ focaptSettings: { global: latestSettings } });
  });

  it("global veya aynı site kaydı varsa ayarları explicit sayar", async () => {
    const states: Record<string, Record<string, unknown>> = {
      empty: {},
      global: { focaptSettings: { global: { enabled: false } } },
      site: { focaptSettings: { sites: { "youtube.com": { delayMs: 900 } } } },
      otherSite: { focaptSettings: { sites: { "example.com": { delayMs: 900 } } } }
    };
    let state = states.empty!;
    const store = new SettingsStore({
      async get() {
        return state;
      },
      async set(value: Record<string, unknown>) {
        Object.assign(state, value);
      }
    });

    await expect(store.hasExplicitSettings("youtube.com")).resolves.toBe(false);
    state = states.global!;
    await expect(store.hasExplicitSettings("youtube.com")).resolves.toBe(true);
    state = states.site!;
    await expect(store.hasExplicitSettings("youtube.com")).resolves.toBe(true);
    state = states.otherSite!;
    await expect(store.hasExplicitSettings("youtube.com")).resolves.toBe(false);
  });

  it("site ayarını yalnız aynı hostname için döndürür", async () => {
    const state: Record<string, unknown> = {};
    const storage = {
      async get() {
        return state;
      },
      async set(value: Record<string, unknown>) {
        Object.assign(state, value);
      }
    };
    const store = new SettingsStore(storage);

    await store.set({ ...DEFAULT_SETTINGS, scope: "site", delayMs: 900 }, "youtube.com");

    expect((await store.get("youtube.com")).delayMs).toBe(900);
    expect((await store.get("udemy.com")).delayMs).toBe(600);
  });

  it("kısmi site ayarını global ayarın üzerine katmanlar", async () => {
    const state: Record<string, unknown> = {
      focaptSettings: {
        global: {
          ...DEFAULT_SETTINGS,
          delayMs: 700,
          sourceStyle: { ...DEFAULT_SETTINGS.sourceStyle, color: "#112233" }
        },
        sites: {
          "youtube.com": { delayMs: 900, sourceStyle: { fontSizePx: 30 } }
        }
      }
    };
    const store = new SettingsStore({
      async get() {
        return state;
      },
      async set(value: Record<string, unknown>) {
        Object.assign(state, value);
      }
    });

    const settings = await store.get("youtube.com");

    expect(settings.delayMs).toBe(900);
    expect(settings.scope).toBe("site");
    expect(settings.sourceStyle.fontSizePx).toBe(30);
    expect(settings.sourceStyle.color).toBe("#112233");
  });

  it("site ayarından globale geçince eski site override değerini temizler", async () => {
    const state: Record<string, unknown> = {};
    const store = new SettingsStore({
      async get() {
        return state;
      },
      async set(value: Record<string, unknown>) {
        Object.assign(state, value);
      }
    });

    await store.set({ ...DEFAULT_SETTINGS, scope: "site", delayMs: 900 }, "youtube.com");
    await store.set({ ...DEFAULT_SETTINGS, scope: "global", delayMs: 1_200 }, "youtube.com");

    expect((await store.get("youtube.com")).delayMs).toBe(1_200);
    expect((await store.get("udemy.com")).delayMs).toBe(1_200);
  });
});
