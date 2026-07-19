import { browser } from "wxt/browser";

export type UiLocale = "auto" | "tr" | "en";

type Bundle = Record<string, { message: string }>;

export class Translator {
  constructor(
    private readonly bundles: Record<"tr" | "en", Bundle>,
    private readonly browserLocale: () => string
  ) {}

  resolveLocale(value: UiLocale): "tr" | "en" {
    if (value !== "auto") return value;
    return this.browserLocale().toLowerCase().startsWith("tr") ? "tr" : "en";
  }

  t(key: string, value: UiLocale = "auto"): string {
    return this.bundles[this.resolveLocale(value)][key]?.message ?? this.bundles.en[key]?.message ?? key;
  }
}

export async function createExtensionTranslator(): Promise<Translator> {
  const messagePaths = {
    en: "/_locales/en/messages.json",
    tr: "/_locales/tr/messages.json"
  } as const;
  const load = async (locale: "tr" | "en") =>
    fetch(browser.runtime.getURL(messagePaths[locale])).then(
      (response) => response.json() as Promise<Bundle>
    );

  return new Translator({ en: await load("en"), tr: await load("tr") }, () => browser.i18n.getUILanguage());
}
