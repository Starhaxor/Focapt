# YouTube Player Panel, Languages, Theme, and Caption Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore visible bilingual YouTube subtitles and add a synchronized themed player panel with YouTube's complete translation-language catalog.

**Architecture:** The MAIN-world script extracts the YouTube caption catalog and performs page-context timed-text requests. A validated `window.postMessage` protocol carries plain catalog/cue data to the isolated content script, which owns settings, rendering, cancellation, and a Shadow DOM player panel. Popup and player panel share one normalized settings record.

**Tech Stack:** TypeScript 7, WXT 0.20, Chrome MV3, Vitest 4, happy-dom, native WebExtension and DOM APIs.

## Global Constraints

- YouTube is the only supported site in this release.
- No external API, token, account, or local server is allowed.
- Both language selectors expose YouTube's complete translation catalog for the current video.
- Default learning language is English; default native language is the supported browser UI language or English.
- Theme choices are exactly `system`, `light`, and `dark`.
- The player panel is compact; detailed subtitle appearance controls remain in the popup.
- Focapt failures must never interrupt YouTube playback.
- All production changes follow red-green TDD and each task ends with a focused commit.

---

## File Structure

- `packages/contracts/src/captions.ts`: unrestricted language-code and bridge-facing caption types.
- `packages/contracts/src/settings.ts`: shared `enabled` and `theme` settings.
- `packages/core/src/languages.ts`: language-code validation, catalog normalization, and browser-locale defaults.
- `packages/core/src/settings.ts`: settings defaults and normalization.
- `apps/extension/src/youtube/player-response.ts`: YouTube caption-track and translation-language catalog extraction.
- `apps/extension/src/youtube/page-caption-protocol.ts`: cross-world message schemas and validators.
- `apps/extension/src/youtube/page-caption-client.ts`: isolated-world request client with cancellation and request correlation.
- `apps/extension/entrypoints/youtube-main.content.ts`: MAIN-world catalog publisher and caption request handler.
- `apps/extension/entrypoints/youtube.content.ts`: bilingual orchestration and lifecycle integration.
- `apps/extension/src/theme/theme.ts`: system/light/dark resolution and DOM application.
- `apps/extension/src/popup/language-options.ts`: catalog-driven select rendering.
- `apps/extension/src/youtube/player-panel.ts`: YouTube control button and compact Shadow DOM panel.
- `apps/extension/entrypoints/popup/*`: popup theme and dynamic language controls.
- `apps/extension/public/_locales/{en,tr}/messages.json`: localized controls and statuses.

---

### Task 1: Generalize language and settings contracts

**Files:**
- Modify: `packages/contracts/src/captions.ts`
- Modify: `packages/contracts/src/settings.ts`
- Create: `packages/core/src/languages.ts`
- Create: `packages/core/src/languages.test.ts`
- Modify: `packages/core/src/settings.ts`
- Modify: `packages/core/src/settings.test.ts`

**Interfaces:**
- Produces: `LanguageOption`, `isYouTubeLanguageCode(value)`, `normalizeLanguageCatalog(options)`, `resolveDefaultLanguages(browserLocale, options)`.
- Produces: `UserSettings.enabled` and `UserSettings.theme`.

- [ ] **Step 1: Write failing language and settings tests**

```ts
expect(isYouTubeLanguageCode("zh-Hans")).toBe(true);
expect(isYouTubeLanguageCode("pt-BR")).toBe(true);
expect(isYouTubeLanguageCode("javascript:")).toBe(false);
expect(normalizeLanguageCatalog([
  { languageCode: "tr", label: "Türkçe" },
  { languageCode: "tr", label: "Duplicate" },
  { languageCode: "zh-Hans", label: "中文（简体）" }
])).toEqual([
  { languageCode: "tr", label: "Türkçe" },
  { languageCode: "zh-Hans", label: "中文（简体）" }
]);
expect(resolveDefaultLanguages("tr-TR", [{ languageCode: "en", label: "English" }, { languageCode: "tr", label: "Türkçe" }]))
  .toEqual({ sourceLanguage: "en", targetLanguage: "tr" });
expect(resolveDefaultLanguages("xx-YY", [{ languageCode: "en", label: "English" }]))
  .toEqual({ sourceLanguage: "en", targetLanguage: "en" });
expect(normalizeSettings({ enabled: false, theme: "dark", sourceLanguage: "zh-Hans" }))
  .toMatchObject({ enabled: false, theme: "dark", sourceLanguage: "zh-Hans" });
expect(normalizeSettings({ theme: "neon", targetLanguage: "javascript:" }))
  .toMatchObject({ theme: "system", targetLanguage: "tr" });
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm test -- packages/core/src/languages.test.ts packages/core/src/settings.test.ts`

