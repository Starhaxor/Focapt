import { z } from "zod";

const schema = z.object({
  HF_TOKEN: z.string().trim().min(1),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8_787),
  HOST: z.string().trim().min(1).default("127.0.0.1"),
});

export class ConfigError extends Error {
  override readonly name = "ConfigError";
  readonly code = "CONFIG_INVALID";

  constructor() {
    super("CONFIG_INVALID");
  }
}

export function loadConfig(env: Record<string, string | undefined>) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) throw new ConfigError();
  return parsed.data;
}
