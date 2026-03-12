"use client";

import { LazyStore } from "@tauri-apps/plugin-store";
import { ThemeMode } from "./WorkbenchShell";

const THEME_STORE_PATH = "preferences.json";
const THEME_MODE_KEY = "themeMode";
const THEME_MODE_LOCAL_KEY = "excel-utils.theme-mode";

const themeStore = new LazyStore(THEME_STORE_PATH, { defaults: {}, autoSave: false });

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "default" || value === "dark" || value === "compact" || value === "dark-compact";
}

export async function readThemeMode(): Promise<ThemeMode | null> {
  if (typeof window === "undefined") return null;

  if (isTauriRuntime()) {
    try {
      const value = await themeStore.get<ThemeMode>(THEME_MODE_KEY);
      if (isThemeMode(value)) return value;
    } catch {
      // Fall through to local fallback.
    }
  }

  try {
    const localValue = window.localStorage.getItem(THEME_MODE_LOCAL_KEY);
    if (isThemeMode(localValue)) return localValue;
  } catch {
    // Ignore malformed browser cache.
  }

  return null;
}

export async function persistThemeMode(mode: ThemeMode): Promise<void> {
  if (typeof window === "undefined") return;

  if (isTauriRuntime()) {
    try {
      await themeStore.set(THEME_MODE_KEY, mode);
      await themeStore.save();
    } catch {
      // Fall back to local cache.
    }
  }

  try {
    window.localStorage.setItem(THEME_MODE_LOCAL_KEY, mode);
  } catch {
    // Ignore write failure.
  }
}
