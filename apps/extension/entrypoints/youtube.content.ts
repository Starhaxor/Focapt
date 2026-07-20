import type { LanguageOption } from "@focapt/contracts/captions";
import type { UserSettings } from "@focapt/contracts/settings";
import { resolveDefaultLanguages } from "@focapt/core/languages";
import { DEFAULT_SETTINGS } from "@focapt/core/settings";
import { CaptionTimeline } from "@focapt/core/timeline";
import { browser } from "wxt/browser";
import { createExtensionTranslator } from "../src/i18n/translator";
import { PositionController } from "../src/overlay/position-controller";
import { FocaptSubtitleOverlay } from "../src/overlay/subtitle-overlay";
import { SubtitleOrchestrator } from "../src/runtime/orchestrator";
import { SettingsStore } from "../src/runtime/settings-store";
import { mergeBilingualCues } from "../src/youtube/bilingual-cues";
import {
  AsyncGeneration,
  ContentMessageBridge,
  createBilingualLoadPlan,
  ensurePositionedContainer,
  LanguageDefaultsInitializer,
  LatestRequestController,
  reportCaptionLoadFailure,
  waitForYouTubeVideo
} from "../src/youtube/content-runtime";
import { YouTubePageCaptionClient } from "../src/youtube/page-caption-client";
import { readCaptionCatalog } from "../src/youtube/page-caption-protocol";
import { YouTubePlayerPanel } from "../src/youtube/player-panel";
import type { YouTubeCaptionCatalog } from "../src/youtube/player-response";
import { YouTubeVideoAdapter } from "../src/youtube/video-adapter";
import { VideoLayoutController } from "../src/youtube/video-layout";
import { readYouTubeVideoId } from "../src/youtube/youtube-url";

const SITE = "youtube.com";

function currentVideoId(): string {
  return readYouTubeVideoId(location.href) ?? "";
}

function fallbackMessage(key: string): string {
  const getMessage = browser.i18n.getMessage as (messageName: string) => string;
  return getMessage(key) || key;
}

