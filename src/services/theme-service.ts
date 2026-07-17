import type { TFunction } from "i18next";
import type { ThemeMode } from "@/types/document";

const KEY = "minimarkdown-theme-mode";

class ThemeService {
  getMode(): ThemeMode {
    const stored = localStorage.getItem(KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
    return "system";
  }

  setMode(mode: ThemeMode) {
    localStorage.setItem(KEY, mode);
    const root = document.documentElement;
    const resolved = mode === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : mode;
    root.classList.toggle("dark", resolved === "dark");
  }

  label(mode: ThemeMode, t: TFunction) {
    if (mode === "light") return t("theme.light");
    if (mode === "dark") return t("theme.dark");
    return t("theme.system");
  }
}

export const themeService = new ThemeService();
