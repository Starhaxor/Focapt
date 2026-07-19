# YouTube Çift Dilli Odaklı Altyazı — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** YouTube videolarında platform altyazısını veya yapay zekâ ile üretilen altyazıyı iki dilde gösteren; sabit, hareketli ve gecikmeli konum modları ile bağımsız renk/boyut özelleştirmesi sunan çalışan bir Chrome eklentisi ve altyazı API'si oluşturmak.

**Architecture:** NPM workspaces içinde WXT tabanlı Manifest V3 eklentisi, paylaşılan tipler ve Fastify tabanlı altyazı API'si bulunur. YouTube adaptörü platform altyazısını ortak cue biçimine çevirir; altyazı yoksa kullanıcı hareketiyle `tabCapture` başlatılır, offscreen belge ses parçalarını API'ye gönderir. Ortak zaman çizelgesi ve Shadow DOM görüntüleyicisi altyazı kaynağından bağımsız çalışır.

**Tech Stack:** Node.js 22+, npm workspaces, TypeScript 7.0.2, WXT 0.20.27, Manifest V3, Vitest 4.1.10, Happy DOM 20.11.0, Playwright 1.61.1, Fastify 5.10.0, `@fastify/multipart` 10.1.0, `@fastify/cors` 11.3.0, `@huggingface/inference` 4.13.23, Zod 4.4.3.

## Global Constraints

- İlk üretim hedefi YouTube'dur; Udemy ve Netflix adaptörleri bu planın kapsamı dışındadır.
- Üst satır kaynak/öğrenilen dil, alt satır ana dil çevirisidir.
- Eklenti önce platform altyazısını kullanır; ses yalnızca platform altyazısı yoksa ve kullanıcı yapay zekâ üretimini başlatırsa yakalanır.
- Sabit, hareketli ve gecikmeli konum modlarının üçü de bulunur.
- Gecikmeli modun varsayılan değeri tam olarak 600 milisaniyedir.
- Kaynak ve çeviri satırlarının renk, boyut ve kalınlık ayarları birbirinden bağımsızdır.
- Kullanıcıya görünen hiçbir metin Türkçe veya İngilizce olarak kaynak koda gömülmez; bütün metinler locale anahtarlarından gelir.
- Arayüz dili varsayılan olarak `browser.i18n.getUILanguage()` ile seçilir; kullanıcı `auto`, `tr` veya `en` değerlerinden biriyle geçersiz kılabilir.
- Video/ses içeriği `browser.storage` içine yazılmaz.
- Her eklenti hatasında YouTube video oynatımı çalışmaya devam eder.
- Chrome minimum sürümü 116'dır; servis worker tarafından alınan `tabCapture` akış kimliğinin offscreen belgede tüketilmesi buna dayanır.
- Manifest V3 gereği uzaktan çalıştırılan JavaScript kullanılmaz; bütün yürütülebilir kod eklenti paketine dahildir.

## Kaynak Haritası

- `package.json`: Workspace komutları ve ortak geliştirme bağımlılıkları.
- `tsconfig.base.json`: Bütün TypeScript paketlerinin katı derleyici seçenekleri.
- `packages/contracts/src/captions.ts`: Eklenti ve API'nin paylaştığı cue, dil ve mesaj tipleri.
- `packages/contracts/src/settings.ts`: Kalıcı kullanıcı ayarı tipleri ve varsayılanlar.
- `packages/core/src/timeline.ts`: Video zamanından etkin çift dilli cue seçimi.
- `packages/core/src/settings.ts`: Ayar doğrulama ve varsayılanlarla birleştirme.
- `apps/extension/entrypoints/youtube-main.content.ts`: YouTube ana sayfa bağlamından altyazı izlerini çıkaran köprü.
- `apps/extension/entrypoints/youtube.content.ts`: İzole içerik betiği; adaptör, motor ve görüntüleyiciyi bağlar.
- `apps/extension/entrypoints/background.ts`: Popup komutları, `tabCapture` ve offscreen yaşam döngüsü.
- `apps/extension/entrypoints/offscreen.html`: MV3 offscreen belge giriş noktası.
- `apps/extension/entrypoints/offscreen/main.ts`: Ses yakalama, parçalama ve API'ye yükleme.
- `apps/extension/entrypoints/popup/*`: Dil, konum ve görünüm ayarları.
- `apps/extension/src/youtube/*`: YouTube track çıkarma, JSON3 ayrıştırma ve video adaptörü.
- `apps/extension/src/overlay/*`: Shadow DOM altyazı kutusu ve konum denetleyicileri.
- `apps/extension/src/runtime/*`: Mesajlaşma, ayar deposu ve altyazı orkestrasyonu.
- `apps/api/src/server.ts`: Fastify uygulaması ve sağlık kontrolü.
- `apps/api/src/routes/*`: Çeviri ve transkripsiyon uçları.
- `apps/api/src/providers/huggingface.ts`: Hugging Face ASR ve çeviri sağlayıcısı.
- `e2e/*`: Paketlenmiş eklenti ve yerel YouTube benzeri fixture ile uçtan uca testler.