Expected: FAIL because the language helpers, `enabled`, and `theme` do not exist.

- [ ] **Step 3: Implement the minimal contracts and normalization**

```ts
export type LanguageCode = string;
export interface LanguageOption { languageCode: LanguageCode; label: string }

export type ThemePreference = "system" | "light" | "dark";
export interface UserSettings {
  enabled: boolean;
  theme: ThemePreference;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  positionMode: "fixed" | "moving" | "delayed";
  delayMs: number;
  pointerOffsetPx: number;
  fixedPosition: { xRatio: number; yRatio: number };
  sourceStyle: TextStyle;
  translationStyle: TextStyle;
  box: { backgroundColor: string; opacity: number; paddingPx: number; radiusPx: number; lineGapPx: number };
  scope: "global" | "site";
  uiLocale: "auto" | "tr" | "en";
}

const LANGUAGE_CODE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/;
export const isYouTubeLanguageCode = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 35 && LANGUAGE_CODE.test(value);

export function resolveDefaultLanguages(browserLocale: string, options: readonly LanguageOption[]) {
  const browser = browserLocale.toLowerCase();
  const base = browser.split("-")[0] ?? "";
  const exact = options.find((option) => option.languageCode.toLowerCase() === browser);
  const baseMatch = options.find((option) => option.languageCode.toLowerCase() === base);
  const english = options.find((option) => option.languageCode.toLowerCase() === "en");
  return { sourceLanguage: english?.languageCode ?? "en", targetLanguage: exact?.languageCode ?? baseMatch?.languageCode ?? english?.languageCode ?? "en" };
}
```

Set `DEFAULT_SETTINGS.enabled = true`, `DEFAULT_SETTINGS.theme = "system"`, `sourceLanguage = "en"`, and `targetLanguage = "en"`. Existing installations retain an explicitly stored target language; Task 4 resolves the browser-language target only when storage has no explicit settings.

- [ ] **Step 4: Run focused and dependent tests**

Run: `npm test -- packages/core/src/languages.test.ts packages/core/src/settings.test.ts apps/extension/src/runtime/settings-store.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/contracts/src/captions.ts packages/contracts/src/settings.ts packages/core/src/languages.ts packages/core/src/languages.test.ts packages/core/src/settings.ts packages/core/src/settings.test.ts
git commit -m "feat: support YouTube language catalogs and themes"
```

---

### Task 2: Extract the complete YouTube caption catalog

**Files:**
- Modify: `apps/extension/src/youtube/player-response.ts`
- Modify: `apps/extension/src/youtube/player-response.test.ts`
- Modify: `apps/extension/src/youtube/content-runtime.ts`
- Modify: `apps/extension/src/youtube/content-runtime.test.ts`

**Interfaces:**
- Consumes: `LanguageOption`, `isYouTubeLanguageCode`.
- Produces: `YouTubeCaptionCatalog`, `extractCaptionCatalog(response)`, `selectBaseCaptionTrack(tracks, language)`.

- [ ] **Step 1: Write failing catalog and selection tests**

```ts
const response = { captions: { playerCaptionsTracklistRenderer: {
  captionTracks: [
    { baseUrl: "https://www.youtube.com/api/timedtext?v=1", languageCode: "en", name: { simpleText: "English" }, isTranslatable: true },
    { baseUrl: "https://www.youtube.com/api/timedtext?v=2", languageCode: "de", name: { simpleText: "Deutsch" } }
  ],
  translationLanguages: [
    { languageCode: "tr", languageName: { simpleText: "Türkçe" } },
    { languageCode: "zh-Hans", languageName: { simpleText: "中文（简体）" } }
  ],
  defaultAudioTrackIndex: 0
}}};
expect(extractCaptionCatalog(response)).toMatchObject({
  tracks: [{ languageCode: "en", isTranslatable: true }, { languageCode: "de", isTranslatable: false }],
  languages: [{ languageCode: "tr", label: "Türkçe" }, { languageCode: "zh-Hans", label: "中文（简体）" }]
});
expect(selectBaseCaptionTrack(extractCaptionCatalog(response).tracks, "fr")?.languageCode).toBe("en");
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm test -- apps/extension/src/youtube/player-response.test.ts apps/extension/src/youtube/content-runtime.test.ts`

