import type { UserSettings } from "@focapt/contracts/settings";
import { DEFAULT_SETTINGS } from "@focapt/core/settings";
import { CaptionTimeline } from "@focapt/core/timeline";
import { browser } from "wxt/browser";
import { createExtensionTranslator } from "../src/i18n/translator";
import { PositionController } from "../src/overlay/position-controller";
import { FocaptSubtitleOverlay } from "../src/overlay/subtitle-overlay";
import { SubtitleOrchestrator } from "../src/runtime/orchestrator";
import { SettingsStore } from "../src/runtime/settings-store";
import { mergeBilingualCues } from "../src/youtube/bilingual-cues";
import { YouTubeCaptionSource } from "../src/youtube/caption-source";
import {
  AsyncGeneration,
  ContentMessageBridge,
  ensurePositionedContainer,
  LatestRequestController,
  readTracksEventDetail,
  selectCaptionTrack,
  waitForYouTubeVideo
} from "../src/youtube/content-runtime";
import { YouTubeVideoAdapter } from "../src/youtube/video-adapter";
import { VideoLayoutController } from "../src/youtube/video-layout";
import { readYouTubeVideoId } from "../src/youtube/youtube-url";

const TRACKS_EVENT = "focapt:youtube-tracks";
const TRACKS_REQUEST_EVENT = "focapt:request-youtube-tracks";
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
    const generations = new AsyncGeneration();
    const messages = new ContentMessageBridge();
    const onMessage = (message: unknown): Promise<unknown> | undefined => messages.handle(message);
    let disposeMounted = (): void => undefined;
    let disposed = false;
    browser.runtime.onMessage.addListener(onMessage);

    const mount = async (): Promise<void> => {
      disposeMounted();
      disposeMounted = () => undefined;
      const generation = generations.begin();
      const cleanups: Array<() => void> = [];
      let overlay: FocaptSubtitleOverlay | undefined;
      let orchestrator: SubtitleOrchestrator | undefined;
      let translateKey = fallbackMessage;
      let mountedSettings: UserSettings = DEFAULT_SETTINGS;

      const cleanup = (): void => {
        while (cleanups.length > 0) {
          try {
            cleanups.pop()?.();
          } catch {
            // Cleanup is best-effort and must never affect YouTube playback.
          }
        }
      };
      const showStatus = (key: string): void => {
        orchestrator?.reset();
        overlay?.setStatus(translateKey(key));
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

        overlay = new FocaptSubtitleOverlay();
        overlay.applySettings(mountedSettings);
        showStatus("loading");
        container.append(overlay);
        cleanups.push(() => overlay?.destroy());

        try {
          mountedSettings = await store.get(SITE);
        } catch {
          showStatus("settingsLoadFailed");
        }
        if (!generation.isCurrent()) return;
        const translator = await createExtensionTranslator().catch(() => undefined);
        translateKey = (key) => translator?.t(key, mountedSettings.uiLocale) ?? fallbackMessage(key);
        overlay.applySettings(mountedSettings);

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

        const handleTracks = async (event: Event): Promise<void> => {
          const videoId = currentVideoId();
          const detail = readTracksEventDetail((event as CustomEvent<unknown>).detail, videoId);
          if (!detail || !generation.isCurrent()) return;
          const requestSettings = mountedSettings;
          const requestVideoId = detail.videoId;
          captionRequests.cancel();
          const track = selectCaptionTrack(detail.tracks, requestSettings.sourceLanguage);
          if (!track) {
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
                const captionSource = new YouTubeCaptionSource();
                const sourcePromise = captionSource.load(track, loadSignal);
                const translatedPromise = requestSettings.sourceLanguage === requestSettings.targetLanguage
                  ? sourcePromise
                  : captionSource.loadTranslated(track, requestSettings.targetLanguage, loadSignal);
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
            if (!generation.signal.aborted && generation.isCurrent()) {
              timeline.replace([]);
              showStatus("captionLoadFailed");
            }
          }
        };

        const onTracks = (event: Event): void => {
          void handleTracks(event).catch(() => {
            if (generation.isCurrent()) showStatus("captionLoadFailed");
          });
        };
        window.addEventListener(TRACKS_EVENT, onTracks);
        cleanups.push(() => window.removeEventListener(TRACKS_EVENT, onTracks));

        const detachMessageTarget = messages.attach({
          applySettings: (nextSettings) => {
            captionRequests.cancel();
            mountedSettings = nextSettings;
            translateKey = (key) => translator?.t(key, nextSettings.uiLocale) ?? fallbackMessage(key);
            overlay?.applySettings(nextSettings);
            position.setMode(nextSettings);
            timeline.replace([]);
            showStatus("translating");
            window.dispatchEvent(new CustomEvent(TRACKS_REQUEST_EVENT));
          },
          getVideoTimeMs: () => Number.isFinite(video.currentTime)
              ? Math.max(0, Math.min(video.currentTime * 1000, Number.MAX_SAFE_INTEGER))
              : 0
        });
        cleanups.push(detachMessageTarget);

        window.dispatchEvent(new CustomEvent(TRACKS_REQUEST_EVENT));
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
      generations.dispose();
      disposeMounted();
      disposeMounted = () => undefined;
    };
    ctx.onInvalidated(dispose);
    window.addEventListener("pagehide", dispose, { once: true });
    await mount().catch(() => undefined);
  }
});
