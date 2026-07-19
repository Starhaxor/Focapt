import { describe, expect, it } from "vitest";
import { readYouTubeVideoId } from "./youtube-url";

const id = "Abc_123-xYz";

describe("readYouTubeVideoId", () => {
  it.each([
    `https://www.youtube.com/watch?v=${id}`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/live/${id}?feature=share`,
    `https://www.youtube.com/embed/${id}`
  ])("desteklenen YouTube video route'undan doğrulanmış id okur: %s", (url) => {
    expect(readYouTubeVideoId(url)).toBe(id);
  });

  it.each([
    `https://example.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}`,
    `https://m.youtube.com/shorts/${id}`,
    `https://music.youtube.com/watch?v=${id}`,
    `https://studio.youtube.com/watch?v=${id}`,
    `javascript://www.youtube.com/watch?v=${id}`,
    "https://www.youtube.com/watch?v=bad/id",
    "https://www.youtube.com/shorts/too-short",
    `https://www.youtube.com/shorts/${id}/extra`,
    "https://www.youtube.com/"
  ])("host, route ve video id sınırlarını reddeder: %s", (url) => {
    expect(readYouTubeVideoId(url)).toBeNull();
  });
});