Expected: FAIL because catalog extraction and fallback selection are missing.

- [ ] **Step 3: Implement catalog extraction and base-track selection**

```ts
export interface YouTubeCaptionTrack {
  baseUrl: string;
  languageCode: string;
  label: string;
  isTranslatable: boolean;
  isDefault: boolean;
}
export interface YouTubeCaptionCatalog {
  tracks: YouTubeCaptionTrack[];
  languages: LanguageOption[];
}
export function extractCaptionCatalog(response: unknown): YouTubeCaptionCatalog;
export function selectBaseCaptionTrack(
  tracks: readonly YouTubeCaptionTrack[],
  selectedLanguage: string
): YouTubeCaptionTrack | undefined;
```

Keep `extractCaptionTracks` as a compatibility wrapper returning `extractCaptionCatalog(response).tracks` until Task 4 removes its old consumers.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- apps/extension/src/youtube/player-response.test.ts apps/extension/src/youtube/content-runtime.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/extension/src/youtube/player-response.ts apps/extension/src/youtube/player-response.test.ts apps/extension/src/youtube/content-runtime.ts apps/extension/src/youtube/content-runtime.test.ts
git commit -m "feat: extract YouTube translation catalog"
```

---

### Task 3: Add the validated page-context caption bridge

**Files:**
- Create: `apps/extension/src/youtube/page-caption-protocol.ts`
- Create: `apps/extension/src/youtube/page-caption-protocol.test.ts`
- Create: `apps/extension/src/youtube/page-caption-client.ts`
- Create: `apps/extension/src/youtube/page-caption-client.test.ts`
- Modify: `apps/extension/entrypoints/youtube-main.content.ts`
- Modify: `apps/extension/src/youtube/bridge.ts`
- Modify: `apps/extension/src/youtube/bridge.test.ts`

**Interfaces:**
- Consumes: `YouTubeCaptionCatalog`, `CaptionCue`, `parseJson3`.
- Produces: `CaptionPageRequest`, `CaptionPageResponse`, `createJson3Url(baseUrl, language)`, `YouTubePageCaptionClient.requestCatalog()`, `YouTubePageCaptionClient.load(track, language, signal)`.

- [ ] **Step 1: Write failing protocol validation tests**

```ts
const request = createCaptionRequest("req-1", "HAG4uyrkVfA", track, "tr");
expect(readCaptionRequest(request)).toEqual(request);
expect(readCaptionRequest({ ...request, language: "javascript:" })).toBeNull();
expect(readCaptionRequest({ ...request, track: { ...track, baseUrl: "https://evil.example/x" } })).toBeNull();
expect(readCaptionResponse({
  channel: "focapt:youtube-caption-response",
  requestId: "req-1",
  videoId: "HAG4uyrkVfA",
  ok: true,
  cues: [{ id: "1", startMs: 0, endMs: 1000, text: "Merhaba" }]
})).not.toBeNull();
```

- [ ] **Step 2: Write failing client correlation/cancellation/retry tests**

```ts
const client = new YouTubePageCaptionClient(fakeWindow, { timeoutMs: 1000, maxEmptyRetries: 1 });
const pending = client.load(track, "tr", abortController.signal);
expect(sentRequests).toHaveLength(1);
emitResponse({ requestId: sentRequests[0].requestId, ok: true, cues: [] });
expect(sentRequests).toHaveLength(2);
emitResponse({ requestId: sentRequests[1].requestId, ok: true, cues: translated });
await expect(pending).resolves.toEqual(translated);
abortController.abort();
await expect(client.load(track, "tr", abortController.signal)).rejects.toMatchObject({ name: "AbortError" });
```

- [ ] **Step 3: Run tests and confirm RED**

Run: `npm test -- apps/extension/src/youtube/page-caption-protocol.test.ts apps/extension/src/youtube/page-caption-client.test.ts`

Expected: FAIL because protocol and client files do not exist.

- [ ] **Step 4: Implement the protocol and isolated client**

Use these exact channel names:

```ts
export const CATALOG_CHANNEL = "focapt:youtube-catalog";
export const CAPTION_REQUEST_CHANNEL = "focapt:youtube-caption-request";
export const CAPTION_RESPONSE_CHANNEL = "focapt:youtube-caption-response";
```

`createJson3Url(baseUrl: string, language: string | null): URL` must accept only `https://*.youtube.com/api/timedtext`, force `fmt=json3`, add `tlang` for a non-null language, and remove `tlang` for the raw base track. `YouTubePageCaptionClient.load(track, language: string | null, signal)` must use monotonically unique request IDs, accept only `event.source === window`, correlate response IDs, clear timeout/listeners, retry one empty successful response, and reject aborts with `DOMException("Aborted", "AbortError")`.

