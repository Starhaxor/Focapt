# YouTube Player Panel, Languages, Theme, and Caption Reliability Design

## Goal

Make Focapt subtitles reliably visible on YouTube, add a native-feeling Focapt button and compact settings panel to the YouTube player, support system/light/dark themes, and expose every translation language allowed by YouTube for the current video.

## Confirmed Product Behavior

- The YouTube control bar contains a Focapt button in the right-side control group.
- Clicking the button opens a compact panel inside the video player.
- The in-player panel provides subtitle visibility, learning language, native language, position mode, and theme controls.
- Detailed text color, size, weight, box, spacing, delay, and offset controls remain in the extension popup.
- The popup and in-player panel read and write the same settings.
- Theme choices are `system`, `light`, and `dark`, and apply to both interfaces.
- Both language selectors expose YouTube's complete translation-language catalog for the current video.
- The default learning language is English.
- The default native language is the user's browser UI language when YouTube supports it; otherwise it is English.
- Interface copy follows the user's selected or automatic UI locale and does not assume Turkish or English content languages.

## Architecture

### YouTube page bridge

The MAIN-world content script owns all direct interaction with YouTube player APIs. It extracts:

- the current video ID;
- real caption tracks;
- YouTube's `translationLanguages` catalog;
- caption JSON for requested source and target languages.

Caption requests run in the YouTube page context so they inherit the page's current request environment. The bridge sends only plain, validated data through a namespaced `window.postMessage` protocol. Request IDs, video IDs, message types, language codes, caption URL hosts, and cue fields are validated on both sides. Page messages never trigger privileged extension operations.

### Caption selection and bilingual loading

For every video, the runtime chooses one real caption track as the base track:

1. Prefer an exact or base-language match for the selected learning language.
2. Otherwise prefer the player's default caption track.
3. Otherwise use the first valid caption track.

The learning line uses the base track directly when it matches the selected learning language. If it does not match, it requests YouTube translation with `tlang=<learningLanguage>`. The native line independently requests `tlang=<nativeLanguage>`. Source timing stays authoritative, and translated cues are aligned by midpoint and overlap using the existing bilingual merge behavior.

This makes every YouTube translation language selectable in both fields while still requiring at least one real caption track on the video.

### Isolated extension runtime

The isolated content script owns settings, lifecycle, subtitle timeline, positioning, rendering, and extension messaging. It requests catalogs and captions from the page bridge and rejects stale responses after video, language, or navigation changes. A bounded retry handles a transient empty caption response; cancellation prevents old requests from replacing newer results.

### Player control and panel

A focused player-UI controller:

- inserts one Focapt button into `.ytp-right-controls`;
- uses YouTube-compatible button dimensions, focus behavior, tooltip semantics, and accessible labels;
- mounts an isolated Shadow DOM panel within the player;
- toggles the panel from the Focapt button;
- closes it on Escape or outside interaction;
- preserves the button and panel through YouTube SPA navigation, fullscreen changes, and player DOM replacement;
- removes listeners and DOM nodes when the content-script context is invalidated.

The panel is deliberately compact and avoids duplicating detailed styling controls from the popup.

### Settings and theme

`UserSettings` gains:

- `enabled: boolean` for subtitle visibility;
- `theme: "system" | "light" | "dark"` for interface appearance;
- unrestricted, validated BCP-47-like YouTube language-code strings instead of a five-value union.

Settings normalization accepts only bounded language-code syntax and continues to sanitize every numeric, enum, and color field. Existing stored settings migrate through normalization without a separate migration step.

The effective theme resolves `system` through `prefers-color-scheme`. Both popup and player panel set a theme attribute and consume the same semantic CSS variables. Theme changes are stored once and broadcast to the active YouTube runtime.

## Language Catalog

The bridge extracts `translationLanguages` entries as `{ languageCode, label }`, preserving YouTube's localized labels. It deduplicates codes and applies a stable locale-aware sort in the UI. English and the resolved browser language are available as defaults when present. If a saved language is missing from a video's catalog, the UI retains it visibly but marks it unavailable and falls back to English only for the actual request.

The catalog is scoped to the current video because YouTube can vary available translations. It is refreshed on navigation and when the player response changes.

## User Interface

### Player button

The control uses a small Focapt mark rather than text, has an accessible localized label, and visually indicates whether subtitles are enabled. It remains usable in fullscreen and keyboard navigation.

### In-player panel

The panel contains:

- an enabled/disabled subtitle switch;
- learning-language selector;
- native-language selector;
- fixed, moving, and delayed position modes;
- system, light, and dark theme choices;
- a concise status line.

The panel opens above the right side of the control bar and stays inside the rendered player bounds. It uses a neutral, YouTube-compatible visual language without copying YouTube private assets.

### Popup

The popup adds the same theme control, replaces hard-coded five-language options with a catalog-driven list, and retains all detailed subtitle appearance settings. If no supported YouTube video is active, it shows saved choices plus a clear note that the live language catalog requires an open captioned video.

## Error Handling

- No real caption tracks: show the localized equivalent of "This video has no captions."
- Caption request returns an empty body: retry a small bounded number of times, then show "Captions could not be loaded."
- Catalog unavailable: keep current settings usable, show a non-blocking status, and request the catalog again after player/navigation events.
- Invalid or spoofed bridge message: ignore it without changing settings or playback.
- Video navigation or language change: abort pending work and discard stale responses.
- Any Focapt failure must not pause, seek, resize, or otherwise interrupt YouTube playback.

## Accessibility

- Player button and controls have localized accessible names.
- The panel supports keyboard navigation, Escape dismissal, visible focus, and reduced-motion preferences.
- Status updates use a polite live region.
- Light and dark palettes maintain readable contrast.
- Native `<select>`, `<button>`, and checkbox semantics are used wherever possible.

## Verification

Automated tests cover:

- extraction and validation of caption tracks and the complete translation-language catalog;
- browser-locale default resolution and English fallback;
- arbitrary valid YouTube language codes and rejection of malformed values;
- base-track selection and translated learning-language fallback;
- page-bridge request/response validation, empty-response retry, cancellation, and stale-response rejection;
- bilingual cue alignment;
- player button insertion, deduplication, panel toggle, SPA reinsertion, fullscreen survival, and cleanup;
- system/light/dark theme resolution and shared settings behavior;
- popup and player-panel localization and accessibility semantics;
- no-caption and load-failure status behavior.

Release verification requires the complete unit-test suite, TypeScript typecheck, Chrome MV3 production build, zip packaging, and an inspection proving the old isolated-world caption request path is absent from the production bundle.

## Delivery Order

1. Generalize language/settings contracts and catalog extraction.
2. Introduce and verify the page-context caption request bridge.
3. Reconnect the subtitle runtime to the new bridge and restore visible bilingual captions.
4. Add shared theme behavior.
5. Add the YouTube player button and compact panel.
6. Replace popup language controls with the live catalog and complete end-to-end verification.
