export const supportedLocales = ["az", "tr", "en", "ru", "es"] as const;

export type SupportedLocale = (typeof supportedLocales)[number];

export const localeFlags: Record<SupportedLocale, string> = {
  az: "AZ",
  tr: "TR",
  en: "EN",
  ru: "RU",
  es: "ES",
};

const localeAliases: Record<string, SupportedLocale> = {
  az: "az",
  tr: "tr",
  en: "en",
  ru: "ru",
  es: "es",
};

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return (
    typeof value === "string" &&
    supportedLocales.some((locale) => locale === value)
  );
}

export function normalizeLocale(value: string | null | undefined): SupportedLocale {
  const language = value?.trim().toLocaleLowerCase().split(/[-_]/)[0] ?? "";
  return localeAliases[language] ?? "en";
}

function readPersistedLocale(): SupportedLocale | undefined {
  try {
    const value = window.localStorage.getItem("orbital-vision.preferences");
    if (!value) return undefined;
    const parsed = JSON.parse(value) as { state?: { locale?: unknown } };
    return isSupportedLocale(parsed.state?.locale) ? parsed.state.locale : undefined;
  } catch {
    return undefined;
  }
}

export function getInitialLocale(): SupportedLocale {
  if (typeof window === "undefined") return "en";
  const persistedLocale = readPersistedLocale();
  return persistedLocale ?? normalizeLocale(window.navigator.language);
}

export const intlLocaleTags: Record<SupportedLocale, string> = {
  az: "az-Latn-AZ",
  tr: "tr-TR",
  en: "en-US",
  ru: "ru-RU",
  es: "es-ES",
};
