export type VideoClock = {
  videoTimeMs: number;
  paused: boolean;
  playbackRate: number;
};

export type YouTubeVideoAdapterErrorCode =
  | "YOUTUBE_CONTAINER_NOT_FOUND"
  | "YOUTUBE_VIDEO_NOT_FOUND";

export class YouTubeVideoAdapterError extends Error {
  override readonly name = "YouTubeVideoAdapterError";

  constructor(readonly code: YouTubeVideoAdapterErrorCode) {
    super(code);
  }
}

const CLOCK_EVENTS = ["timeupdate", "ratechange", "seeking", "play", "pause"] as const;

function safeVideoTimeMs(currentTime: number): number {
  const milliseconds = currentTime * 1000;
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return 0;
  return Math.min(milliseconds, Number.MAX_SAFE_INTEGER);
}

function safePlaybackRate(playbackRate: number): number {
  return Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1;
}

export class YouTubeVideoAdapter {
  private video: HTMLVideoElement | undefined;
  private playerContainer: HTMLElement | undefined;
  private connected = false;
  private readonly callbacks = new Set<(clock: VideoClock) => void>();

  constructor(private readonly root: Document) {}

  connect(): HTMLVideoElement {
    if (this.connected && this.video) return this.video;

    const view = this.root.defaultView;
    const container = this.root.querySelector("#movie_player");
    if (!view || !(container instanceof view.HTMLElement)) {
      throw new YouTubeVideoAdapterError("YOUTUBE_CONTAINER_NOT_FOUND");
    }

    const video = container.querySelector("video");
    if (!(video instanceof view.HTMLVideoElement)) {
      throw new YouTubeVideoAdapterError("YOUTUBE_VIDEO_NOT_FOUND");
    }

    this.video = video;
    this.playerContainer = container;
    for (const eventName of CLOCK_EVENTS) video.addEventListener(eventName, this.emit);
    this.connected = true;
    return video;
  }

  container(): HTMLElement {
    if (!this.playerContainer) {
      throw new YouTubeVideoAdapterError("YOUTUBE_CONTAINER_NOT_FOUND");
    }
    return this.playerContainer;
  }

  onClock(callback: (clock: VideoClock) => void): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  destroy(): void {
    if (this.connected && this.video) {
      for (const eventName of CLOCK_EVENTS) this.video.removeEventListener(eventName, this.emit);
    }
    this.connected = false;
    this.callbacks.clear();
  }

  private readonly emit = (): void => {
    const video = this.video;
    if (!this.connected || !video) return;
    const clock: VideoClock = {
      videoTimeMs: safeVideoTimeMs(video.currentTime),
      paused: video.paused,
      playbackRate: safePlaybackRate(video.playbackRate)
    };

    for (const callback of [...this.callbacks]) {
      try {
        callback(clock);
      } catch {
        // Consumers are isolated so one extension feature cannot stop playback updates.
      }
    }
  };
}
