import {
  Alert24Regular,
  CalendarLtr24Regular,
  DataHistogram24Regular,
  Dismiss20Regular,
  Globe24Regular,
  Home24Regular,
  News24Regular,
  Rocket24Regular,
  Search24Regular,
  Settings24Regular,
  Star24Regular,
  WeatherMoon24Regular,
} from "@fluentui/react-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useSpaceIntelligence } from "@/features/launches/api/useSpaceIntelligence";
import { useActiveSatelliteCatalog } from "@/features/satellites/api/useActiveSatelliteCatalog";
import { useNasaIntelligence } from "@/features/nasa/api/useNasaIntelligence";
import { useSpaceNewsSearch } from "@/features/space-news/api/useSpaceNews";
import { formatCompactDate } from "@/shared/i18n/formatters";

import type { WorkspaceSelectionIntent } from "../model/workspaceSelection";

interface SearchPaletteProps {
  onClose: () => void;
  onSelect: (selection: WorkspaceSelectionIntent) => void;
  open: boolean;
}

const destinations = [
  { id: "explore", icon: Home24Regular, key: "navigation:explore" },
  { id: "satellites", icon: Globe24Regular, key: "navigation:satellites" },
  { id: "orbitalAnalysis", icon: DataHistogram24Regular, key: "navigation:orbitalAnalysis" },
  { id: "launches", icon: Rocket24Regular, key: "navigation:launches" },
  { id: "missions", icon: CalendarLtr24Regular, key: "navigation:missions" },
  { id: "spaceNews", icon: News24Regular, key: "navigation:spaceNews" },
  { id: "nasa", icon: Star24Regular, key: "dashboard:actions.nasa" },
  { id: "spaceWeather", icon: WeatherMoon24Regular, key: "dashboard:actions.weather" },
  { id: "favorites", icon: Star24Regular, key: "navigation:favorites" },
  { id: "notifications", icon: Alert24Regular, key: "navigation:notifications" },
  { id: "settings", icon: Settings24Regular, key: "navigation:settings" },
] as const;

type SearchIcon = (typeof destinations)[number]["icon"];

interface SearchResult {
  icon: SearchIcon;
  intent: WorkspaceSelectionIntent;
  key: string;
  meta: string | null;
  title: string;
}

