import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "__MSG_appName__",
    description: "__MSG_appDescription__",
    default_locale: "en",
    minimum_chrome_version: "116",
    permissions: ["storage", "activeTab", "tabCapture", "offscreen"],
    host_permissions: ["https://www.youtube.com/*", "http://localhost:8787/*"]
  }
});