- [ ] **Step 5: Implement MAIN-world request handling**

```ts
window.addEventListener("message", async (event) => {
  if (event.source !== window) return;
  const request = readCaptionRequest(event.data);
  if (!request || request.videoId !== currentVideoId()) return;
  try {
    const url = createJson3Url(request.track.baseUrl, request.language);
    const response = await fetch(url, { credentials: "include" });
    const text = await response.text();
    const cues = text ? parseJson3(JSON.parse(text)) : [];
    window.postMessage(createCaptionSuccess(request, cues), location.origin);
  } catch {
    window.postMessage(createCaptionFailure(request, "CAPTION_LOAD_FAILED"), location.origin);
  }
});
```

Publish `extractCaptionCatalog(response)` on navigation, initial load, and explicit catalog requests. Do not expose browser storage or runtime APIs to MAIN world.

- [ ] **Step 6: Run bridge tests**

Run: `npm test -- apps/extension/src/youtube/page-caption-protocol.test.ts apps/extension/src/youtube/page-caption-client.test.ts apps/extension/src/youtube/bridge.test.ts apps/extension/src/youtube/json3.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add apps/extension/src/youtube/page-caption-protocol.ts apps/extension/src/youtube/page-caption-protocol.test.ts apps/extension/src/youtube/page-caption-client.ts apps/extension/src/youtube/page-caption-client.test.ts apps/extension/entrypoints/youtube-main.content.ts apps/extension/src/youtube/bridge.ts apps/extension/src/youtube/bridge.test.ts
git commit -m "feat: load captions in YouTube page context"
```

---

### Task 4: Reconnect bilingual rendering and visibility

**Files:**
- Modify: `apps/extension/entrypoints/youtube.content.ts`
- Modify: `apps/extension/src/youtube/content-runtime.ts`
- Modify: `apps/extension/src/youtube/content-runtime.test.ts`
- Modify: `apps/extension/src/overlay/subtitle-overlay.ts`
- Modify: `apps/extension/src/overlay/subtitle-overlay.test.ts`
- Modify: `apps/extension/src/runtime/settings-store.ts`
- Modify: `apps/extension/src/runtime/settings-store.test.ts`
- Delete: `apps/extension/src/youtube/caption-source.ts`
- Delete: `apps/extension/src/youtube/caption-source.test.ts`

**Interfaces:**
- Consumes: `YouTubePageCaptionClient`, `selectBaseCaptionTrack`, `mergeBilingualCues`, `UserSettings.enabled`.
- Produces: visible bilingual timeline and `GET_LANGUAGE_CATALOG` runtime response.

- [ ] **Step 1: Write failing bilingual fallback tests**

```ts
const plan = createBilingualLoadPlan(catalog, { sourceLanguage: "fr", targetLanguage: "tr" });
expect(plan).toMatchObject({
  baseTrack: { languageCode: "en" },
  sourceRequestLanguage: "fr",
  targetRequestLanguage: "tr"
});
expect(createBilingualLoadPlan(catalog, { sourceLanguage: "en", targetLanguage: "tr" }))
  .toMatchObject({ sourceRequestLanguage: null, targetRequestLanguage: "tr" });
```