Resmî uygulama referansları: [WXT kurulumu](https://wxt.dev/guide/installation.html), [Chrome Manifest V3](https://developer.chrome.com/docs/extensions/mv3/manifest), [tabCapture ve offscreen ses yakalama](https://developer.chrome.com/docs/extensions/how-to/web-platform/screen-capture), [Hugging Face ASR](https://huggingface.co/docs/inference-providers/tasks/automatic-speech-recognition), [Hugging Face çeviri](https://huggingface.co/docs/inference-providers/tasks/translation).

---

### Task 1: Workspace, Manifest ve Paylaşılan Sözleşmeler

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/src/captions.ts`
- Create: `packages/contracts/src/settings.ts`
- Create: `apps/extension/public/_locales/en/messages.json`
- Create: `apps/extension/public/_locales/tr/messages.json`
- Create: `apps/extension/src/i18n/translator.ts`
- Create: `apps/extension/src/i18n/translator.test.ts`
- Create: `packages/contracts/src/captions.test.ts`
- Create: `apps/extension/package.json`
- Create: `apps/extension/tsconfig.json`
- Create: `apps/extension/wxt.config.ts`
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`

**Interfaces:**
- Produces: `CaptionCue`, `BilingualCue`, `LanguageCode`, `UserSettings`, `RuntimeMessage`.
- Produces: WXT Manifest V3 yapılandırması; `storage`, `offscreen`, `tabCapture`, `activeTab` izinleri ve `https://www.youtube.com/*` eşleşmesi.

- [ ] **Step 1: Workspace yapılandırmasını yaz**

```json
{
  "name": "focapt",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "prepare": "npm -w @focapt/extension run prepare",
    "build": "npm run build -ws --if-present",
    "typecheck": "npm run typecheck -ws --if-present",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test"
  },
  "devDependencies": {
    "@playwright/test": "1.61.1",
    "@types/node": "26.1.1",
    "happy-dom": "20.11.0",
    "typescript": "7.0.2",
    "vitest": "4.1.10"
  }
}
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true
  }
}
```

`.gitignore`:

```gitignore
node_modules/
.wxt/
.output/
coverage/
playwright-report/
test-results/
.env
.superpowers/
```

`packages/contracts/package.json`:

```json
{"name":"@focapt/contracts","version":"0.0.0","private":true,"type":"module","exports":{"./captions":"./src/captions.ts","./settings":"./src/settings.ts"},"scripts":{"typecheck":"tsc --noEmit"}}
```

`apps/extension/package.json`:

```json
{"name":"@focapt/extension","version":"0.0.0","private":true,"type":"module","scripts":{"dev":"wxt","prepare":"wxt prepare","build":"wxt build","typecheck":"tsc --noEmit"},"dependencies":{"@focapt/contracts":"*","@focapt/core":"*"},"devDependencies":{"wxt":"0.20.27"}}
```

`apps/api/package.json`:

```json
{"name":"@focapt/api","version":"0.0.0","private":true,"type":"module","scripts":{"dev":"tsx watch src/index.ts","build":"tsup src/index.ts --format esm --dts","typecheck":"tsc --noEmit"},"dependencies":{"@fastify/cors":"11.3.0","@fastify/multipart":"10.1.0","@focapt/contracts":"*","@huggingface/inference":"4.13.23","fastify":"5.10.0","zod":"4.4.3"},"devDependencies":{"tsup":"8.5.1","tsx":"4.23.1"}}
```

`apps/extension/tsconfig.json`:

```json
{"extends":"./.wxt/tsconfig.json","compilerOptions":{"strict":true,"noUncheckedIndexedAccess":true,"exactOptionalPropertyTypes":true}}
```

`apps/api/tsconfig.json`:

```json
{"extends":"../../tsconfig.base.json","compilerOptions":{"noEmit":true,"types":["node"]},"include":["src/**/*.ts"]}
```

`packages/contracts/tsconfig.json` ve `packages/core/tsconfig.json`:

```json
{"extends":"../../tsconfig.base.json","compilerOptions":{"noEmit":true},"include":["src/**/*.ts"]}
```

- [ ] **Step 2: Bağımlılıkları yükle**

Run: `npm install`

Expected: `package-lock.json` oluşur ve komut exit 0 döndürür.

- [ ] **Step 3: Paylaşılan sözleşme için başarısız testi yaz**

```ts
// packages/contracts/src/captions.test.ts
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
```

- [ ] **Step 4: Testin doğru nedenle başarısız olduğunu doğrula**

Run: `npx vitest run packages/contracts/src/captions.test.ts`

Expected: FAIL; `./captions` modülü veya `isCueActive` dışa aktarımı bulunamaz.

- [ ] **Step 5: Sözleşmeleri ve WXT manifest yapılandırmasını yaz**

```ts
// packages/contracts/src/captions.ts
export type LanguageCode = "en" | "tr" | "de" | "es" | "fr";

export interface CaptionCue {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
}

export interface BilingualCue extends CaptionCue {
  translatedText: string;
}

export const isCueActive = (cue: CaptionCue, timeMs: number): boolean =>
  cue.startMs <= timeMs && timeMs < cue.endMs;

export type RuntimeMessage =
  | { type: "START_AI_CAPTURE"; tabId?: number; sourceLanguage: LanguageCode; targetLanguage: LanguageCode; videoTimeMs: number }
  | { type: "STOP_AI_CAPTURE" }
  | { type: "VIDEO_CLOCK"; videoTimeMs: number; paused: boolean; playbackRate: number }
  | { type: "AI_CUES"; cues: BilingualCue[] }
  | { type: "CAPTURE_ERROR"; messageKey: "serviceUnavailable" }
  | { type: "SETTINGS_UPDATED"; settings: import("./settings").UserSettings }
  | { type: "OFFSCREEN_START"; target: "offscreen"; streamId: string; sourceLanguage: LanguageCode; targetLanguage: LanguageCode; videoTimeMs: number }
  | { type: "OFFSCREEN_STOP"; target: "offscreen" };
```

```ts
// packages/contracts/src/settings.ts
import type { LanguageCode } from "./captions";

export type PositionMode = "fixed" | "moving" | "delayed";
export interface TextStyle { color: string; fontSizePx: number; fontWeight: 400 | 500 | 600 | 700; }
export interface UserSettings {
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  positionMode: PositionMode;
  delayMs: number;
  pointerOffsetPx: number;
  fixedPosition: { xRatio: number; yRatio: number };
  sourceStyle: TextStyle;
  translationStyle: TextStyle;
  box: { backgroundColor: string; opacity: number; paddingPx: number; radiusPx: number; lineGapPx: number };
  scope: "global" | "site";
  uiLocale: "auto" | "tr" | "en";
}
```

```ts
// apps/extension/wxt.config.ts
import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "__MSG_appName__",
    description: "__MSG_appDescription__",
    default_locale: "en",
    manifest_version: 3,
    minimum_chrome_version: "116",
    permissions: ["storage", "activeTab", "tabCapture", "offscreen"],
    host_permissions: ["https://www.youtube.com/*", "http://localhost:8787/*"]
  }
});
```

`public/_locales/en/messages.json` ve `public/_locales/tr/messages.json` aynı anahtar kümesini içerir:

```json
{"appName":{"message":"Focapt"},"appDescription":{"message":"Focused bilingual video subtitles"},"sourceLanguage":{"message":"Learning language"},"targetLanguage":{"message":"Native language"},"positionMode":{"message":"Position"},"fixed":{"message":"Fixed"},"moving":{"message":"Moving"},"delayed":{"message":"Delayed"},"delay":{"message":"Delay"},"pointerOffset":{"message":"Pointer distance"},"sourceStyle":{"message":"Learning language style"},"translationStyle":{"message":"Native language style"},"boxStyle":{"message":"Subtitle box"},"scope":{"message":"Scope"},"global":{"message":"All sites"},"site":{"message":"This site"},"uiLanguage":{"message":"Interface language"},"auto":{"message":"Automatic"},"turkish":{"message":"Turkish"},"english":{"message":"English"},"startAi":{"message":"Generate with AI"},"reset":{"message":"Reset defaults"},"noCaptions":{"message":"No captions found — you can generate them with AI"},"translating":{"message":"Translating…"},"translationPending":{"message":"Translation pending"},"serviceUnavailable":{"message":"Caption service is unavailable"}}
```

```json
{"appName":{"message":"Focapt"},"appDescription":{"message":"Odaklı çift dilli video altyazıları"},"sourceLanguage":{"message":"Öğrenilen dil"},"targetLanguage":{"message":"Ana dil"},"positionMode":{"message":"Konum"},"fixed":{"message":"Sabit"},"moving":{"message":"Hareketli"},"delayed":{"message":"Gecikmeli"},"delay":{"message":"Gecikme"},"pointerOffset":{"message":"İmleç mesafesi"},"sourceStyle":{"message":"Öğrenilen dil görünümü"},"translationStyle":{"message":"Ana dil görünümü"},"boxStyle":{"message":"Altyazı kutusu"},"scope":{"message":"Kapsam"},"global":{"message":"Tüm siteler"},"site":{"message":"Bu site"},"uiLanguage":{"message":"Arayüz dili"},"auto":{"message":"Otomatik"},"turkish":{"message":"Türkçe"},"english":{"message":"İngilizce"},"startAi":{"message":"Yapay zekâyla oluştur"},"reset":{"message":"Varsayılana dön"},"noCaptions":{"message":"Altyazı bulunamadı — yapay zekâyla oluşturabilirsiniz"},"translating":{"message":"Çevriliyor…"},"translationPending":{"message":"Çeviri bekleniyor"},"serviceUnavailable":{"message":"Altyazı servisine ulaşılamadı"}}
```

- [ ] **Step 6: Test, tip ve manifest üretimini doğrula**

Run: `npx vitest run packages/contracts/src/captions.test.ts && npm run prepare && npm run typecheck`

Expected: 1 test PASS; WXT tipleri üretilir; TypeScript exit 0 döndürür.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.base.json .gitignore packages apps
git commit -m "chore: scaffold Focapt extension workspace"
```

---

### Task 2: Ayar Doğrulama ve Kalıcı Depolama

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/settings.ts`
- Create: `packages/core/src/settings.test.ts`
- Create: `apps/extension/src/runtime/settings-store.ts`
- Create: `apps/extension/src/runtime/settings-store.test.ts`

**Interfaces:**
- Consumes: `UserSettings` from `@focapt/contracts/settings`.
- Produces: `DEFAULT_SETTINGS`, `normalizeSettings(input): UserSettings`.
- Produces: `Translator.resolveLocale(uiLocale, browserLocale)` and `Translator.t(key)`.
- Produces: `SettingsStore.get(site): Promise<UserSettings>` and `SettingsStore.set(settings, site): Promise<void>`.

- [ ] **Step 1: Varsayılan ve sınırlandırma davranışının başarısız testini yaz**

`packages/core/package.json`:

```json
{"name":"@focapt/core","version":"0.0.0","private":true,"type":"module","exports":{"./settings":"./src/settings.ts","./timeline":"./src/timeline.ts"},"dependencies":{"@focapt/contracts":"*"},"scripts":{"typecheck":"tsc --noEmit"}}
```

```ts
// packages/core/src/settings.test.ts
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "./settings";

describe("normalizeSettings", () => {
  it("gecikmeyi ve görünüm değerlerini güvenli aralığa sıkıştırır", () => {
    const result = normalizeSettings({ delayMs: -5, sourceStyle: { fontSizePx: 90 }, box: { opacity: 3 } });
    expect(result.delayMs).toBe(0);
    expect(result.sourceStyle.fontSizePx).toBe(48);
    expect(result.box.opacity).toBe(1);
    expect(DEFAULT_SETTINGS.delayMs).toBe(600);
  });
});
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `npx vitest run packages/core/src/settings.test.ts`

Expected: FAIL; `./settings` bulunamaz.

- [ ] **Step 3: Ayar normalizasyonunu yaz**

```ts
// packages/core/src/settings.ts
import type { UserSettings } from "@focapt/contracts/settings";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const DEFAULT_SETTINGS: UserSettings = {
  sourceLanguage: "en",
  targetLanguage: "tr",
  positionMode: "fixed",
  delayMs: 600,
  pointerOffsetPx: 18,
  fixedPosition: { xRatio: 0.5, yRatio: 0.82 },
  sourceStyle: { color: "#FFFFFF", fontSizePx: 24, fontWeight: 700 },
  translationStyle: { color: "#FFD166", fontSizePx: 18, fontWeight: 500 },
  box: { backgroundColor: "#080C14", opacity: 0.86, paddingPx: 12, radiusPx: 8, lineGapPx: 4 },
  scope: "global",
  uiLocale: "auto"
};

export function normalizeSettings(input: unknown): UserSettings {
  const value = (input ?? {}) as Partial<UserSettings>;
  const sourceStyle = { ...DEFAULT_SETTINGS.sourceStyle, ...value.sourceStyle };
  const translationStyle = { ...DEFAULT_SETTINGS.translationStyle, ...value.translationStyle };
  const box = { ...DEFAULT_SETTINGS.box, ...value.box };
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    fixedPosition: { ...DEFAULT_SETTINGS.fixedPosition, ...value.fixedPosition },
    sourceStyle: { ...sourceStyle, fontSizePx: clamp(sourceStyle.fontSizePx, 12, 48) },
    translationStyle: { ...translationStyle, fontSizePx: clamp(translationStyle.fontSizePx, 12, 48) },
    uiLocale: (["auto", "tr", "en"] as const).includes(value.uiLocale as "auto" | "tr" | "en") ? value.uiLocale as "auto" | "tr" | "en" : "auto",
    delayMs: clamp(value.delayMs ?? DEFAULT_SETTINGS.delayMs, 0, 3000),
    pointerOffsetPx: clamp(value.pointerOffsetPx ?? DEFAULT_SETTINGS.pointerOffsetPx, 4, 80),
    box: { ...box, opacity: clamp(box.opacity, 0.2, 1), paddingPx: clamp(box.paddingPx, 4, 32), radiusPx: clamp(box.radiusPx, 0, 32), lineGapPx: clamp(box.lineGapPx, 0, 24) }
  };
}
```

- [ ] **Step 4: Tarayıcı deposunu sahte browser nesnesiyle test et ve yaz**

```ts
// apps/extension/src/runtime/settings-store.ts
import { normalizeSettings } from "@focapt/core/settings";
import type { UserSettings } from "@focapt/contracts/settings";

export interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(value: Record<string, unknown>): Promise<void>;
}

export class SettingsStore {
  constructor(private readonly storage: StorageArea) {}
  async get(site: string): Promise<UserSettings> {
    const data = await this.storage.get("focaptSettings");
    const root = (data.focaptSettings ?? {}) as { global?: unknown; sites?: Record<string, unknown> };
    const global = normalizeSettings(root.global);
    return global.scope === "site" ? normalizeSettings(root.sites?.[site] ?? global) : global;
  }
  async set(settings: UserSettings, site: string): Promise<void> {
    const current = await this.storage.get("focaptSettings");
    const root = (current.focaptSettings ?? {}) as { global?: unknown; sites?: Record<string, unknown> };
    const normalized = normalizeSettings(settings);
    const next = normalized.scope === "site"
      ? { ...root, sites: { ...root.sites, [site]: normalized } }
      : { ...root, global: normalized };
    await this.storage.set({ focaptSettings: next });
  }
}
```

```ts
// apps/extension/src/i18n/translator.ts
import { browser } from "wxt/browser";
export type UiLocale = "auto" | "tr" | "en";
type Bundle = Record<string, { message: string }>;
export class Translator {
  constructor(private readonly bundles: Record<"tr" | "en", Bundle>, private readonly browserLocale: () => string) {}
  resolveLocale(value: UiLocale): "tr" | "en" { if (value !== "auto") return value; return this.browserLocale().toLowerCase().startsWith("tr") ? "tr" : "en"; }
  t(key: string, value: UiLocale = "auto"): string { return this.bu…10607 tokens truncated…imeMs, paused, playbackRate)` and `beginChunk(): number`.
- Produces: `OffscreenManager.ensure()` and `close()`.
- Produces `AI_CUES` messages from offscreen document to content script.

- [ ] **Step 1: Saat/seek davranışı için başarısız testi yaz**

```ts
// apps/extension/src/runtime/capture-clock.test.ts
import { expect, it } from "vitest";
import { CaptureClock } from "./capture-clock";

it("her ses parçasını son video saatinden başlatır", () => {
  const clock = new CaptureClock();
  clock.update(12_000, false, 1);
  expect(clock.beginChunk()).toBe(12_000);
  clock.update(48_000, false, 1);
  expect(clock.beginChunk()).toBe(48_000);
});
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `npx vitest run apps/extension/src/runtime/capture-clock.test.ts`

Expected: FAIL; `CaptureClock` bulunamaz.

- [ ] **Step 3: Background ve offscreen yaşam döngüsünü yaz**

```ts
// apps/extension/src/runtime/capture-clock.ts
export class CaptureClock {
  private videoTimeMs = 0;
  private paused = true;
  private playbackRate = 1;
  update(videoTimeMs: number, paused: boolean, playbackRate: number): void { this.videoTimeMs = videoTimeMs; this.paused = paused; this.playbackRate = playbackRate; }
  beginChunk(): number { return Math.round(this.videoTimeMs); }
  canUpload(): boolean { return !this.paused && this.playbackRate > 0; }
}
```

```ts
// apps/extension/src/runtime/offscreen-manager.ts
import { browser } from "wxt/browser";

export class OffscreenManager {
  async ensure(): Promise<void> {
    const url = browser.runtime.getURL("offscreen.html");
    const contexts = await browser.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [url] });
    if (contexts.length === 0) await browser.offscreen.createDocument({ url: "offscreen.html", reasons: ["USER_MEDIA"], justification: "YouTube sekme sesinden kullanıcı isteğiyle altyazı üretmek" });
  }
  async close(): Promise<void> {
    const contexts = await browser.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
    if (contexts.length > 0) await browser.offscreen.closeDocument();
  }
}
```

```ts
// apps/extension/entrypoints/background.ts
import { browser } from "wxt/browser";
import { OffscreenManager } from "../src/runtime/offscreen-manager";
const offscreen = new OffscreenManager();

export default defineBackground(() => {
  browser.runtime.onMessage.addListener(async (message, sender) => {
    if (message.type === "START_AI_CAPTURE") {
      const tabId = message.tabId ?? sender.tab?.id; if (tabId == null) throw new Error("Aktif sekme bulunamadı");
      await offscreen.ensure();
      const streamId = await browser.tabCapture.getMediaStreamId({ targetTabId: tabId });
      await browser.runtime.sendMessage({ type: "OFFSCREEN_START", target: "offscreen", streamId, sourceLanguage: message.sourceLanguage, targetLanguage: message.targetLanguage, videoTimeMs: message.videoTimeMs ?? 0 });
    }
    if (message.type === "STOP_AI_CAPTURE") { await browser.runtime.sendMessage({ type: "OFFSCREEN_STOP", target: "offscreen" }); await offscreen.close(); }
    if (message.type === "VIDEO_CLOCK") await browser.runtime.sendMessage({ ...message, target: "offscreen" });
  });
  browser.tabs.onRemoved.addListener(() => void offscreen.close());
});
```

- [ ] **Step 4: Offscreen kayıt ve yükleyiciyi yaz**

```ts
// apps/extension/entrypoints/offscreen/uploader.ts
import type { BilingualCue, LanguageCode } from "@focapt/contracts/captions";
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export async function uploadChunk(baseUrl: string, blob: Blob, offsetMs: number, sourceLanguage: LanguageCode, targetLanguage: LanguageCode, fetcher: typeof fetch = fetch): Promise<BilingualCue[]> {
  let lastError: unknown;
  for (const delay of [0, 250, 1000]) {
    if (delay) await wait(delay);
    try {
      const form = new FormData(); form.set("audio", blob, "chunk.webm"); form.set("sourceLanguage", sourceLanguage); form.set("offsetMs", String(offsetMs));
      const transcribed = await fetcher(`${baseUrl}/v1/transcribe`, { method: "POST", body: form }); if (!transcribed.ok) throw new Error(String(transcribed.status));
      const cues = (await transcribed.json() as { cues: Array<{ id: string; startMs: number; endMs: number; text: string }> }).cues;
      const translated = await fetcher(`${baseUrl}/v1/translate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cues, sourceLanguage, targetLanguage }) });
      if (!translated.ok) throw new Error(String(translated.status)); return (await translated.json() as { cues: BilingualCue[] }).cues;
    } catch (error) { lastError = error; }
  }
  throw lastError;
}
```

```ts
// apps/extension/entrypoints/offscreen/main.ts
import { browser } from "wxt/browser";
import { CaptureClock } from "../../src/runtime/capture-clock";
import { uploadChunk } from "./uploader";
const clock = new CaptureClock(); let recorder: MediaRecorder | undefined; let media: MediaStream | undefined;
browser.runtime.onMessage.addListener(async (message) => {
  if (message.target !== "offscreen") return;
  if (message.type === "VIDEO_CLOCK") clock.update(message.videoTimeMs, message.paused, message.playbackRate);
  if (message.type === "OFFSCREEN_STOP") { recorder?.stop(); media?.getTracks().forEach((track) => track.stop()); }
  if (message.type === "OFFSCREEN_START") {
    clock.update(message.videoTimeMs, false, 1);
    media = await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: message.streamId } } as MediaTrackConstraints, video: false });
    const audio = new AudioContext(); audio.createMediaStreamSource(media).connect(audio.destination);
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
    recorder = new MediaRecorder(media, { mimeType });
    recorder.ondataavailable = async (event) => { if (!clock.canUpload() || event.data.size === 0) return; try { const cues = await uploadChunk(import.meta.env.WXT_CAPTION_API_URL, event.data, clock.beginChunk(), message.sourceLanguage, message.targetLanguage); await browser.runtime.sendMessage({ type: "AI_CUES", cues }); } catch { await browser.runtime.sendMessage({ type: "CAPTURE_ERROR", messageKey: "serviceUnavailable" }); } };
    recorder.start(5000);
  }
});
```

```ts
// apps/extension/entrypoints/offscreen/uploader.test.ts
import { expect, it, vi } from "vitest";
import { uploadChunk } from "./uploader";
it("ilk iki geçici hatadan sonra üçüncü istekte cue döndürür", async () => {
  vi.useFakeTimers(); let transcriptionAttempts = 0;
  const fetcher = vi.fn(async (url: string) => {
    if (url.endsWith("/v1/transcribe") && ++transcriptionAttempts < 3) return new Response("down", { status: 503 });
    if (url.endsWith("/v1/transcribe")) return new Response(JSON.stringify({ cues: [{ id: "1", startMs: 0, endMs: 1000, text: "Hello" }] }), { status: 200 });
    return new Response(JSON.stringify({ cues: [{ id: "1", startMs: 0, endMs: 1000, text: "Hello", translatedText: "Merhaba" }] }), { status: 200 });
  });
  const promise = uploadChunk("http://localhost:8787", new Blob(["a"], { type: "audio/webm" }), 0, "en", "tr", fetcher as typeof fetch);
  await vi.runAllTimersAsync(); expect((await promise)[0]?.translatedText).toBe("Merhaba"); vi.useRealTimers();
});
```

- [ ] **Step 5: Yakalama testlerini çalıştır**

Run: `npx vitest run apps/extension/src/runtime/capture-clock.test.ts apps/extension/src/runtime/offscreen-manager.test.ts apps/extension/entrypoints/offscreen/uploader.test.ts && npm run typecheck`

Expected: kullanıcı hareketi kapısı, tek offscreen belge, 5 saniyelik parça offset'i, pause/seek ve sınırlı retry testleri PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/extension/entrypoints/background.ts apps/extension/entrypoints/offscreen* apps/extension/src/runtime/capture-clock* apps/extension/src/runtime/offscreen-manager*
git commit -m "feat: stream tab audio for AI captions"
```

