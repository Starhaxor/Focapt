import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";

import type { CaptionProvider } from "./provider";
import { registerTranscribe } from "./routes/transcribe";
import { registerTranslate } from "./routes/translate";

function isAllowedOrigin(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }

  if (url.protocol === "chrome-extension:") {
    return (
      /^[a-p]{32}$/.test(url.hostname) &&
      origin === `chrome-extension://${url.hostname}`
    );
  }

  return (
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
    url.origin === origin
  );
}

export function buildServer(provider: CaptionProvider) {
  const server = Fastify({ logger: false });

  server.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (origin !== undefined && !isAllowedOrigin(origin)) {
      return reply.code(403).send({ error: "origin_not_allowed" });
    }
  });
  server.register(cors, { origin: true });
  server.register(multipart);
  server.setErrorHandler((error, _request, reply) => {
    const typedError = error as { code?: string; statusCode?: number };
    if (typedError.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      return reply.code(413).send({ error: "request_body_too_large" });
    }
    if (typedError.statusCode === 400) {
      return reply.code(400).send({ error: "invalid_request" });
    }
    return reply.code(typedError.statusCode ?? 500).send({ error: "internal_error" });
  });

  server.get("/health", async () => ({ status: "ok" }));
  server.register(async (app) => {
    await registerTranslate(app, provider);
    await registerTranscribe(app, provider);
  });
  return server;
}