- [ ] **Step 2: Write failing enabled/disabled overlay test**

```ts
overlay.applySettings({ ...DEFAULT_SETTINGS, enabled: false });
overlay.setCue(cue);
expect(overlay.host.hidden).toBe(true);
overlay.applySettings({ ...DEFAULT_SETTINGS, enabled: true });
expect(overlay.host.hidden).toBe(false);
```

- [ ] **Step 3: Run tests and confirm RED**

Run: `npm test -- apps/extension/src/youtube/content-runtime.test.ts apps/extension/src/overlay/subtitle-overlay.test.ts`

Expected: FAIL because the load plan and enabled state are missing.

- [ ] **Step 4: Implement the bilingual load plan and runtime integration**

On each valid catalog:

```ts
const plan = createBilingualLoadPlan(catalog, mountedSettings);
if (!plan) return showStatus("noCaptions");
const sourcePromise = plan.sourceRequestLanguage
  ? pageCaptions.load(plan.baseTrack, plan.sourceRequestLanguage, signal)
  : pageCaptions.load(plan.baseTrack, null, signal);
const targetPromise = pageCaptions.load(plan.baseTrack, plan.targetRequestLanguage, signal);
const [source, target] = await Promise.all([sourcePromise, targetPromise]);
timeline.replace(mergeBilingualCues(source, target));
```

Add `SettingsStore.hasExplicitSettings(site): Promise<boolean>` by checking whether `focaptSettings.global` or `focaptSettings.sites[site]` exists. On the first valid catalog, when this method is false, resolve English/browser-language defaults through `browser.i18n.getUILanguage()`, persist them, and apply them before loading captions. Cache the latest catalog in `ContentMessageBridge` and respond to `GET_LANGUAGE_CATALOG` with plain options. Cancel active work on settings changes and navigation. Remove all isolated-world `YouTubeCaptionSource` imports and files.

- [ ] **Step 5: Run caption and overlay tests**

Run: `npm test -- apps/extension/src/youtube/content-runtime.test.ts apps/extension/src/youtube/bilingual-cues.test.ts apps/extension/src/overlay/subtitle-overlay.test.ts apps/extension/src/runtime/settings-store.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/extension/entrypoints/youtube.content.ts apps/extension/src/youtube/content-runtime.ts apps/extension/src/youtube/content-runtime.test.ts apps/extension/src/overlay/subtitle-overlay.ts apps/extension/src/overlay/subtitle-overlay.test.ts apps/extension/src/runtime/settings-store.ts apps/extension/src/runtime/settings-store.test.ts apps/extension/src/youtube/caption-source.ts apps/extension/src/youtube/caption-source.test.ts
git commit -m "fix: restore visible bilingual YouTube captions"
```

---

### Task 5: Add shared theme and live language controls to the popup

**Files:**
- Create: `apps/extension/src/theme/theme.ts`
- Create: `apps/extension/src/theme/theme.test.ts`
- Create: `apps/extension/src/popup/language-options.ts`
- Create: `apps/extension/src/popup/language-options.test.ts`
- Modify: `apps/extension/src/popup/settings-form.ts`
- Modify: `apps/extension/src/popup/settings-form.test.ts`
- Modify: `apps/extension/entrypoints/popup/index.html`
- Modify: `apps/extension/entrypoints/popup/main.ts`
- Modify: `apps/extension/entrypoints/popup/style.css`
- Modify: `apps/extension/public/_locales/en/messages.json`
- Modify: `apps/extension/public/_locales/tr/messages.json`
- Modify: `apps/extension/entrypoints/popup/locale-parity.test.ts`

**Interfaces:**
- Consumes: `ThemePreference`, `LanguageOption`, `GET_LANGUAGE_CATALOG`.
- Produces: `resolveTheme`, `applyTheme`, `populateLanguageSelect`.

- [ ] **Step 1: Write failing theme and language-option tests**

