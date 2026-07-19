import { afterEach, describe, expect, it, vi } from "vitest";

import type { CaptionProvider } from "./provider";
import { buildServer } from "./server";

const cue = { id: "c1", startMs: 0, endMs: 1000, text: "Hello" };

function provider(overrides: Partial<CaptionProvider> = {}): CaptionProvider {
  return {
    translate: vi.fn(async () => ["Merhaba"]),
    transcribe: vi.fn(async () => []),
    ...overrides,
  };
}

const servers: ReturnType<typeof buildServer>[] = [];

function serverWith(captionProvider = provider()) {
  const server = buildServer(captionProvider);
  servers.push(server);
  return server;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("caption API", () => {
  it("reports health", async () => {
    const response = await serverWith().inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("preserves cue identity and timing while translating", async () => {
    const response = await serverWith().inject({
      method: "POST",
      url: "/v1/translate",
      payload: { sourceLanguage: "en", targetLanguage: "tr", cues: [cue] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      cues: [{ ...cue, translatedText: "Merhaba" }],
    });
  });

  it("passes text through without calling the provider when languages match", async () => {
    const captionProvider = provider();
    const response = await serverWith(captionProvider).inject({
      method: "POST",
      url: "/v1/translate",
      payload: { sourceLanguage: "en", targetLanguage: "en", cues: [cue] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().cues[0].translatedText).toBe("Hello");
    expect(captionProvider.translate).not.toHaveBeenCalled();
  });

  it.each([
    ["empty ids", { ...cue, id: "" }],
    ["duplicate ids", cue],
    ["fractional times", { ...cue, startMs: 0.5 }],
    ["unsafe times", { ...cue, endMs: Number.MAX_SAFE_INTEGER + 1 }],
    ["reversed times", { ...cue, startMs: 1000, endMs: 1000 }],
    ["empty text", { ...cue, text: "" }],
    ["oversized text", { ...cue, text: "x".repeat(2001) }],
  ])("rejects invalid cues: %s", async (caseName, invalidCue) => {
    const cues = caseName === "duplicate ids" ? [cue, invalidCue] : [invalidCue];
    const response = await serverWith().inject({
      method: "POST",
      url: "/v1/translate",
      payload: { sourceLanguage: "en", targetLanguage: "tr", cues },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_request");
  });

  it("rejects more than 100 cues", async () => {
    const cues = Array.from({ length: 101 }, (_, index) => ({
      ...cue,
      id: `c${index}`,
    }));
    const response = await serverWith().inject({
      method: "POST",
      url: "/v1/translate",
      payload: { sourceLanguage: "en", targetLanguage: "tr", cues },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_request");
  });

  it.each([
    ["wrong item count", []],
    ["non-string item", [42]],
  ])("rejects invalid provider output: %s", async (_case, output) => {
    const response = await serverWith(
      provider({ translate: vi.fn(async () => output as unknown as string[]) }),
    ).inject({
      method: "POST",
      url: "/v1/translate",
      payload: { sourceLanguage: "en", targetLanguage: "tr", cues: [cue] },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({ error: "translation_provider_invalid_response" });
  });

  it("returns a stable error when translation fails", async () => {
    const response = await serverWith(
      provider({ translate: vi.fn(async () => Promise.reject(new Error("localized provider message"))) }),
    ).inject({
      method: "POST",
      url: "/v1/translate",
      payload: { sourceLanguage: "en", targetLanguage: "tr", cues: [cue] },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({ error: "translation_provider_failed" });
  });

  it.each([
    "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ])("allows extension and local development origins: %s", async (origin) => {
    const response = await serverWith().inject({
      method: "GET",
      url: "/health",
      headers: { origin },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(origin);
  });

  it.each(["https://evil.example", "http://localhost.evil.example"])(
    "rejects arbitrary origins: %s",
    async (origin) => {
      const response = await serverWith().inject({
        method: "GET",
        url: "/health",
        headers: { origin },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: "origin_not_allowed" });
    },
  );

  it("rejects unsupported transcribe media types", async () => {
    const response = await serverWith().inject({
      method: "POST",
      url: "/v1/transcribe",
      payload: "not audio",
      headers: { "content-type": "text/plain" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "unsupported_audio" });
  });
});
