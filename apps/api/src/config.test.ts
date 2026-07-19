import { expect, it } from "vitest";

import { ConfigError, loadConfig } from "./config";

it("loads defaults and explicit values", () => {
  expect(loadConfig({ HF_TOKEN: "token" })).toEqual({
    HF_TOKEN: "token",
    PORT: 8787,
    HOST: "127.0.0.1",
  });
  expect(loadConfig({ HF_TOKEN: "token", PORT: "9000", HOST: "0.0.0.0" })).toEqual({
    HF_TOKEN: "token",
    PORT: 9000,
    HOST: "0.0.0.0",
  });
});

it.each([
  {},
  { HF_TOKEN: "   " },
  { HF_TOKEN: "token", PORT: "0" },
  { HF_TOKEN: "token", PORT: "1.5" },
  { HF_TOKEN: "token", PORT: "65536" },
])("throws a locale-independent config error for %j", (env) => {
  expect(() => loadConfig(env)).toThrowError(ConfigError);
  try {
    loadConfig(env);
  } catch (error) {
    expect(error).toMatchObject({ code: "CONFIG_INVALID", message: "CONFIG_INVALID" });
  }
});
