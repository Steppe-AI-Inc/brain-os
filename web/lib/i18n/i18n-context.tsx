"use client";

import { createContext, useContext, useState, useCallback, useMemo } from "react";
import { DICT, type Locale } from "./dictionary";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, fallback: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

const LOCALE_COOKIE = "sem_locale";

function readInitialLocale(): Locale {
  if (typeof document === "undefined") return "en";
  const match = document.cookie.match(/(?:^|; )sem_locale=(en|mn)/);
  return (match?.[1] as Locale) ?? "en";
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readInitialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    if (typeof document !== "undefined") {
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000`;
    }
  }, []);

  const t = useCallback(
    (key: string, fallback: string) => {
      if (locale === "en") return fallback;
      const val = DICT[locale]?.[key];
      return val !== undefined ? val : fallback;
    },
    [locale]
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT must be used within an I18nProvider");
  return ctx;
}