---

### Task 9: Entegrasyon Durumları, Önbellek ve Hata Güvenliği

**Files:**
- Create: `apps/extension/src/runtime/caption-cache.ts`
- Create: `apps/extension/src/runtime/caption-cache.test.ts`
- Create: `apps/extension/src/runtime/source-policy.ts`
- Modify: `apps/extension/src/runtime/orchestrator.ts`
- Modify: `apps/extension/entrypoints/youtube.content.ts`
- Modify: `apps/extension/src/overlay/subtitle-overlay.ts`
- Create: `apps/extension/src/runtime/integration.test.ts`

**Interfaces:**
- Produces: `CaptionCache.get(videoId, source, target)` and `set(...)`.
- Produces kullanıcı durumları: `ready`, `generating`, `translating`, `offline`, `unsupported`, `temporary-error`.

- [ ] **Step 1: Kaynak önceliği ve eski metni temizleme için başarısız entegrasyon testini yaz**

```ts
// apps/extension/src/runtime/integration.test.ts
import { expect, it, vi } from "vitest";
import { chooseCaptionAction } from "./source-policy";
import { SubtitleOrchestrator } from "./orchestrator";

it("platform track'i AI yakalamadan önce seçer", () => {
  expect(chooseCaptionAction({ hasPlatformTrack: true, hasPlatformCache: false, hasAiCache: false })).toBe("fetch-platform");
  expect(chooseCaptionAction({ hasPlatformTrack: false, hasPlatformCache: false, hasAiCache: false })).toBe("offer-ai");
});

it("altyazı boşluğunda eski cue'yu temizler ve videoyu durdurmaz", () => {
  const overlay = { setCue: vi.fn() }; const video = { currentTime: 1.5, pause: vi.fn() } as unknown as HTMLVideoElement;
  const timeline = { at: () => null }; const frame = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(() => 1);
  const orchestrator = new SubtitleOrchestrator(video, timeline, overlay); orchestrator.start();
  expect(overlay.setCue).toHaveBeenCalledWith(null); expect(video.pause).not.toHaveBeenCalled(); orchestrator.destroy(); frame.mockRestore();
});
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `npx vitest run apps/extension/src/runtime/integration.test.ts`

Expected: FAIL; durum makinesi ve cache davranışları eksiktir.

- [ ] **Step 3: Önbellek ve durum makinesini yaz**

```ts
// apps/extension/src/runtime/caption-cache.ts
import type { BilingualCue, LanguageCode } from "@focapt/contracts/captions";
type Storage = { get(key: string): Promise<Record<string, unknown>>; set(value: Record<string, unknown>): Promise<void> };
type Entry = { savedAt: number; cues: BilingualCue[] };
export class CaptionCache {
  constructor(private storage: Storage, private now: () => number = Date.now) {}
  private key(site: string, videoId: string, source: LanguageCode, target: LanguageCode) { return `caption:${site}:${videoId}:${source}:${target}`; }
  async get(site: string, videoId: string, source: LanguageCode, target: LanguageCode): Promise<BilingualCue[] | null> {
    const key = this.key(site, videoId, source, target); const entry = (await this.storage.get(key))[key] as Entry | undefined;
    return entry && this.now() - entry.savedAt <= 30 * 24 * 60 * 60 * 1000 ? entry.cues : null;
  }
  async set(site: string, videoId: string, source: LanguageCode, target: LanguageCode, cues: BilingualCue[]): Promise<void> {
    const key = this.key(site, videoId, source, target); await this.storage.set({ [key]: { savedAt: this.now(), cues } satisfies Entry });
  }
}
```

```ts
// apps/extension/src/runtime/source-policy.ts
export type CaptionAction = "use-platform-cache" | "fetch-platform" | "use-ai-cache" | "offer-ai";
export function chooseCaptionAction(input: { hasPlatformTrack: boolean; hasPlatformCache: boolean; hasAiCache: boolean }): CaptionAction {
  if (input.hasPlatformCache) return "use-platform-cache";
  if (input.hasPlatformTrack) return "fetch-platform";
  if (input.hasAiCache) return "use-ai-cache";
  return "offer-ai";
}
```

```ts
// apps/extension/src/runtime/caption-cache.test.ts
import { expect, it } from "vitest";
import { CaptionCache } from "./caption-cache";
it("30 günden eski cue önbelleğini reddeder", async () => {
  const data: Record<string, unknown> = {}; const storage = { async get(key: string) { return { [key]: data[key] }; }, async set(value: Record<string, unknown>) { Object.assign(data, value); } };
  let now = 1_000; const cache = new CaptionCache(storage, () => now); const cues = [{ id: "1", startMs: 0, endMs: 1, text: "a", translatedText: "b" }];
  await cache.set("youtube", "v1", "en", "tr", cues); expect(await cache.get("youtube", "v1", "en", "tr")).toEqual(cues);
  now += 31 * 24 * 60 * 60 * 1000; expect(await cache.get("youtube", "v1", "en", "tr")).toBeNull();
});
```

- [ ] **Step 4: Entegrasyon testini ve bütün unit testleri çalıştır**

Run: `npm test`

Expected: bütün workspace testleri PASS; yakalanmamış promise rejection veya console error yok.

- [ ] **Step 5: Build ve commit**

Run: `npm run build && npm run typecheck`

Expected: API ve eklenti build'leri exit 0; `apps/extension/.output/chrome-mv3/manifest.json` minimum Chrome 116 ve gerekli izinleri içerir.

```bash
git add apps/extension/src/runtime apps/extension/src/overlay apps/extension/entrypoints/youtube.content.ts
git commit -m "feat: handle cache and subtitle fallback states"
```

---

### Task 10: Paketlenmiş Eklenti Uçtan Uca Testi ve Kullanım Dokümanı

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/fixtures/youtube-like.html`
- Create: `e2e/extension.spec.ts`
- Create: `e2e/fake-caption-api.ts`
- Create: `README.md`
- Create: `docs/privacy.md`