```ts
expect(resolveTheme("system", { matches: true })).toBe("dark");
expect(resolveTheme("light", { matches: true })).toBe("light");
applyTheme(document.documentElement, "dark");
expect(document.documentElement.dataset.theme).toBe("dark");
populateLanguageSelect(select, catalog.languages, "zh-Hans");
expect([...select.options].map((option) => [option.value, option.text]))
  .toContainEqual(["zh-Hans", "中文（简体）"]);
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm test -- apps/extension/src/theme/theme.test.ts apps/extension/src/popup/language-options.test.ts apps/extension/src/popup/settings-form.test.ts`

Expected: FAIL because theme/catalog helpers and form fields are absent.

- [ ] **Step 3: Implement theme and catalog helpers**

```ts
export type ResolvedTheme = "light" | "dark";
export const resolveTheme = (preference: ThemePreference, media: Pick<MediaQueryList, "matches">): ResolvedTheme =>
  preference === "system" ? (media.matches ? "dark" : "light") : preference;
export const applyTheme = (root: HTMLElement, theme: ResolvedTheme): void => {
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
};
```

`populateLanguageSelect` must deduplicate, locale-sort labels, preserve the selected option, and add one disabled unavailable option only when the saved value is absent.

- [ ] **Step 4: Update popup markup and behavior**

Replace the five hard-coded options with empty `<select name="sourceLanguage"></select>` and `<select name="targetLanguage"></select>`. Add:

```html
<label>
  <span data-i18n="theme"></span>
  <select name="theme">
    <option value="system" data-i18n="themeSystem"></option>
    <option value="light" data-i18n="themeLight"></option>
    <option value="dark" data-i18n="themeDark"></option>
  </select>
</label>
```

At popup startup, request `GET_LANGUAGE_CATALOG` from the active YouTube tab, resolve browser defaults only when no saved settings exist, populate both selects, and use semantic CSS variables under `:root`, `:root[data-theme="light"]`, and `:root[data-theme="dark"]`.

- [ ] **Step 5: Run popup, theme, and locale tests**

Run: `npm test -- apps/extension/src/theme/theme.test.ts apps/extension/src/popup/language-options.test.ts apps/extension/src/popup/settings-form.test.ts apps/extension/entrypoints/popup/locale-parity.test.ts`

Expected: PASS with identical locale-key sets.

- [ ] **Step 6: Commit**

```powershell
git add apps/extension/src/theme apps/extension/src/popup/language-options.ts apps/extension/src/popup/language-options.test.ts apps/extension/src/popup/settings-form.ts apps/extension/src/popup/settings-form.test.ts apps/extension/entrypoints/popup apps/extension/public/_locales
git commit -m "feat: add themes and live YouTube languages"
```

---

### Task 6: Add the YouTube control button and compact player panel

**Files:**
- Create: `apps/extension/src/youtube/player-panel.ts`
- Create: `apps/extension/src/youtube/player-panel.test.ts`
- Modify: `apps/extension/entrypoints/youtube.content.ts`

**Interfaces:**
- Consumes: `UserSettings`, `LanguageOption`, `applyTheme`, storage update callback.
- Produces: `YouTubePlayerPanel.attach()`, `update(settings, catalog, status)`, `detach()`.

- [ ] **Step 1: Write failing lifecycle and accessibility tests**

```ts
const panel = new YouTubePlayerPanel(document, { onSettingsChange });
panel.attach(player);
panel.attach(player);
expect(player.querySelectorAll("[data-focapt-button]")).toHaveLength(1);
button.click();
expect(panelElement.hidden).toBe(false);
expect(button.getAttribute("aria-expanded")).toBe("true");
document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
expect(panelElement.hidden).toBe(true);
panel.detach();
expect(player.querySelector("[data-focapt-button]")).toBeNull();
```

Add a second test that replaces `.ytp-right-controls`, calls `attach` again, and proves exactly one button and panel exist after SPA/player reconstruction.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm test -- apps/extension/src/youtube/player-panel.test.ts`

Expected: FAIL because the controller does not exist.

- [ ] **Step 3: Implement the button and Shadow DOM panel**

The button must be a native `<button type="button" class="ytp-button">` with `data-focapt-button`, localized `aria-label`, `aria-haspopup="dialog"`, and `aria-expanded`. Use an inline repository-owned SVG mark with `currentColor`; do not copy a YouTube asset.

The Shadow DOM panel contains exactly:

```html
<section role="dialog" aria-label="Focapt" data-panel hidden>
  <label><input name="enabled" type="checkbox"><span data-i18n="subtitlesEnabled"></span></label>
  <label><span data-i18n="sourceLanguage"></span><select name="sourceLanguage"></select></label>
  <label><span data-i18n="targetLanguage"></span><select name="targetLanguage"></select></label>
  <label><span data-i18n="positionMode"></span><select name="positionMode"></select></label>
  <label><span data-i18n="theme"></span><select name="theme"></select></label>
  <output role="status" aria-live="polite"></output>
