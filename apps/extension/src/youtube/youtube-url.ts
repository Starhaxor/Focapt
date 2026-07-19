const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function isYouTubeVideoId(value: unknown): value is string {
  return typeof value === "string" && VIDEO_ID.test(value);
}

export function readYouTubeVideoId(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase();
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    hostname !== "www.youtube.com"
  ) return null;

  let candidate: string | null = null;
  if (url.pathname === "/watch") {
    candidate = url.searchParams.get("v");
  } else {
    const segments = url.pathname.split("/").filter(Boolean);
    if (
      segments.length === 2 &&
      (segments[0] === "shorts" || segments[0] === "live" || segments[0] === "embed")
    ) {
      candidate = segments[1] ?? null;
    }
  }

  return isYouTubeVideoId(candidate) ? candidate : null;
}
