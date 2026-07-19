// @vitest-environment happy-dom

import type { BilingualCue } from "@focapt/contracts/captions";
import { describe, expect, it, vi } from "vitest";
import { SubtitleOrchestrator, type FrameScheduler } from "./orchestrator";

class ControlledFrames implements FrameScheduler {
  callbacks: FrameRequestCallback[] = [];
  cancelled: unknown[] = [];

  request(callback: FrameRequestCallback): unknown {
    this.callbacks.push(callback);
    return this.callbacks.length;
  }

  cancel(handle: unknown): void {
    this.cancelled.push(handle);
  }

  flushOne(): void {
    this.callbacks.shift()?.(0);
  }
}

const cue = (id: string): BilingualCue => ({
  id,
  startMs: 0,
  endMs: 1000,
  text: id,
  translatedText: `${id}-translated`
});

describe("SubtitleOrchestrator", () => {
  it("empty initial timeline mevcut overlay statusunu temizlemez", () => {
    const frames = new ControlledFrames();
    const overlay = { setCue: vi.fn() };
    const orchestrator = new SubtitleOrchestrator(
      document.createElement("video"),
      { at: () => null },
      overlay,
      frames
    );

    orchestrator.start();
    frames.flushOne();
    expect(overlay.setCue).not.toHaveBeenCalled();
  });

  it("reset current cue'dan translating statusuna geçişi frame yarışında korur", () => {
    const frames = new ControlledFrames();
    let active: BilingualCue | null = cue("current");
    const overlay = { setCue: vi.fn(), setStatus: vi.fn() };
    const orchestrator = new SubtitleOrchestrator(
      document.createElement("video"),
      { at: () => active },
      overlay,
      frames
    );
    orchestrator.start();

    active = null;
    orchestrator.reset();
    overlay.setStatus("Translating");
    overlay.setCue.mockClear();
    frames.flushOne();
    expect(overlay.setCue).not.toHaveBeenCalled();

    active = cue("next");
    frames.flushOne();
    expect(overlay.setCue).toHaveBeenLastCalledWith(active);
    active = null;
    frames.flushOne();
    expect(overlay.setCue).toHaveBeenLastCalledWith(null);
  });

  it("yalnız aktif cue değiştiğinde overlay DOM'unu günceller", () => {
    const video = document.createElement("video");
    Object.defineProperty(video, "currentTime", { value: 0, configurable: true });
    const first = cue("first");
    let active: BilingualCue | null = first;
    const timeline = { at: vi.fn(() => active) };
    const overlay = { setCue: vi.fn() };
    const frames = new ControlledFrames();
    const orchestrator = new SubtitleOrchestrator(video, timeline, overlay, frames);

    orchestrator.start();
    expect(overlay.setCue).toHaveBeenCalledOnce();
    frames.flushOne();
    expect(overlay.setCue).toHaveBeenCalledTimes(1);
    expect(overlay.setCue).toHaveBeenLastCalledWith(first);

    active = cue("second");
    frames.flushOne();
    expect(overlay.setCue).toHaveBeenCalledTimes(2);
    expect(overlay.setCue).toHaveBeenLastCalledWith(active);
  });

  it("start çağrısını idempotent tutar", () => {
    const frames = new ControlledFrames();
    const orchestrator = new SubtitleOrchestrator(
      document.createElement("video"),
      { at: () => null },
      { setCue: vi.fn() },
      frames
    );

    orchestrator.start();
    orchestrator.start();
    expect(frames.callbacks).toHaveLength(1);
  });

  it("destroy sonrası iptal edilemeyen stale callback'i etkisiz bırakır", () => {
    const frames = new ControlledFrames();
    const timeline = { at: vi.fn(() => cue("late")) };
    const overlay = { setCue: vi.fn() };
    const orchestrator = new SubtitleOrchestrator(
      document.createElement("video"),
      timeline,
      overlay,
      frames
    );

    orchestrator.start();
    const stale = frames.callbacks[0]!;
    expect(timeline.at).toHaveBeenCalledOnce();
    timeline.at.mockClear();
    overlay.setCue.mockClear();
    orchestrator.destroy();
    stale(0);

    expect(frames.cancelled).toEqual([1]);
    expect(timeline.at).not.toHaveBeenCalled();
    expect(overlay.setCue).toHaveBeenCalledOnce();
    expect(overlay.setCue).toHaveBeenCalledWith(null);
    expect(frames.callbacks).toHaveLength(1);
  });
});