export function SearchPalette({ open, onClose, onSelect }: SearchPaletteProps) {
  const { i18n, t } = useTranslation(["dashboard", "launches", "navigation", "news", "orbitalAnalysis", "shell"]);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const normalizedQuery = debouncedQuery.trim().toLocaleLowerCase();
  const shouldSearch = open && normalizedQuery.length >= 2;
  const satelliteCatalog = useActiveSatelliteCatalog({ enabled: shouldSearch });
  const spaceIntelligence = useSpaceIntelligence({ enabled: shouldSearch });
  const news = useSpaceNewsSearch(debouncedQuery, shouldSearch);
  const nasa = useNasaIntelligence({ enabled: shouldSearch });
  const locale = i18n.resolvedLanguage ?? "en";

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 150);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;
    dialog.showModal();
    inputRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
      setQuery("");
      setDebouncedQuery("");
      setActiveIndex(0);
    };
  }, [open]);

  const satelliteIndex = useMemo(() => (
    satelliteCatalog.data?.satellites.map((satellite) => ({
      record: satellite,
      search: `${satellite.name}\u0000${satellite.noradId}\u0000${satellite.internationalDesignator}`.toLocaleLowerCase(),
    })) ?? []
  ), [satelliteCatalog.data]);

  const results = useMemo<SearchResult[]>(() => {
    const destinationResults = destinations
      .filter(({ key }) => !normalizedQuery || t(key).toLocaleLowerCase().includes(normalizedQuery))
      .map(({ id, icon, key }) => ({
        icon,
        intent: { destination: id, type: "destination" as const },
        key: `destination:${id}`,
        meta: null,
        title: t(key),
      }));
    if (normalizedQuery.length < 2) return destinationResults;

    const satelliteResults = satelliteIndex
      .filter(({ search }) => search.includes(normalizedQuery))
      .slice(0, 8)
      .map(({ record }) => ({
        icon: Globe24Regular,
        intent: { satelliteId: record.id, type: "satellite" } as const,
        key: `satellite:${record.id}`,
        meta: t("shell:search.satelliteMeta", { id: record.noradId }),
        title: record.name,
      }));
    const satelliteAnalysisResults = satelliteIndex
      .filter(({ search }) => search.includes(normalizedQuery))
      .slice(0, 4)
      .map(({ record }) => ({
        icon: DataHistogram24Regular,
        intent: {
          satelliteId: record.id,
          tab: "dynamics",
          type: "orbitalAnalysis",
        } as const,
        key: `analysis:${record.id}`,
        meta: `${t("orbitalAnalysis:actions.analyze")} · NORAD ${record.noradId}`,
        title: record.name,
      }));
    const launchResults = (spaceIntelligence.data?.launches ?? [])
      .filter((launch) => [launch.name, launch.agencyName, launch.rocketName, launch.rocket?.manufacturerName, launch.missionName, launch.padName, launch.locationName, launch.launchDesignator]
        .some((value) => value?.toLocaleLowerCase().includes(normalizedQuery)))
      .slice(0, 6)
      .map((launch) => ({
        icon: Rocket24Regular,
        intent: { launchId: launch.id, type: "launch" } as const,
        key: `launch:${launch.id}`,
        meta: t("launches:search.launchMeta", { agency: launch.agencyAbbreviation ?? launch.agencyName ?? t("launches:common.unavailable"), date: formatCompactDate(launch.net, locale) }),
        title: launch.name,
      }));
    const missionResults = (spaceIntelligence.data?.launches ?? [])
      .filter((launch) => [launch.missionName, launch.missionDescription, ...launch.payloadNames]
        .some((value) => value?.toLocaleLowerCase().includes(normalizedQuery)))
      .slice(0, 4)
      .map((launch) => ({
        icon: CalendarLtr24Regular,
        intent: { launchId: launch.id, type: "mission" } as const,
        key: `mission:${launch.id}`,
        meta: t("shell:search.missionMeta", { date: formatCompactDate(launch.net, locale) }),
        title: launch.missionName ?? launch.name,
      }));
    const rocketResults = [...new Map((spaceIntelligence.data?.launches ?? [])
      .filter((launch) => [launch.rocketName, launch.rocket?.fullName, launch.rocket?.manufacturerName]
        .some((value) => value?.toLocaleLowerCase().includes(normalizedQuery)))
      .map((launch) => [launch.rocket?.id ?? launch.rocketName ?? launch.id, launch] as const)).values()]
      .slice(0, 4)
      .map((launch) => ({
        icon: Rocket24Regular,
        intent: { launchId: launch.id, type: "rocket" } as const,
        key: `rocket:${launch.rocket?.id ?? launch.id}`,
        meta: t("shell:search.rocketMeta", { agency: launch.agencyAbbreviation ?? launch.agencyName ?? t("launches:common.unavailable") }),
        title: launch.rocket?.fullName ?? launch.rocketName ?? launch.name,
      }));
    const siteResults = [...new Map((spaceIntelligence.data?.launches ?? [])
      .filter((launch) => [launch.padName, launch.locationName, launch.countryName, launch.countryCode]
        .some((value) => value?.toLocaleLowerCase().includes(normalizedQuery)))
      .map((launch) => [`${launch.latitude}:${launch.longitude}`, launch] as const)).values()]
      .slice(0, 4)
      .map((launch) => ({
        icon: Globe24Regular,
        intent: { launchId: launch.id, type: "launchSite" } as const,
        key: `site:${launch.latitude}:${launch.longitude}`,
        meta: t("shell:search.siteMeta", { country: launch.countryName ?? launch.countryCode ?? t("launches:common.unavailable") }),
        title: launch.padName ?? launch.locationName ?? launch.name,
      }));
    const eventResults = (spaceIntelligence.data?.events ?? [])
      .filter((event) => [event.name, event.typeName, event.location].some((value) => value?.toLocaleLowerCase().includes(normalizedQuery)))
      .slice(0, 4)
      .map((event) => ({
        icon: CalendarLtr24Regular,
        intent: { eventId: event.id, type: "event" } as const,
        key: `event:${event.id}`,
        meta: t("launches:search.eventMeta", { date: formatCompactDate(event.date, locale) }),
        title: event.name,
      }));
    const newsResults = (news.data ?? []).slice(0, 6).map((item) => ({
      icon: News24Regular,
      intent: { newsId: item.id, type: "news" } as const,
      key: `news:${item.id}`,
      meta: t("news:search.meta", { date: formatCompactDate(item.publishedAtUnixMs, locale), source: item.source }),
      title: item.title,
    }));
    const nasaResults = [
      ...(nasa.data?.apod && [nasa.data.apod.title, nasa.data.apod.explanation].some((value) => value.toLocaleLowerCase().includes(normalizedQuery))
        ? [{ icon: Star24Regular, intent: { itemId: `apod:${nasa.data.apod.date}`, type: "nasa" as const }, key: `nasa:apod:${nasa.data.apod.date}`, meta: t("shell:search.nasaMeta"), title: nasa.data.apod.title }]
        : []),
      ...(nasa.data?.approaches.filter((item) => [item.name, item.id].some((value) => value.toLocaleLowerCase().includes(normalizedQuery))).slice(0, 3).map((item) => ({ icon: Globe24Regular, intent: { itemId: item.id, type: "nasa" as const }, key: `nasa:neo:${item.id}`, meta: t("shell:search.nasaMeta"), title: item.name })) ?? []),
      ...(nasa.data?.spaceWeatherEvents.filter((item) => [item.summary, item.location, item.magnitudeLabel].some((value) => value?.toLocaleLowerCase().includes(normalizedQuery))).slice(0, 3).map((item) => ({ icon: WeatherMoon24Regular, intent: { itemId: item.id, type: "nasa" as const }, key: `nasa:event:${item.id}`, meta: t("shell:search.nasaMeta"), title: item.magnitudeLabel ?? item.location ?? item.id })) ?? []),
    ].slice(0, 6);
    return [...destinationResults, ...satelliteResults, ...satelliteAnalysisResults, ...launchResults, ...missionResults, ...rocketResults, ...siteResults, ...eventResults, ...newsResults, ...nasaResults];
  }, [locale, nasa.data, news.data, normalizedQuery, satelliteIndex, spaceIntelligence.data, t]);
  const safeActiveIndex = results.length === 0 ? 0 : activeIndex % results.length;

  useEffect(() => {
    const active = dialogRef.current?.querySelector<HTMLElement>(`#search-result-${safeActiveIndex}`);
    if (active && typeof active.scrollIntoView === "function") {
      active.scrollIntoView({ block: "nearest" });
    }
  }, [safeActiveIndex]);

  if (!open) return null;

  const choose = (result: SearchResult) => onSelect(result.intent);
  return (
    <dialog
      aria-labelledby="search-dialog-title"
      className="search-dialog glass-surface"
      onCancel={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        } else if (event.key === "ArrowDown" && results.length > 0) {
          event.preventDefault();
          setActiveIndex((index) => (index + 1) % results.length);
        } else if (event.key === "ArrowUp" && results.length > 0) {
          event.preventDefault();
          setActiveIndex((index) => (index - 1 + results.length) % results.length);
        } else if (event.key === "Enter" && results[safeActiveIndex]) {
          event.preventDefault();
          choose(results[safeActiveIndex]);
        }
      }}
      ref={dialogRef}
    >
      <div className="search-dialog__header">
        <Search24Regular aria-hidden />
        <input
          aria-activedescendant={results[safeActiveIndex] ? `search-result-${safeActiveIndex}` : undefined}
          aria-controls="search-results-list"
          aria-label={t("shell:search.button")}
          aria-expanded="true"
          aria-autocomplete="list"
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            setActiveIndex(0);
          }}
          placeholder={t("shell:search.placeholder")}
          ref={inputRef}
          role="combobox"
          value={query}
        />
        <button aria-label={t("shell:search.closeHint")} className="icon-button" onClick={onClose} type="button"><Dismiss20Regular aria-hidden /></button>
      </div>
      <div className="search-dialog__meta"><strong id="search-dialog-title">{t("shell:search.dialogTitle")}</strong><span>{t("shell:search.hint")}</span></div>
      <div className="search-results" id="search-results-list" role="listbox">
        {results.map((result, index) => {
          const Icon = result.icon;
          return (
            <button
              aria-selected={safeActiveIndex === index}
              className="search-result"
              data-active={safeActiveIndex === index}
              id={`search-result-${index}`}
              key={result.key}
              onClick={() => choose(result)}
              onMouseEnter={() => setActiveIndex(index)}
              role="option"
              type="button"
            >
              <span className="search-result__icon"><Icon aria-hidden /></span>
              <span className="search-result__content"><strong>{result.title}</strong>{result.meta && <small>{result.meta}</small>}</span>
            </button>
          );
        })}
        {results.length === 0 && <p className="search-dialog__empty">{t("shell:search.empty")}</p>}
      </div>
      <footer className="search-dialog__footer"><kbd>{t("shell:search.escapeKey")}</kbd><span>{t("shell:search.closeHint")}</span></footer>
    </dialog>
  );
}
