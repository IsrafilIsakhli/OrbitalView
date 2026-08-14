import azCommon from "@/locales/az/common.json";
import azAwareness from "@/locales/az/awareness.json";
import azEarth from "@/locales/az/earth.json";
import azLaunches from "@/locales/az/launches.json";
import azMissions from "@/locales/az/missions.json";
import azNavigation from "@/locales/az/navigation.json";
import azNasa from "@/locales/az/nasa.json";
import azNews from "@/locales/az/news.json";
import azOrbitalAnalysis from "@/locales/az/orbitalAnalysis.json";
import azDashboard from "@/locales/az/dashboard.json";
import azSatellites from "@/locales/az/satellites.json";
import azSettings from "@/locales/az/settings.json";
import azShell from "@/locales/az/shell.json";
import azSpaceWeather from "@/locales/az/spaceWeather.json";
import enCommon from "@/locales/en/common.json";
import enAwareness from "@/locales/en/awareness.json";
import enEarth from "@/locales/en/earth.json";
import enLaunches from "@/locales/en/launches.json";
import enMissions from "@/locales/en/missions.json";
import enNavigation from "@/locales/en/navigation.json";
import enNasa from "@/locales/en/nasa.json";
import enNews from "@/locales/en/news.json";
import enOrbitalAnalysis from "@/locales/en/orbitalAnalysis.json";
import enDashboard from "@/locales/en/dashboard.json";
import enSatellites from "@/locales/en/satellites.json";
import enSettings from "@/locales/en/settings.json";
import enShell from "@/locales/en/shell.json";
import enSpaceWeather from "@/locales/en/spaceWeather.json";
import esCommon from "@/locales/es/common.json";
import esAwareness from "@/locales/es/awareness.json";
import esEarth from "@/locales/es/earth.json";
import esLaunches from "@/locales/es/launches.json";
import esMissions from "@/locales/es/missions.json";
import esNavigation from "@/locales/es/navigation.json";
import esNasa from "@/locales/es/nasa.json";
import esNews from "@/locales/es/news.json";
import esOrbitalAnalysis from "@/locales/es/orbitalAnalysis.json";
import esDashboard from "@/locales/es/dashboard.json";
import esSatellites from "@/locales/es/satellites.json";
import esSettings from "@/locales/es/settings.json";
import esShell from "@/locales/es/shell.json";
import esSpaceWeather from "@/locales/es/spaceWeather.json";
import ruCommon from "@/locales/ru/common.json";
import ruAwareness from "@/locales/ru/awareness.json";
import ruEarth from "@/locales/ru/earth.json";
import ruLaunches from "@/locales/ru/launches.json";
import ruMissions from "@/locales/ru/missions.json";
import ruNavigation from "@/locales/ru/navigation.json";
import ruNasa from "@/locales/ru/nasa.json";
import ruNews from "@/locales/ru/news.json";
import ruOrbitalAnalysis from "@/locales/ru/orbitalAnalysis.json";
import ruDashboard from "@/locales/ru/dashboard.json";
import ruSatellites from "@/locales/ru/satellites.json";
import ruSettings from "@/locales/ru/settings.json";
import ruShell from "@/locales/ru/shell.json";
import ruSpaceWeather from "@/locales/ru/spaceWeather.json";
import trAwareness from "@/locales/tr/awareness.json";
import trCommon from "@/locales/tr/common.json";
import trDashboard from "@/locales/tr/dashboard.json";
import trEarth from "@/locales/tr/earth.json";
import trLaunches from "@/locales/tr/launches.json";
import trMissions from "@/locales/tr/missions.json";
import trNavigation from "@/locales/tr/navigation.json";
import trNasa from "@/locales/tr/nasa.json";
import trNews from "@/locales/tr/news.json";
import trOrbitalAnalysis from "@/locales/tr/orbitalAnalysis.json";
import trSatellites from "@/locales/tr/satellites.json";
import trSettings from "@/locales/tr/settings.json";
import trShell from "@/locales/tr/shell.json";
import trSpaceWeather from "@/locales/tr/spaceWeather.json";

export const resources = {
  az: {
    awareness: azAwareness,
    common: azCommon,
    dashboard: azDashboard,
    earth: azEarth,
    launches: azLaunches,
    missions: azMissions,
    navigation: azNavigation,
    nasa: azNasa,
    news: azNews,
    orbitalAnalysis: azOrbitalAnalysis,
    satellites: azSatellites,
    settings: azSettings,
    shell: azShell,
    spaceWeather: azSpaceWeather,
  },
  en: {
    awareness: enAwareness,
    common: enCommon,
    dashboard: enDashboard,
    earth: enEarth,
    launches: enLaunches,
    missions: enMissions,
    navigation: enNavigation,
    nasa: enNasa,
    news: enNews,
    orbitalAnalysis: enOrbitalAnalysis,
    satellites: enSatellites,
    settings: enSettings,
    shell: enShell,
    spaceWeather: enSpaceWeather,
  },
  es: {
    awareness: esAwareness,
    common: esCommon,
    dashboard: esDashboard,
    earth: esEarth,
    launches: esLaunches,
    missions: esMissions,
    navigation: esNavigation,
    nasa: esNasa,
    news: esNews,
    orbitalAnalysis: esOrbitalAnalysis,
    satellites: esSatellites,
    settings: esSettings,
    shell: esShell,
    spaceWeather: esSpaceWeather,
  },
  ru: {
    awareness: ruAwareness,
    common: ruCommon,
    dashboard: ruDashboard,
    earth: ruEarth,
    launches: ruLaunches,
    missions: ruMissions,
    navigation: ruNavigation,
    nasa: ruNasa,
    news: ruNews,
    orbitalAnalysis: ruOrbitalAnalysis,
    satellites: ruSatellites,
    settings: ruSettings,
    shell: ruShell,
    spaceWeather: ruSpaceWeather,
  },
  tr: {
    awareness: trAwareness,
    common: trCommon,
    dashboard: trDashboard,
    earth: trEarth,
    launches: trLaunches,
    missions: trMissions,
    navigation: trNavigation,
    nasa: trNasa,
    news: trNews,
    orbitalAnalysis: trOrbitalAnalysis,
    satellites: trSatellites,
    settings: trSettings,
    shell: trShell,
    spaceWeather: trSpaceWeather,
  },
} as const;

export const defaultNamespace = "common" as const;
