import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@focapt/core/settings";
import { SettingsStore } from "./settings-store";

describe("SettingsStore", () => {
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