**Interfaces:**
- Produces: Paketlenmiş Chrome MV3 eklentisini kalıcı context içinde başlatan Playwright fixture.
- Produces: Kurulum, geliştirme, HF token, izinler ve manuel YouTube smoke-test adımları.

- [ ] **Step 1: Başarısız uçtan uca testi yaz**

```ts
// e2e/extension.spec.ts
import { expect, test } from "./extension.fixture";

test("iki altyazıyı gösterir ve üç konum modunu değiştirir", async ({ extensionContext }) => {
  const page = await extensionContext.newPage();
  await page.goto("http://127.0.0.1:4173/e2e/fixtures/youtube-like.html");
  const host = page.locator("focapt-subtitle-overlay");
  await expect(host).toBeVisible();
  await expect(host.locator("[data-source]")).toContainText("Practice makes progress.");
  await expect(host.locator("[data-translation]")).toContainText("Pratik yapmak ilerleme sağlar.");
  await page.mouse.move(420, 260);
  await expect(host).toHaveAttribute("data-mode", "moving");
});
```

Fixture, 60 saniyelik sessiz video öğesi ve kontrollü `focapt:youtube-tracks` eventi üretir; fake API deterministik Türkçe çeviri döndürür. Test gerçek YouTube ağına bağlı değildir.

