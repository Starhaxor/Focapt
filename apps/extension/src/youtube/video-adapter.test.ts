// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import { YouTubeVideoAdapter, YouTubeVideoAdapterError } from "./video-adapter";

function installPlayer(): HTMLVideoElement {
  document.body.innerHTML = `<div id="movie_player"><video></video></div>`;
  return document.querySelector("video")!;
}

describe("YouTubeVideoAdapter", () => {
  it("video saatini yayınlar ve destroy sonrasında dinleyiciyi kaldırır", () => {
    const video = installPlayer();
    const callback = vi.fn();
    const adapter = new YouTubeVideoAdapter(document);

    expect(adapter.connect()).toBe(video);
    adapter.onClock(callback);
    Object.defineProperties(video, {
      currentTime: { value: 3, configurable: true },
      paused: { value: true, configurable: true },
      playbackRate: { value: 1, configurable: true }
    });
    video.dispatchEvent(new Event("timeupdate"));
    expect(callback).toHaveBeenCalledWith({ videoTimeMs: 3000, paused: true, playbackRate: 1 });

    adapter.destroy();
    adapter.destroy();
    video.dispatchEvent(new Event("timeupdate"));
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("connect çağrısını idempotent tutar ve dinleyicileri çoğaltmaz", () => {
    const video = installPlayer();
    const callback = vi.fn();
    const adapter = new YouTubeVideoAdapter(document);

    expect(adapter.connect()).toBe(video);
    expect(adapter.connect()).toBe(video);
    adapter.onClock(callback);
    video.dispatchEvent(new Event("play"));
    expect(callback).toHaveBeenCalledOnce();
  });

  it("eksik veya geçersiz YouTube DOM öğelerini locale-independent kodlarla reddeder", () => {
    document.body.innerHTML = "";
    expect(() => new YouTubeVideoAdapter(document).connect()).toThrowError(
      expect.objectContaining<Partial<YouTubeVideoAdapterError>>({ code: "YOUTUBE_CONTAINER_NOT_FOUND" })
    );

    document.body.innerHTML = `<div id="movie_player"><div></div></div>`;
    expect(() => new YouTubeVideoAdapter(document).connect()).toThrowError(
      expect.objectContaining<Partial<YouTubeVideoAdapterError>>({ code: "YOUTUBE_VIDEO_NOT_FOUND" })
    );
  });

  it("saat değerlerini güvenli tutar ve hatalı callback'i diğerlerinden yalıtır", () => {
    const video = installPlayer();
    const adapter = new YouTubeVideoAdapter(document);
    const callback = vi.fn();
    adapter.connect();
    adapter.onClock(() => {
      throw new Error("consumer failed");
    });
    adapter.onClock(callback);
    Object.defineProperties(video, {
      currentTime: { value: Number.POSITIVE_INFINITY, configurable: true },
      paused: { value: false, configurable: true },
      playbackRate: { value: Number.NaN, configurable: true }
    });

    expect(() => video.dispatchEvent(new Event("ratechange"))).not.toThrow();
    expect(callback).toHaveBeenCalledWith({ videoTimeMs: 0, paused: false, playbackRate: 1 });
  });
});
