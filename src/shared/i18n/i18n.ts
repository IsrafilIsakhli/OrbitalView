import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { getInitialLocale, supportedLocales } from "./locales";
import { defaultNamespace, resources } from "./resources";

void i18n.use(initReactI18next).init({
  defaultNS: defaultNamespace,
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
  lng: getInitialLocale(),
  ns: [
    "awareness",
    "common",
    "dashboard",
    "earth",
    "launches",
    "missions",
    "nasa",
    "news",
    "navigation",
    "orbitalAnalysis",
    "satellites",
    "settings",
    "shell",
    "spaceWeather",
  ],
  resources,
  supportedLngs: supportedLocales,
});

export { i18n };
