import { normalizeSettings } from "@focapt/core/settings";
import type { UserSettings } from "@focapt/contracts/settings";

export interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(value: Record<string, unknown>): Promise<void>;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function mergeSettings(base: UserSettings, override: unknown): unknown {
  const value = asRecord(override);

  return {
    ...base,
    ...value,
    fixedPosition: { ...base.fixedPosition, ...asRecord(value.fixedPosition) },
    sourceStyle: { ...base.sourceStyle, ...asRecord(value.sourceStyle) },
    translationStyle: { ...base.translationStyle, ...asRecord(value.translationStyle) },
    box: { ...base.box, ...asRecord(value.box) },
    scope: "site"
  };
}

export class SettingsStore {
  constructor(private readonly storage: StorageArea) {}

  async get(site: string): Promise<UserSettings> {
    const data = await this.storage.get("focaptSettings");
    const root = asRecord(data.focaptSettings);
    const global = normalizeSettings(root.global);
    const siteSettings = asRecord(root.sites)[site];

    return siteSettings === undefined ? global : normalizeSettings(mergeSettings(global, siteSettings));
  }

  async set(settings: UserSettings, site: string): Promise<void> {
    const current = await this.storage.get("focaptSettings");
    const root = asRecord(current.focaptSettings);
    const sites = asRecord(root.sites);
    const normalized = normalizeSettings(settings);
    let next: UnknownRecord;

    if (normalized.scope === "site") {
      next = { ...root, sites: { ...sites, [site]: normalized } };
    } else {
      const remainingSites = { ...sites };
      delete remainingSites[site];
      next = { ...root, global: normalized, sites: remainingSites };
    }

    await this.storage.set({ focaptSettings: next });
  }
}