</section>
```

Use semantic light/dark variables, visible focus, a maximum inline size of `320px`, reduced-motion handling, Escape/outside dismissal, and bounds that keep the panel above the right control bar. A MutationObserver may schedule idempotent reattachment but must disconnect in `detach()`.

- [ ] **Step 4: Integrate with content lifecycle**

Create one controller per content-script context. Feed it current settings, catalog, translated status text, and a callback that stores normalized settings and applies the same update path as `SETTINGS_UPDATED`. Reattach after `yt-navigate-finish` and mount generation changes; detach on context invalidation.

- [ ] **Step 5: Run panel and related tests**

Run: `npm test -- apps/extension/src/youtube/player-panel.test.ts apps/extension/src/youtube/content-runtime.test.ts apps/extension/src/runtime/settings-store.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/extension/src/youtube/player-panel.ts apps/extension/src/youtube/player-panel.test.ts apps/extension/entrypoints/youtube.content.ts
git commit -m "feat: add Focapt YouTube player panel"
```

---

### Task 7: Full verification, production inspection, and delivery

**Files:**
- Modify only files required by failures directly caused by Tasks 1-6.
- Generate: `apps/extension/.output/chrome-mv3/*`
- Generate: `apps/extension/.output/focaptextension-0.0.0-chrome.zip`

**Interfaces:**
- Verifies every interface produced by Tasks 1-6.

- [ ] **Step 1: Run the complete test suite**

Run: `npm test`

Expected: all test files and tests PASS with zero failures.

- [ ] **Step 2: Run TypeScript verification**

Run: `npm run typecheck`

Expected: all workspaces exit `0` with no TypeScript errors.

- [ ] **Step 3: Build and zip Chrome MV3**

Run: `npm -w @focapt/extension exec wxt zip`

Expected: `.output/chrome-mv3/manifest.json` and `.output/focaptextension-0.0.0-chrome.zip` are produced.

- [ ] **Step 4: Inspect the production boundary**

Run:

```powershell
rg -n "CAPTION_REQUEST_CHANNEL|focapt:youtube-caption-request|credentials" apps/extension/.output/chrome-mv3/content-scripts/youtube-main.js
rg -n "YouTubeCaptionSource|fetch\(.*timedtext" apps/extension/.output/chrome-mv3/content-scripts/youtube.js
```

Expected: MAIN-world bundle contains the page caption request channel and credentialed fetch; isolated bundle contains neither `YouTubeCaptionSource` nor a direct timed-text fetch.

- [ ] **Step 5: Perform a manual Chrome smoke test**

Load `apps/extension/.output/chrome-mv3` as unpacked, open `https://www.youtube.com/watch?v=HAG4uyrkVfA`, and verify:

1. Focapt button appears once in the right player controls.
2. Button opens the compact panel and Escape closes it.
3. English learning text and browser-language native text appear as two lines.
4. Both selectors contain YouTube's full language catalog, including `zh-Hans` and `pt-PT` when advertised.
5. A non-source learning language produces a translated learning line.
6. Fixed, moving, and delayed modes remain functional.
7. System, light, and dark themes apply in both popup and player panel.
8. Fullscreen and YouTube SPA navigation preserve one working button.

- [ ] **Step 6: Commit any verification-only corrections**

If Step 1-5 required a correction, stage only those correction files and commit:

```powershell
git commit -m "fix: complete YouTube player verification"
```

If no correction was required, create no empty commit.

- [ ] **Step 7: Push verified commits and confirm remote blob hashes**

Publish the task commits to `Starhaxor/Focapt` `main`, then compare every changed remote blob SHA with local `git ls-tree` output before reporting completion.
