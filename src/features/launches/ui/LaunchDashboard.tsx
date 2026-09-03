import {
  CalendarClock24Regular,
  Globe24Regular,
  Location24Regular,
  Rocket24Regular,
  Search20Regular,
  Video24Regular,
  WeatherRain24Regular,
} from "@fluentui/react-icons";
import { motion } from "motion/react";
import {
  Fragment,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { FavoriteButton } from "@/features/awareness/ui/FavoriteButton";
import { usePreferencesStore } from "@/features/settings/model/preferences";
import { formatSurfaceSpeed, formatTemperature as formatTemperatureUnit } from "@/shared/formatting/units";
import {
  formatDateTime,
  formatNumber,
} from "@/shared/i18n/formatters";
import { openExternalUrl } from "@/shared/security/externalUrl";
import { RemoteMediaImage } from "@/shared/ui/RemoteMediaImage";

import { useCompletedLaunches } from "../api/useLaunchOperations";
import { useLaunchWeather } from "../api/useLaunchWeather";
import { useSpaceIntelligence } from "../api/useSpaceIntelligence";
import { calculateLaunchCountdown } from "../domain/countdown";
import { classifyLaunchStatus, type LaunchRecord } from "../domain/launch";
import {
  createLaunchQueues,
  filterLaunchTimeline,
  launchStatusTone,
  launchStatusTranslationKey,
  selectNextLaunch,
  type LaunchQueueTab,
  type LaunchTimelineRange,
} from "../domain/launchPresentation";
import { closestForecast, type WeatherPoint } from "../domain/weather";
import { useLaunchSelectionStore } from "../model/selection";
import { LaunchDetailWorkspace } from "./LaunchDetailWorkspace";

interface LaunchDashboardProps {
  onOpenNews?: (newsId: string) => void;
  onShowEarth?: (launchId: string) => void;
}

type IntelligenceTab = "overview" | "payload" | "rocket" | "site";

export function LaunchDashboard({ onOpenNews, onShowEarth }: LaunchDashboardProps) {
  const { i18n, t } = useTranslation("launches");
  const query = useSpaceIntelligence();
  const requestedLaunchId = useLaunchSelectionStore((state) => state.requestedLaunchId);
  const clearRequestedLaunch = useLaunchSelectionStore((state) => state.clearRequestedLaunch);
  const [queueTab, setQueueTab] = useState<LaunchQueueTab>("upcoming");
  const [range, setRange] = useState<LaunchTimelineRange>("thirtyDays");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [intelligenceTab, setIntelligenceTab] = useState<IntelligenceTab>("overview");
  const [now, setNow] = useState(() => Date.now());
  const activeDetailId = requestedLaunchId ?? detailId;
  const completedQuery = useCompletedLaunches({ enabled: queueTab === "completed", limit: 100 });
  const locale = i18n.resolvedLanguage ?? "en";
  const timeDisplay = usePreferencesStore((state) => state.timeDisplay);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!activeDetailId) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      setDetailId(null);
      clearRequestedLaunch();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [activeDetailId, clearRequestedLaunch]);

  const queues = useMemo(
    () => createLaunchQueues(query.data?.launches ?? [], completedQuery.data?.launches ?? []),
    [completedQuery.data?.launches, query.data?.launches],
  );
  const currentQueue = queues[queueTab];
  const selected = useMemo(() => {
    const requested = currentQueue.find((launch) => launch.id === selectedId);
    return requested ?? selectNextLaunch(currentQueue, now);
  }, [currentQueue, now, selectedId]);
  const filteredTimeline = useMemo(
    () => filterLaunchTimeline(currentQueue, { nowUnixMs: now, query: search, range, tab: queueTab }),
    [currentQueue, now, queueTab, range, search],
  );
  const visibleTimeline = filteredTimeline.slice(0, 80);
  const weatherEnabled = selected !== null && classifyLaunchStatus(selected.statusId) !== "completed";
  const weatherQuery = useLaunchWeather(
    weatherEnabled ? selected?.latitude ?? null : null,
    weatherEnabled ? selected?.longitude ?? null : null,
  );
  const forecast = selected && weatherQuery.data
    ? closestForecast(weatherQuery.data, selected.net)
    : null;

  if (query.isPending) return <LaunchState kind="loading" />;
  if (query.isError || !query.data) return <LaunchState kind="error" />;

  if (activeDetailId) {
    const fallbackLaunch = query.data.launches.find((launch) => launch.id === activeDetailId)
      ?? completedQuery.data?.launches.find((launch) => launch.id === activeDetailId)
      ?? null;
    return (
      <LaunchDetailWorkspace
        fallbackLaunch={fallbackLaunch}
        launchId={activeDetailId}
        onBack={() => {
          setDetailId(null);
          clearRequestedLaunch();
        }}
        onOpenNews={onOpenNews}
        onShowEarth={(launchId) => onShowEarth?.(launchId)}
      />
    );
  }

  const providerTotal = queueTab === "completed"
    ? completedQuery.data?.providerCount ?? queues.completed.length
    : queueTab === "active"
      ? queues.active.length
      : query.data.launchCount;
  return (
    <section className="launch-dashboard">
      <div aria-hidden className="launch-dashboard__nebula" />
      <header className="launch-page-header">
        <div>
          <p className="eyebrow"><span />{t("eyebrow")}</p>
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
      </header>

      <div className="launch-layout">
        <div className="launch-primary">
          {selected ? (
            <motion.article
              animate={{ opacity: 1, y: 0 }}
              className="launch-hero"
              initial={{ opacity: 0, y: 8 }}
              key={selected.id}
            >
              <LaunchHeroImage launch={selected} />
              <div className="launch-hero__content">
                <div className="launch-hero__topline">
                  <span>{t(`hero.${heroLabelKey(selected, queueTab, currentQueue, now)}`)}</span>
                  <StatusBadge launch={selected} />
                </div>
                <p className="launch-agency">{selected.agencyName ?? t("common.unavailable")}</p>
                <h2>{selected.name}</h2>
                <Countdown launch={selected} now={now} />
                <LaunchTimeSummary launch={selected} locale={locale} timeDisplay={timeDisplay} />
                <div className="launch-hero__actions">
                  <button className="launch-primary-action" onClick={() => setDetailId(selected.id)} type="button">
                    <Rocket24Regular aria-hidden />
                    {t("actions.details")}
                  </button>
                  {onShowEarth && selected.latitude !== null && selected.longitude !== null && (
                    <button className="launch-secondary-action" onClick={() => onShowEarth(selected.id)} type="button">
                      <Globe24Regular aria-hidden />
                      {t("actions.showEarth")}
                    </button>
                  )}
                  {selected.streamUrl && (
                    <button className="launch-secondary-action" onClick={() => void openExternal(selected.streamUrl!)} type="button">
                      <Video24Regular aria-hidden />
                      {t("hero.watch")}
                    </button>
                  )}
                  <FavoriteButton
                    className="launch-favorite-action"
                    favorite={{
                      id: selected.id,
                      imageUrl: selected.image?.thumbnailUrl ?? selected.image?.url ?? null,
                      kind: "launch",
                      occurredAt: selected.net,
                      subtitle: selected.agencyName ?? selected.rocketName,
                      title: selected.name,
                    }}
                    showLabel
                  />
                  {selected.probability !== null && classifyLaunchStatus(selected.statusId) !== "completed" && (
                    <span className="launch-probability" title={query.data.source}>
                      <strong>{Math.round(selected.probability)}%</strong>
                      {t("fields.probability")}
                      <small>{t("source.ll2")}</small>
                    </span>
                  )}
                </div>
              </div>
            </motion.article>
          ) : (
            <LaunchQueueEmpty tab={queueTab} />
          )}

          {selected && (
            <LaunchIntelligencePanel
              forecast={forecast}
              launch={selected}
              locale={locale}
              now={now}
              onOpenDetails={() => setDetailId(selected.id)}
              onSelectTab={setIntelligenceTab}
              selectedTab={intelligenceTab}
              weatherError={weatherQuery.isError}
              weatherLoading={weatherQuery.isPending && weatherEnabled}
              weatherSource={weatherQuery.data?.source ?? null}
            />
          )}
        </div>

        <aside className="launch-timeline glass-surface">
          <header>
            <div>
              <h2>{t("timeline.title")}</h2>
              <p>{t("timeline.loaded", { loaded: currentQueue.length, total: providerTotal })}</p>
            </div>
            <CalendarClock24Regular aria-hidden />
          </header>

          <div aria-label={t("timeline.queueLabel")} className="launch-timeline__tabs" role="tablist">
            {(["upcoming", "active", "completed"] as const).map((tab) => (
              <button
                aria-selected={queueTab === tab}
                data-active={queueTab === tab}
                key={tab}
                onClick={() => {
                  setQueueTab(tab);
                  setSelectedId(null);
                  setIntelligenceTab("overview");
                }}
                role="tab"
                type="button"
              >
                <span>{t(`timeline.tabs.${tab}`)}</span>
                <strong>{tab === "completed" ? completedQuery.data?.providerCount ?? queues.completed.length : queues[tab].length}</strong>
              </button>
            ))}
          </div>

          <div className="launch-timeline__tools">
            <label>
              <Search20Regular aria-hidden />
              <input
                aria-label={t("timeline.search")}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("timeline.search")}
                type="search"
                value={search}
              />
            </label>
            <div aria-label={t("timeline.rangeLabel")} role="group">
              {(["sevenDays", "thirtyDays", "all"] as const).map((item) => (
                <button aria-pressed={range === item} data-active={range === item} key={item} onClick={() => setRange(item)} type="button">
                  {t(`timeline.ranges.${item}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="launch-timeline__list">
            {queueTab === "completed" && completedQuery.isPending && queues.completed.length === 0 && (
              <p className="launch-timeline__state">{t("timeline.loadingCompleted")}</p>
            )}
            {visibleTimeline.length === 0 && !(queueTab === "completed" && completedQuery.isPending) && (
              <p className="launch-timeline__state">{t(search ? "timeline.noResults" : `timeline.empty.${queueTab}`)}</p>
            )}
            {visibleTimeline.map((launch, index) => {
              const previous = visibleTimeline[index - 1];
              const groupKey = utcDateKey(launch.net);
              const showGroup = !previous || utcDateKey(previous.net) !== groupKey;
              return (
                <Fragment key={launch.id}>
                  {showGroup && <h3 className="launch-timeline__date-group">{formatGroupDate(launch.net, locale)}</h3>}
                  <button
                    aria-label={t("timeline.select", { name: launch.name })}
                    className="launch-timeline-item"
                    data-active={launch.id === selected?.id}
                    onClick={() => {
                      clearRequestedLaunch();
                      setSelectedId(launch.id);
                      setIntelligenceTab("overview");
                    }}
                    onKeyDown={handleTimelineKeyDown}
                    type="button"
                  >
                    <span className="launch-timeline-item__line"><i /><b>{String(index + 1).padStart(2, "0")}</b></span>
                    <span className="launch-timeline-item__content">
                      <small>{formatTimelineDate(launch.net, locale, t("timeline.today"), t("timeline.tomorrow"))}</small>
                      <strong>{launch.name}</strong>
                      <span><Location24Regular aria-hidden />{launch.padName ?? launch.agencyName ?? t("common.unavailable")}</span>
                    </span>
                    <span className="launch-timeline-item__status" data-status={launchStatusTone(launch.statusId)}>
                      {t(`status.${launchStatusTranslationKey(launch.statusId)}`)}
                    </span>
                  </button>
                </Fragment>
              );
            })}
          </div>
          <footer>{t("timeline.showing", { count: visibleTimeline.length, total: filteredTimeline.length })}</footer>
        </aside>
      </div>
    </section>
  );
}

function LaunchIntelligencePanel({
  forecast,
  launch,
  locale,
  now,
  onOpenDetails,
  onSelectTab,
  selectedTab,
  weatherError,
  weatherLoading,
  weatherSource,
}: {
  forecast: WeatherPoint | null;
  launch: LaunchRecord;
  locale: string;
  now: number;
  onOpenDetails: () => void;
  onSelectTab: (tab: IntelligenceTab) => void;
  selectedTab: IntelligenceTab;
  weatherError: boolean;
  weatherLoading: boolean;
  weatherSource: string | null;
}) {
  const { t } = useTranslation("launches");
  const units = usePreferencesStore((state) => state.units);
  const completed = classifyLaunchStatus(launch.statusId) === "completed";
  const daysUntilLaunch = Math.ceil((Date.parse(launch.net) - now) / 86_400_000);

  return (
    <article className="launch-intelligence glass-surface">
      <header>
        <div aria-label={t("intelligence.label")} className="launch-intelligence__tabs" role="tablist">
          {(["overview", "payload", "rocket", "site"] as const).map((tab) => (
            <button
              aria-selected={selectedTab === tab}
              data-active={selectedTab === tab}
              key={tab}
              onClick={() => onSelectTab(tab)}
              role="tab"
              type="button"
            >
              {t(`intelligence.tabs.${tab}`)}
              {tab === "payload" && launch.payloadNames.length > 0 && <strong>{launch.payloadNames.length}</strong>}
            </button>
          ))}
        </div>
        <button className="launch-intelligence__details" onClick={onOpenDetails} type="button">{t("actions.fullRecord")}</button>
      </header>

      <div className="launch-intelligence__body" role="tabpanel">
        {selectedTab === "overview" && (
          <>
            <div className="launch-intelligence__heading">
              <span className="launch-card-icon"><Rocket24Regular aria-hidden /></span>
              <div><small>{t("hero.mission")}</small><strong>{launch.missionName ?? launch.name}</strong></div>
            </div>
            <p className="launch-intelligence__description">
              {launch.missionDescription ?? t("missions.noDescription")}
              {launch.missionDescription && <small>{t("intelligence.providerContent")}</small>}
            </p>
            <dl className="launch-intelligence__facts">
              <Detail label={t("fields.rocket")} value={launch.rocketName} />
              <Detail label={t("fields.agency")} value={launch.agencyName} />
              <Detail label={t("fields.orbit")} value={launch.orbitName ?? launch.orbitAbbreviation} />
              <Detail label={t("fields.designator")} value={launch.launchDesignator} />
              <Detail label={t("fields.pad")} value={launch.padName} />
              <Detail label={t("fields.status")} value={t(`status.${launchStatusTranslationKey(launch.statusId)}`)} />
            </dl>
          </>
        )}

        {selectedTab === "payload" && (
          <div className="launch-payload-panel">
            <div className="launch-intelligence__heading">
              <span className="launch-card-icon"><Rocket24Regular aria-hidden /></span>
              <div><small>{t("fields.payload")}</small><strong>{launch.missionName ?? launch.name}</strong></div>
            </div>
            {launch.payloadNames.length > 0
              ? <ul>{launch.payloadNames.map((payload) => <li key={payload}>{payload}</li>)}</ul>
              : <p>{t("intelligence.notPublished")}</p>}
            {launch.programNames.length > 0 && <div className="launch-program-tags">{launch.programNames.map((program) => <span key={program}>{program}</span>)}</div>}
          </div>
        )}

        {selectedTab === "rocket" && (
          <div className="launch-rocket-panel">
            <div className="launch-intelligence__heading">
              <span className="launch-card-icon"><Rocket24Regular aria-hidden /></span>
              <div><small>{t("fields.rocket")}</small><strong>{launch.rocket?.fullName ?? launch.rocketName ?? t("common.unavailable")}</strong></div>
            </div>
            {launch.rocket ? (
              <dl className="launch-intelligence__facts">
                <Detail label={t("rocket.manufacturer")} value={launch.rocket.manufacturerName} />
                <Detail label={t("rocket.family")} value={launch.rocket.familyName} />
                <Detail label={t("rocket.launches")} value={numberValue(launch.rocket.totalLaunchCount, locale)} />
                <Detail label={t("rocket.successes")} value={numberValue(launch.rocket.successfulLaunches, locale)} />
                <Detail label={t("rocket.height")} value={unitValue(launch.rocket.lengthMeters, "m", locale)} />
                <Detail label={t("rocket.thrust")} value={unitValue(launch.rocket.thrustKilonewtons, "kN", locale)} />
              </dl>
            ) : <p className="launch-intelligence__empty">{t("rocket.unavailable")}</p>}
          </div>
        )}

        {selectedTab === "site" && (
          <div className="launch-site-panel">
            <div className="launch-intelligence__heading">
              <span className="launch-card-icon launch-card-icon--weather"><WeatherRain24Regular aria-hidden /></span>
              <div><small>{t("hero.weather")}</small><strong>{launch.padName ?? t("common.unavailable")}</strong></div>
              {weatherSource && <em>{weatherSource}</em>}
            </div>
            <dl className="launch-intelligence__facts launch-intelligence__facts--site">
              <Detail label={t("fields.location")} value={launch.locationName} />
              <Detail label={t("fields.country")} value={launch.countryName ?? launch.countryCode} />
            </dl>
            {forecast ? (
              <div className="launch-weather-overview">
                <div className="launch-weather-condition">
                  <strong>{formatTemperature(forecast.temperatureCelsius, locale, units)}</strong>
                  <span>{t(`weather.condition.${weatherCondition(forecast.weatherCode)}`)}</span>
                  <small>{t("weather.validAt", { time: formatForecastTime(forecast.time, locale) })}</small>
                </div>
                <dl>
                  <WeatherMetric label={t("fields.wind")} value={formatSpeed(forecast.windSpeedKmh, locale, units)} />
                  <WeatherMetric label={t("fields.gusts")} value={formatSpeed(forecast.windGustKmh, locale, units)} />
                  <WeatherMetric label={t("fields.humidity")} value={formatPercent(forecast.humidity, locale)} />
                  <WeatherMetric label={t("fields.precipitation")} value={formatPercent(forecast.precipitationProbability, locale)} />
                </dl>
              </div>
            ) : (
              <p className="launch-weather-message">
                {completed
                  ? t("weather.historicalUnavailable")
                  : weatherLoading
                    ? t("weather.loading")
                    : daysUntilLaunch > 16
                      ? t("weather.availableIn", { days: daysUntilLaunch - 16 })
                      : weatherError
                        ? t("weather.providerUnavailable")
                        : t("weather.unavailable")}
              </p>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function LaunchTimeSummary({ launch, locale, timeDisplay }: { launch: LaunchRecord; locale: string; timeDisplay: "utc-local" | "utc-only" | "local-only" }) {
  const { t } = useTranslation("launches");
  const timestamp = formatDateTime(launch.net, locale, timeDisplay);
  const window = formatLaunchWindow(launch, locale);
  return (
    <div className="launch-time-summary">
      <span><small>{t("fields.net")}</small><strong>{timestamp.primary}</strong>{timestamp.local && timestamp.local !== timestamp.primary && <em>{timestamp.local}</em>}</span>
      <span><small>{t("fields.window")}</small><strong>{window ?? t("common.unavailable")}</strong></span>
      <span><small>{t("fields.pad")}</small><strong>{launch.padName ?? t("common.unavailable")}</strong></span>
    </div>
  );
}

function LaunchState({ kind }: { kind: "loading" | "error" }) {
  const { t } = useTranslation("launches");
  return (
    <section className="launch-state">
      <span className="launch-state__orbit"><Rocket24Regular aria-hidden /></span>
      <p className="eyebrow">{t(kind === "loading" ? "eyebrow" : "error.title")}</p>
      <h1>{t(`${kind}.title`)}</h1>
      <p>{t(`${kind}.description`)}</p>
    </section>
  );
}

function LaunchQueueEmpty({ tab }: { tab: LaunchQueueTab }) {
  const { t } = useTranslation("launches");
  return <article className="launch-queue-empty glass-surface"><Rocket24Regular aria-hidden /><h2>{t(`timeline.emptyTitle.${tab}`)}</h2><p>{t(`timeline.empty.${tab}`)}</p></article>;
}

function LaunchHeroImage({ launch }: { launch: LaunchRecord }) {
  const { t } = useTranslation("launches");
  const image = launch.image?.url ?? launch.image?.thumbnailUrl;
  return (
    <div className="launch-hero__visual">
      <RemoteMediaImage alt={launch.name} fallback={<Rocket24Regular aria-hidden />} provider="launchLibrary" url={image} />
      <div aria-hidden className="launch-hero__scrim" />
      {launch.image?.credit && <small>{t("hero.imageCredit", { credit: launch.image.credit })}</small>}
    </div>
  );
}

function Countdown({ launch, now }: { launch: LaunchRecord; now: number }) {
  const { t } = useTranslation("launches");
  const countdown = calculateLaunchCountdown(launch.net, launch.statusId, now);
  const phaseLabel = countdown.phase === "counting"
    ? "T−"
    : countdown.phase === "elapsed" || countdown.phase === "in-flight"
      ? "T+"
      : countdown.phase === "hold"
        ? t("status.hold")
        : countdown.phase === "awaiting"
          ? t("countdown.awaitingUpdate")
          : t("common.unavailable");
  return (
    <div className="launch-countdown" aria-live="off" data-phase={countdown.phase}>
      <b className="launch-countdown__phase">{phaseLabel}</b>
      {[
        [countdown.days, t("countdown.days")],
        [countdown.hours, t("countdown.hours")],
        [countdown.minutes, t("countdown.minutes")],
        [countdown.seconds, t("countdown.seconds")],
      ].map(([value, label]) => <span key={String(label)}><strong>{String(value).padStart(2, "0")}</strong><small>{label}</small></span>)}
    </div>
  );
}

function StatusBadge({ launch }: { launch: LaunchRecord }) {
  const { t } = useTranslation("launches");
  const tone = launchStatusTone(launch.statusId);
  return <span className="launch-status-badge" data-status={tone}><i />{t(`status.${launchStatusTranslationKey(launch.statusId)}`)}</span>;
}

function Detail({ label, value }: { label: string; value: string | null }) {
  const { t } = useTranslation("launches");
  return <div><dt>{label}</dt><dd>{value ?? t("common.unavailable")}</dd></div>;
}

function WeatherMetric({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function heroLabelKey(
  launch: LaunchRecord,
  tab: LaunchQueueTab,
  queue: readonly LaunchRecord[],
  now: number,
): "active" | "completed" | "next" | "selected" {
  if (tab === "active") return "active";
  if (tab === "completed") return "completed";
  return selectNextLaunch(queue, now)?.id === launch.id ? "next" : "selected";
}

function handleTimelineKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>): void {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
  const list = event.currentTarget.closest(".launch-timeline__list");
  const items = Array.from(list?.querySelectorAll<HTMLButtonElement>(".launch-timeline-item") ?? []);
  if (items.length === 0) return;
  event.preventDefault();
  const currentIndex = Math.max(0, items.indexOf(event.currentTarget));
  const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowDown" ? Math.min(items.length - 1, currentIndex + 1) : Math.max(0, currentIndex - 1);
  items[nextIndex]?.focus();
}

function weatherCondition(code: number | null): "clear" | "cloudy" | "fog" | "rain" | "snow" | "storm" | "unknown" {
  if (code === null) return "unknown";
  if (code <= 1) return "clear";
  if (code <= 3) return "cloudy";
  if (code <= 48) return "fog";
  if (code <= 67 || (code >= 80 && code <= 82)) return "rain";
  if (code <= 77 || (code >= 85 && code <= 86)) return "snow";
  if (code >= 95) return "storm";
  return "unknown";
}

function formatTimelineDate(iso: string, locale: string, todayLabel: string, tomorrowLabel: string): string {
  const launch = new Date(iso);
  const current = new Date();
  const launchDay = Date.UTC(launch.getUTCFullYear(), launch.getUTCMonth(), launch.getUTCDate());
  const today = Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate());
  const difference = Math.round((launchDay - today) / 86_400_000);
  const day = difference === 0 ? todayLabel : difference === 1 ? tomorrowLabel : new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", timeZone: "UTC", year: launch.getUTCFullYear() === current.getUTCFullYear() ? undefined : "numeric" }).format(launch);
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", hour12: false, minute: "2-digit", timeZone: "UTC" }).format(launch);
  return `${day} · ${time} UTC`;
}

function formatGroupDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "long", timeZone: "UTC", weekday: "short", year: "numeric" }).format(new Date(iso));
}

function formatForecastTime(time: string, locale: string): string {
  const value = time.endsWith("Z") ? time : `${time}Z`;
  return formatDateTime(value, locale, "utc-only").primary;
}

function formatLaunchWindow(launch: LaunchRecord, locale: string): string | null {
  if (!launch.windowStart && !launch.windowEnd) return null;
  const start = launch.windowStart ? formatDateTime(launch.windowStart, locale, "utc-only").primary : null;
  const end = launch.windowEnd ? formatDateTime(launch.windowEnd, locale, "utc-only").primary : null;
  if (start && end && start !== end) {
    const endDate = new Date(launch.windowEnd!);
    if (utcDateKey(launch.windowStart!) === utcDateKey(launch.windowEnd!)) {
      const endTime = new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        hour12: false,
        minute: "2-digit",
        timeZone: "UTC",
      }).format(endDate);
      return `${start} – ${endTime} UTC`;
    }
    return `${start} – ${end}`;
  }
  return start ?? end;
}

function utcDateKey(iso: string): string {
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : iso;
}

function formatTemperature(value: number | null, locale: string, units: "metric" | "imperial"): string {
  return value === null ? "—" : formatTemperatureUnit(value, units, locale);
}

function formatSpeed(value: number | null, locale: string, units: "metric" | "imperial"): string {
  return value === null ? "—" : formatSurfaceSpeed(value, units, locale);
}

function formatPercent(value: number | null, locale: string): string {
  return value === null ? "—" : `${formatNumber(value, locale, { maximumFractionDigits: 0 })}%`;
}

function numberValue(value: number | null, locale: string): string | null {
  return value === null ? null : formatNumber(value, locale, { maximumFractionDigits: 0 });
}

function unitValue(value: number | null, unit: string, locale: string): string | null {
  return value === null ? null : `${formatNumber(value, locale, { maximumFractionDigits: 1 })} ${unit}`;
}

async function openExternal(url: string): Promise<void> {
  await openExternalUrl(url).catch(() => undefined);
}
