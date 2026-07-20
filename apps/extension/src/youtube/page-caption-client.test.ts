import type { CaptionCue } from "@focapt/contracts/captions";
import { describe, expect, it } from "vitest";

import {
  CAPTION_RESPONSE_CHANNEL,
  CATALOG_CHANNEL,
  type CaptionPageResponse,
} from "./page-caption-protocol";
import {
  YouTubePageCaptionClient,
  type CaptionClientWindow,
  type CaptionMessageListener,
} from "./page-caption-client";
import type { YouTubeCaptionTrack } from "./player-response";

const track: YouTubeCaptionTrack = {
  baseUrl: "https://www.youtube.com/api/timedtext?v=HAG4uyrkVfA&lang=en",
  languageCode: "en",
  label: "English",
  isTranslatable: true,
  isDefault: true,
};

class FakeCaptionWindow implements CaptionClientWindow {
  readonly location = {
    href: "https://www.youtube.com/watch?v=HAG4uyrkVfA",
    origin: "https://www.youtube.com",
  };
  readonly sent: Array<{ message: unknown; targetOrigin: string }> = [];
  readonly listeners = new Set<CaptionMessageListener>();

  addEventListener(type: "message", listener: CaptionMessageListener): void {
    if (type === "message") this.listeners.add(listener);
  }

  removeEventListener(type: "message", listener: CaptionMessageListener): void {
    if (type === "message") this.listeners.delete(listener);
  }

  postMessage(message: unknown, targetOrigin: string): void {
    this.sent.push({ message, targetOrigin });
  }

  emit(data: unknown, source: unknown = this): void {
    for (const listener of [...this.listeners]) {
      listener({ source, data } as MessageEvent<unknown>);
    }
  }
}

const sentRequest = (host: FakeCaptionWindow, index: number) => {
  const item = host.sent[index];
  if (!item || typeof item.message !== "object" || item.message === null) {
    throw new Error(`Missing request ${index}`);
  }
  return item.message as {
    requestId: string;
    videoId: string;
    channel: string;
  };
};

const success = (
  request: ReturnType<typeof sentRequest>,
  cues: CaptionCue[],
): CaptionPageResponse => ({
  channel: CAPTION_RESPONSE_CHANNEL,
  requestId: request.requestId,
  videoId: request.videoId,
  ok: true,
  cues,
});

describe("YouTubePageCaptionClient", () => {
  it("requests a catalog with a structured same-origin message", () => {
    const host = new FakeCaptionWindow();
    const client = new YouTubePageCaptionClient(host);

    client.requestCatalog();

    expect(host.sent).toEqual([{
      message: { channel: CATALOG_CHANNEL, type: "request" },
      targetOrigin: "https://www.youtube.com",
    }]);
  });

  it("retries one empty success and resolves the correlated non-empty response", async () => {
    const host = new FakeCaptionWindow();
    const client = new YouTubePageCaptionClient(host, { timeoutMs: 1000, maxEmptyRetries: 1 });
    const controller = new AbortController();
    const translated = [{ id: "1", startMs: 0, endMs: 1000, text: "Merhaba" }];

    const pending = client.load(track, "tr", controller.signal);
    expect(host.sent).toHaveLength(1);
    const first = sentRequest(host, 0);
    host.emit(success(first, []));
    expect(host.sent).toHaveLength(2);
    const second = sentRequest(host, 1);
    expect(second.requestId).not.toBe(first.requestId);
    expect(Number(second.requestId.split("-").at(-1))).toBeGreaterThan(Number(first.requestId.split("-").at(-1)));
    host.emit(success(second, translated));

    await expect(pending).resolves.toEqual(translated);
    expect(host.listeners).toHaveLength(0);
  });

  it("ignores wrong sources, request IDs, and video IDs", async () => {
    const host = new FakeCaptionWindow();
    const client = new YouTubePageCaptionClient(host, { timeoutMs: 1000 });
    const pending = client.load(track, null, new AbortController().signal);
    const request = sentRequest(host, 0);
    const cues = [{ id: "1", startMs: 0, endMs: 1000, text: "Hello" }];

    host.emit(success(request, cues), {});
    host.emit(success({ ...request, requestId: "other-999" }, cues));
    host.emit(success({ ...request, videoId: "dQw4w9WgXcQ" }, cues));
    expect(host.listeners).toHaveLength(1);
    host.emit(success(request, cues));

    await expect(pending).resolves.toEqual(cues);
  });

  it("accepts an empty response after exhausting the configured retry", async () => {
    const host = new FakeCaptionWindow();
    const client = new YouTubePageCaptionClient(host, { timeoutMs: 1000, maxEmptyRetries: 1 });
    const pending = client.load(track, "tr", new AbortController().signal);

    host.emit(success(sentRequest(host, 0), []));
    host.emit(success(sentRequest(host, 1), []));

    await expect(pending).resolves.toEqual([]);
    expect(host.sent).toHaveLength(2);
    expect(host.listeners).toHaveLength(0);
  });

  it("rejects pre-aborted and in-flight loads with AbortError and cleans up", async () => {
    const host = new FakeCaptionWindow();
    const client = new YouTubePageCaptionClient(host, { timeoutMs: 1000 });
    const preAborted = new AbortController();
    preAborted.abort();

    await expect(client.load(track, "tr", preAborted.signal)).rejects.toMatchObject({ name: "AbortError", message: "Aborted" });
    expect(host.sent).toHaveLength(0);

    const controller = new AbortController();
    const pending = client.load(track, "tr", controller.signal);
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError", message: "Aborted" });
    expect(host.listeners).toHaveLength(0);
  });

  it("rejects bridge failures and timeouts without leaking listeners", async () => {
    const failedHost = new FakeCaptionWindow();
    const failedClient = new YouTubePageCaptionClient(failedHost, { timeoutMs: 1000 });
    const failed = failedClient.load(track, "tr", new AbortController().signal);
    const request = sentRequest(failedHost, 0);
    failedHost.emit({
      channel: CAPTION_RESPONSE_CHANNEL,
      requestId: request.requestId,
      videoId: request.videoId,
      ok: false,
      error: "CAPTION_LOAD_FAILED",
    });

    await expect(failed).rejects.toThrow("CAPTION_LOAD_FAILED");
    expect(failedHost.listeners).toHaveLength(0);

    const timeoutHost = new FakeCaptionWindow();
    const timeoutClient = new YouTubePageCaptionClient(timeoutHost, { timeoutMs: 5 });
    await expect(timeoutClient.load(track, null, new AbortController().signal)).rejects.toThrow("CAPTION_REQUEST_TIMEOUT");
    expect(timeoutHost.listeners).toHaveLength(0);
  });
});