- [ ] **Step 2: E2E testinin doğru nedenle başarısız olduğunu doğrula**

Run: `npm run build && npm run e2e`

Expected: FAIL; fixture ortamında eklenti veya test sunucusu henüz bağlanmadığı için overlay görünmez.

- [ ] **Step 3: Playwright extension fixture'ını tamamla**

```ts
// playwright.config.ts
import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "./e2e", workers: 1, fullyParallel: false, use: { baseURL: "http://127.0.0.1:4173" }, webServer: [
  { command: "npx vite --host 127.0.0.1 --port 4173", port: 4173, reuseExistingServer: false },
  { command: "npx tsx e2e/fake-caption-api.ts", port: 8787, reuseExistingServer: false }
] });
```

```ts
// e2e/extension.fixture.ts
import { chromium, test as base } from "@playwright/test";
import path from "node:path";
export const test = base.extend<{ extensionContext: Awaited<ReturnType<typeof chromium.launchPersistentContext>> }>({
  extensionContext: async ({}, use) => {
    const extensionPath = path.resolve("apps/extension/.output/chrome-mv3");
    const context = await chromium.launchPersistentContext("", { headless: false, args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
    await use(context); await context.close();
  }
});
export { expect } from "@playwright/test";
```

İlk testin yanına şu odaklı testleri ekle:

