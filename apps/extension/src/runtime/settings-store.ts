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

function hasExplicitSettings(data: Record<string, unknown>, site: string): boolean {
  const root = asRecord(data.focaptSettings);
  const sites = asRecord(root.sites);
  return Object.hasOwn(root, "global") || Object.hasOwn(sites, site);
}

function settingsRoot(data: Record<string, unknown>): UnknownRecord {
  return asRecord(data.focaptSettings);
}

export interface SettingsSnapshot {
  settings: UserSettings;
  hasExplicitSettings: boolean;
}

export class SettingsStore {
  private settingsRevision = 0;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly storage: StorageArea) {}

  noteSettingsChanged(): void {
    this.settingsRevision += 1;
  }

  async hasExplicitSettings(site: string): Promise<boolean> {
    const data = await this.storage.get("focaptSettings");
    return hasExplicitSettings(data, site);
  }

  async getSnapshot(site: string): Promise<SettingsSnapshot> {
    const data = await this.storage.get("focaptSettings");
    return {
      settings: this.settingsFrom(data, site),
      hasExplicitSettings: hasExplicitSettings(data, site)
    };
  }

  async setDefaultsIfImplicit(settings: UserSettings, site: string): Promise<boolean> {
    const observedRevision = this.settingsRevision;
    return this.enqueueWrite(async () => {
      if (observedRevision !== this.settingsRevision) return false;
      const checked = await this.storage.get("focaptSettings");
      if (
        observedRevision !== this.settingsRevision
        || hasExplicitSettings(checked, site)
      ) return false;

      const boundary = await this.storage.get("focaptSettings");
      if (
        observedRevision !== this.settingsRevision
        || hasExplicitSettings(boundary, site)
      ) return false;

      await this.write(settings, site, settingsRoot(boundary));
      return true;
    });
  }

  async get(site: string): Promise<UserSettings> {
    const data = await this.storage.get("focaptSettings");
    return this.settingsFrom(data, site);
  }

  private settingsFrom(data: Record<string, unknown>, site: string): UserSettings {
    const root = asRecord(data.focaptSettings);
    const global = normalizeSettings(root.global);
    const siteSettings = asRecord(root.sites)[site];

    return siteSettings === undefined ? global : normalizeSettings(mergeSettings(global, siteSettings));
  }

  async set(settings: UserSettings, site: string): Promise<void> {
    await this.enqueueWrite(async () => {
      const current = await this.storage.get("focaptSettings");
      await this.write(settings, site, settingsRoot(current));
    });
  }

  private enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(operation, operation);
    this.writeQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async write(
    settings: UserSettings,
    site: string,
    root: UnknownRecord
  ): Promise<void> {
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