export default defineContentScript({
  matches: ["https://www.youtube.com/*"],
  async main(ctx) {
    const store = new SettingsStore(browser.storage.local);
    const onStorageChanged = (changes: Record<string, unknown>, areaName: string): void => {
      if (areaName === "local" && Object.hasOwn(changes, "focaptSettings")) {
        store.noteSettingsChanged();
      }
    };
    browser.storage.onChanged.addListener(onStorageChanged);
    let panelTranslateKey = fallbackMessage;
    let applyPanelSettings: ((settings: UserSettings) => void) | undefined;
    let reportPanelSaveFailure: (() => void) | undefined;
    const playerPanel = new YouTubePlayerPanel(document, {
      translate: (key) => panelTranslateKey(key),
      onSettingsChange: async (nextSettings) => {
        try {
          await store.set(nextSettings, SITE);
          if (!disposed) applyPanelSettings?.(nextSettings);
        } catch {
          if (!disposed) reportPanelSaveFailure?.();
        }
      }
    });
    const pageCaptions = new YouTubePageCaptionClient(window);
    const generations = new AsyncGeneration();
    const messages = new ContentMessageBridge();
    const onMessage = (message: unknown): Promise<unknown> | undefined => messages.handle(message);
    let disposeMounted = (): void => undefined;
    let disposed = false;
    browser.runtime.onMessage.addListener(onMessage);

    const mount = async (): Promise<void> => {
      disposeMounted();
      disposeMounted = () => undefined;
      messages.setLanguageCatalog([]);
      const generation = generations.begin();
      const cleanups: Array<() => void> = [];
      let overlay: FocaptSubtitleOverlay | undefined;
      let orchestrator: SubtitleOrchestrator | undefined;
      let translateKey = fallbackMessage;
      let mountedSettings: UserSettings = DEFAULT_SETTINGS;
      let mountedCatalog: readonly LanguageOption[] = [];
      let mountedStatusKey = "loading";

      const cleanup = (): void => {
        while (cleanups.length > 0) {
          try {
            cleanups.pop()?.();
          } catch {
            // Cleanup is best-effort and must never affect YouTube playback.
          }
        }
      };
      const updatePlayerPanel = (): void => {
        playerPanel.update(mountedSettings, mountedCatalog, translateKey(mountedStatusKey));
      };
      const showStatus = (key: string): void => {
        mountedStatusKey = key;
        orchestrator?.reset();
        overlay?.setStatus(translateKey(key));
        updatePlayerPanel();
      };
      disposeMounted = cleanup;

      try {
        await waitForYouTubeVideo(document, { signal: generation.signal, timeoutMs: 10_000 });
        if (!generation.isCurrent()) return;

        const adapter = new YouTubeVideoAdapter(document);
        const video = adapter.connect();
        cleanups.push(() => adapter.destroy());
        const container = adapter.container();
        const restoreContainerPosition = ensurePositionedContainer(container);
        cleanups.push(restoreContainerPosition);
        playerPanel.attach(container);
        cleanups.push(() => playerPanel.detach());

        overlay = new FocaptSubtitleOverlay();
        overlay.applySettings(mountedSettings);
        showStatus("loading");
        container.append(overlay.host);
        cleanups.push(() => overlay?.destroy());

        try {
          mountedSettings = await store.get(SITE);
        } catch {
          showStatus("settingsLoadFailed");
        }
        if (!generation.isCurrent()) return;
        const translator = await createExtensionTranslator().catch(() => undefined);
        translateKey = (key) => translator?.t(key, mountedSettings.uiLocale) ?? fallbackMessage(key);
        panelTranslateKey = translateKey;
        overlay.applySettings(mountedSettings);
        updatePlayerPanel();

        let position: PositionController | undefined;
        const videoLayout = new VideoLayoutController(video, container, {
          setBounds: (bounds) => overlay?.setBounds(bounds),
          refresh: () => position?.refresh()
        });
        videoLayout.attach();
        cleanups.push(() => videoLayout.detach());

        position = new PositionController(
          container,
          () => videoLayout.currentRect(),
          () => overlay?.getContentSize() ?? { width: 0, height: 0 },
          {
            move: (x, y) => overlay?.setPosition(x, y),
            setVisible: (visible) => overlay?.setVisible(visible),
            saveFixed: () => undefined
          }
        );
        position.setMode(mountedSettings);
        position.attach();
        cleanups.push(() => position.detach());

        const timeline = new CaptionTimeline();
        const activeOrchestrator = new SubtitleOrchestrator(video, timeline, overlay);
        orchestrator = activeOrchestrator;
        activeOrchestrator.start();
        cleanups.push(() => activeOrchestrator.destroy());
        const captionRequests = new LatestRequestController();
        cleanups.push(() => captionRequests.dispose());
        let settingsRevision = 0;
        const languageDefaults = new LanguageDefaultsInitializer();

        const applyMountedSettings = (nextSettings: UserSettings): void => {
          mountedSettings = nextSettings;
          translateKey = (key) => translator?.t(key, nextSettings.uiLocale) ?? fallbackMessage(key);
          panelTranslateKey = translateKey;
          overlay?.applySettings(nextSettings);
          position?.setMode(nextSettings);
          updatePlayerPanel();
        };

        const ensureLanguageDefaults = (catalog: YouTubeCaptionCatalog): Promise<void> => {
          return languageDefaults.run(catalog.languages, async () => {
            const revision = settingsRevision;
            const defaults = resolveDefaultLanguages(
              browser.i18n.getUILanguage(),
              catalog.languages
            );
            const nextSettings = { ...mountedSettings, ...defaults };
            let persisted: boolean;
            try {
              persisted = await store.setDefaultsIfImplicit(nextSettings, SITE);
            } catch {
              return;
            }
            if (!persisted || revision !== settingsRevision || !generation.isCurrent()) return;
            applyMountedSettings(nextSettings);
          });
        };

        const handleCatalog = async (
          catalog: YouTubeCaptionCatalog,
          requestVideoId: string
        ): Promise<void> => {
          if (requestVideoId !== currentVideoId() || !generation.isCurrent()) return;
          mountedCatalog = catalog.languages;
          messages.setLanguageCatalog(catalog.languages);
          updatePlayerPanel();
          captionRequests.cancel();
          await ensureLanguageDefaults(catalog);
          if (requestVideoId !== currentVideoId() || !generation.isCurrent()) return;
          const requestSettings = mountedSettings;
          const plan = createBilingualLoadPlan(catalog, requestSettings);
          if (!plan) {
            captionRequests.cancel();
            timeline.replace([]);
            showStatus("noCaptions");
            return;
          }

          timeline.replace([]);
          showStatus("translating");
          try {
            await captionRequests.run(
              async (loadSignal, loadIsCurrent) => {
                const sourcePromise = pageCaptions.load(
                  plan.baseTrack,
                  plan.sourceRequestLanguage,
                  loadSignal
                );
                const translatedPromise = pageCaptions.load(
                  plan.baseTrack,
                  plan.targetRequestLanguage,
                  loadSignal
                );
                const [source, translated] = await Promise.all([sourcePromise, translatedPromise]);
                if (!loadIsCurrent() || !generation.isCurrent() || requestVideoId !== currentVideoId()) {
                  return null;
                }
                return mergeBilingualCues(source, translated);
              },
              (translated) => {
                if (
                  translated &&
                  generation.isCurrent() &&
                  requestVideoId === currentVideoId()
                ) {
                  timeline.replace(translated);
                  showStatus("captionsReady");
                }
              }
            );
          } catch (error) {
            reportCaptionLoadFailure({
              requestVideoId,
              currentVideoId,
              generationSignal: generation.signal,
              isGenerationCurrent: generation.isCurrent
            }, () => {
              timeline.replace([]);
              showStatus("captionLoadFailed");
            });
          }
        };

        const onCatalog = (event: MessageEvent<unknown>): void => {
          if (event.source !== window) return;
          const message = readCaptionCatalog(event.data);
          if (!message || message.videoId !== currentVideoId()) return;
          void handleCatalog(message.catalog, message.videoId).catch(() => {
            if (generation.isCurrent() && message.videoId === currentVideoId()) {
              showStatus("captionLoadFailed");
            }
          });
        };
        window.addEventListener("message", onCatalog);
        cleanups.push(() => window.removeEventListener("message", onCatalog));

        const applySettingsUpdate = (nextSettings: UserSettings): void => {
          captionRequests.cancel();
          settingsRevision += 1;
          applyMountedSettings(nextSettings);
          timeline.replace([]);
          showStatus("translating");
          pageCaptions.requestCatalog();
        };
        applyPanelSettings = applySettingsUpdate;
        reportPanelSaveFailure = () => {
          playerPanel.update(mountedSettings, mountedCatalog, translateKey("saveFailed"));
        };
        cleanups.push(() => {
          if (applyPanelSettings === applySettingsUpdate) applyPanelSettings = undefined;
          reportPanelSaveFailure = undefined;
        });
        const detachMessageTarget = messages.attach({
          applySettings: applySettingsUpdate,
          getVideoTimeMs: () => Number.isFinite(video.currentTime)
              ? Math.max(0, Math.min(video.currentTime * 1000, Number.MAX_SAFE_INTEGER))
              : 0
        });
        cleanups.push(detachMessageTarget);

        pageCaptions.requestCatalog();
      } catch (error) {
        if (generation.signal.aborted || !generation.isCurrent()) return;
        showStatus("videoUnavailable");
      }
    };

    const onNavigate = (): void => {
      void mount().catch(() => undefined);
    };
    document.addEventListener("yt-navigate-finish", onNavigate);

    const dispose = (): void => {
      if (disposed) return;
      disposed = true;
      document.removeEventListener("yt-navigate-finish", onNavigate);
      window.removeEventListener("pagehide", dispose);
      browser.runtime.onMessage.removeListener(onMessage);
      browser.storage.onChanged.removeListener(onStorageChanged);
      messages.setLanguageCatalog([]);
      generations.dispose();
      disposeMounted();
      playerPanel.detach();
      disposeMounted = () => undefined;
    };
    ctx.onInvalidated(dispose);
    window.addEventListener("pagehide", dispose, { once: true });
    await mount().catch(() => undefined);
  }
});