```ts
test("gecikmeli mod 600 ms sonra görünür", async ({ extensionContext }) => {
  const page = await extensionContext.newPage(); await page.goto("http://127.0.0.1:4173/e2e/fixtures/youtube-like.html");
  const host = page.locator("focapt-subtitle-overlay"); await page.mouse.move(300, 220); await expect(host).toHaveCSS("visibility", "hidden"); await page.waitForTimeout(599); await expect(host).toHaveCSS("visibility", "hidden"); await page.waitForTimeout(1); await expect(host).toBeVisible();
});
test("iki satırın stilini ayrı uygular", async ({ extensionContext }) => {
  const page = await extensionContext.newPage(); await page.goto("http://127.0.0.1:4173/e2e/fixtures/youtube-like.html");
  await expect(page.locator("focapt-subtitle-overlay [data-source]")).toHaveCSS("font-size", "28px");
  await expect(page.locator("focapt-subtitle-overlay [data-translation]")).toHaveCSS("font-size", "16px");
});
```

- [ ] **Step 4: README ve gizlilik dokümanını yaz**

`README.md` şu komutları eksiksiz içerir: `npm install`, `Copy-Item apps/api/.env.example apps/api/.env`, `npm run dev -w @focapt/api`, `npm run dev -w @focapt/extension`, `npm test`, `npm run e2e`, `npm run build`. Ayrıca Chrome 116+, YouTube önceliği, kullanıcı hareketi gerektiren AI capture, desteklenen ilk dil kümesi (`en`, `tr`, `de`, `es`, `fr`) ve yükleme dizini `apps/extension/.output/chrome-mv3` açıklanır.

