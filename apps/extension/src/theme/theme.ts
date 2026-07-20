import type { ThemePreference } from "@focapt/contracts/settings";

export type ResolvedTheme = "light" | "dark";

export const resolveTheme = (
  preference: ThemePreference,
  media: Pick<MediaQueryList, "matches">
): ResolvedTheme => preference === "system"
  ? (media.matches ? "dark" : "light")
  : preference;

export const applyTheme = (root: HTMLElement, theme: ResolvedTheme): void => {
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
};
