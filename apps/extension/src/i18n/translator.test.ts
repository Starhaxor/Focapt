import { expect, it } from "vitest";
import { Translator } from "./translator";

const bundles = {
  en: { reset: { message: "Reset defaults" } },
  tr: { reset: { message: "Varsayılana dön" } }
};

it("auto seçiminde tarayıcı arayüz dilini kullanır", () => {
  expect(new Translator(bundles, () => "tr-TR").t("reset", "auto")).toBe("Varsayılana dön");
});

it("manuel seçimi tarayıcı dilinin önüne geçirir", () => {
  expect(new Translator(bundles, () => "tr-TR").t("reset", "en")).toBe("Reset defaults");
});