`docs/privacy.md`, platform altyazısı varken ses gönderilmediğini; AI açıkça başlatıldığında 5 saniyelik parçaların API'ye ve yapılandırılmış Hugging Face sağlayıcısına iletildiğini; token'ın yalnız backend'de kaldığını; tarayıcı deposuna ses yazılmadığını açıklar.

- [ ] **Step 5: Tam doğrulama paketini çalıştır**

Run: `npm test && npm run typecheck && npm run build && npm run e2e`

Expected: unit/integration testlerinin tamamı PASS; TypeScript ve iki build exit 0; Playwright'ın sabit, hareketli, 600 ms gecikmeli ve bağımsız stil senaryoları PASS.

- [ ] **Step 6: Manuel YouTube smoke testini çalıştır**

Chrome 116+ içinde paketlenmiş eklentiyi yükle ve iki video kullan:

1. Platform altyazılı videoda AI capture başlamadan çift altyazının görünmesi.
2. Platform altyazısız videoda kullanıcı “Yapay zekâyla oluştur” düğmesine bastıktan sonra capture göstergesinin ve akış cue'larının görünmesi.
3. Her videoda normal, sinema ve tam ekran; pause; ileri/geri sarma; 0.75x, 1x ve 1.5x hız.
4. Sabit sürükleme, hareketli takip, 600 ms gecikme ve iki dilin farklı renk/boyut ayarı.
5. Eklentiyi kapattıktan sonra YouTube oynatımının ve kontrollerinin normal çalışması.

Beklenen: beş kontrol grubunun tamamı başarılı; başarısız bir grup varsa commit öncesi ilgili otomatik test eklenir.

- [ ] **Step 7: Son commit**

```bash
git add playwright.config.ts e2e README.md docs/privacy.md
git commit -m "test: verify YouTube bilingual subtitle MVP"
```

---

## Uygulama Sonu Kabul Kontrolü

- [ ] YouTube platform altyazısı kaynak olarak alınabiliyor.
- [ ] Platform altyazısı yokken yalnız kullanıcı hareketi sonrası ses yakalama başlıyor.
- [ ] Kaynak ve çeviri alt alta, doğru video zamanında gösteriliyor.
- [ ] Sabit, hareketli ve tam 600 ms varsayılanlı gecikmeli mod çalışıyor.
- [ ] İki dilin renk, boyut ve kalınlığı bağımsız ayarlanıyor.
- [ ] Kutu rengi, saydamlığı, padding, radius, satır boşluğu ve imleç uzaklığı ayarlanıyor.
- [ ] Ayarlar global veya YouTube'a özel saklanıyor.
- [ ] Video/ses tarayıcı deposuna yazılmıyor.
- [ ] Normal, sinema ve tam ekran davranışları doğrulanıyor.
- [ ] Hata ve servis kesintileri YouTube oynatımını durdurmuyor.
- [ ] `npm test && npm run typecheck && npm run build && npm run e2e` exit 0 dönüyor.

