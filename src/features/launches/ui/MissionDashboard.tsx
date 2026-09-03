import {
  CalendarClock24Regular,
  Globe24Regular,
  Location24Regular,
  Open24Regular,
  Rocket24Regular,
  Search20Regular,
  Video24Regular,
} from "@fluentui/react-icons";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { FavoriteButton } from "@/features/awareness/ui/FavoriteButton";
import { useActiveSatelliteCatalog } from "@/features/satellites/api/useActiveSatelliteCatalog";
import { usePreferencesStore } from "@/features/settings/model/preferences";
import { formatDateTime, formatNumber } from "@/shared/i18n/formatters";
import { openExternalUrl } from "@/shared/security/externalUrl";

import { useCompletedLaunches } from "../api/useLaunchOperations";
import { useSpaceIntelligence } from "../api/useSpaceIntelligence";
import { calculateLaunchCountdown } from "../domain/countdown";
import {
  classifyLaunchStatus,
  type LaunchRecord,
  type SpaceEventRecord,
} from "../domain/launch";
import {
  createLaunchQueues,
  filterLaunchTimeline,
  launchStatusTone,
  launchStatusTranslationKey,
} from "../domain/launchPresentation";
import {
  matchMissionSatellites,
  type MissionSatelliteMatch,
} from "../domain/missionSatelliteMatcher";
import { useMissionSelectionStore } from "../model/missionSelection";
import { MissionDetailWorkspace } from "./MissionDetailWorkspace";

type MissionTab = "upcoming" | "active" | "completed" | "events";
type MissionRange = "sevenDays" | "thirtyDays" | "all";

interface MissionDashboardProps {
  onOpenLaunch?: (launchId: string) => void;
  onShowLaunchSite?: (launchId: string) => void;
  onTrackSatellite?: (satelliteId: string) => void;
}

export function MissionDashboard({
  onOpenLaunch,
  onShowLaunchSite,
  onTrackSatellite,
}: MissionDashboardProps) {
  const { i18n, t } = useTranslation(["launches", "missions"]);
  const [tab, setTab] = useState<MissionTab>("upcoming");
  const [range, setRange] = useState<MissionRange>("thirtyDays");
  const [search, setSearch] = useState("");
  const [selectedLaunchId, setSelectedLaunchId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [detailLaunch, setDetailLaunch] = useState<LaunchRecord | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const requestedEventId = useMissionSelectionStore((state) => state.requestedEventId);
  const requestedLaunchId = useMissionSelectionStore((state) => state.requestedLaunchId);
  const clearRequestedEvent = useMissionSelectionStore((state) => state.clearRequestedEvent);
  const clearRequestedLaunch = useMissionSelectionStore((state) => state.clearRequestedLaunch);
  const upcomingQuery = useSpaceIntelligence();
  const completedQuery = useCompletedLaunches({
    enabled: tab === "completed" || Boolean(detailLaunch) || Boolean(requestedLaunchId),
    limit: 100,
  });
  const timeDisplay = usePreferencesStore((state) => state.timeDisplay);
  const locale = i18n.resolvedLanguage ?? "en";

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const queues = useMemo(
    () => createLaunchQueues(
      upcomingQuery.data?.launches ?? [],
      completedQuery.data?.launches ?? [],
    ),
    [completedQuery.data?.launches, upcomingQuery.data?.launches],
  );
  const currentQueue = useMemo(
    () => tab === "events" ? [] : queues[tab],
    [queues, tab],
  );
  const filteredQueue = useMemo(
    () => tab === "events"
      ? []
      : filterLaunchTimeline(currentQueue, {
          nowUnixMs: now,
          query: search,
          range,
          tab,
        }),
    [currentQueue, now, range, search, tab],
  );
  const filteredEvents = useMemo(
    () => filterMissionEvents(upcomingQuery.data?.events ?? [], search, range, now),
    [now, range, search, upcomingQuery.data?.events],
  );
  const selectedLaunch = tab === "events"
    ? null
    : filteredQueue.find((launch) => launch.id === selectedLaunchId)
      ?? filteredQueue[0]
      ?? null;
  const selectedEvent = tab === "events"
    ? filteredEvents.find((event) => event.id === selectedEventId)
      ?? filteredEvents[0]
      ?? null
    : null;
  const catalog = useActiveSatelliteCatalog({
    enabled: Boolean(selectedLaunch?.launchDesignator),
  });
  const satelliteMatches = useMemo(
    () => matchMissionSatellites(
      selectedLaunch?.launchDesignator ?? null,
      catalog.data?.satellites ?? [],
    ),
    [catalog.data?.satellites, selectedLaunch?.launchDesignator],
  );

  useEffect(() => {
    if (!requestedEventId) return;
    const timer = window.setTimeout(() => {
      setTab("events");
      setSelectedEventId(requestedEventId);
      clearRequestedEvent();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [clearRequestedEvent, requestedEventId]);

  useEffect(() => {
    if (!requestedLaunchId) return;
    const launch = [
      ...(upcomingQuery.data?.launches ?? []),
      ...(completedQuery.data?.launches ?? []),
    ].find((candidate) => candidate.id === requestedLaunchId);
    if (!launch) return;
    const timer = window.setTimeout(() => {
      const lifecycle = classifyLaunchStatus(launch.statusId);
      setTab(lifecycle === "active" || lifecycle === "completed" ? lifecycle : "upcoming");
      setSelectedLaunchId(launch.id);
      clearRequestedLaunch();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [clearRequestedLaunch, completedQuery.data?.launches, requestedLaunchId, upcomingQuery.data?.launches]);

  useEffect(() => {
    if (!detailLaunch) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      setDetailLaunch(null);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [detailLaunch]);

  if (upcomingQuery.isPending) return <MissionState loading />;
  if (upcomingQuery.isError || !upcomingQuery.data) return <MissionState />;

  if (detailLaunch) {
    return (
      <MissionDetailWorkspace
        fallbackLaunch={detailLaunch}
        onBack={() => setDetailLaunch(null)}
        onShowLaunchSite={(launchId) => onShowLaunchSite?.(launchId)}
        onTrackSatellite={(satelliteId) => onTrackSatellite?.(satelliteId)}
      />
    );
  }

  const total = tab === "completed"
    ? completedQuery.data?.providerCount ?? filteredQueue.length
    : tab === "events"
      ? upcomingQuery.data.eventCount
      : currentQueue.length;
  const loaded = tab === "events" ? filteredEvents.length : filteredQueue.length;
  return (
    <section className="mission-operations-page">
      <header className="mission-operations-header">
        <div>
          <p className="eyebrow">{t("missions:eyebrow")}</p>
          <h1>{t("missions:title")}</h1>
          <p>{t("missions:subtitle")}</p>
        </div>
      </header>

      <div className="mission-queue-tabs" role="tablist">
        {(["upcoming", "active", "completed", "events"] as const).map((item) => {
          const count = item === "events"
            ? upcomingQuery.data.events.length
            : item === "completed"
              ? completedQuery.data?.launches.length ?? queues.completed.length
              : queues[item].length;
          return (
            <button
              aria-selected={tab === item}
              data-active={tab === item}
              key={item}
              onClick={() => {
                setTab(item);
                setSelectedLaunchId(null);
                setSelectedEventId(null);
              }}
              role="tab"
              type="button"
            >
              <span>{t(`missions:tabs.${item}`)}</span>
              <strong>{formatNumber(count, locale)}</strong>
            </button>
          );
        })}
      </div>

      <div className="mission-workbench-tools">
        <label>
          <Search20Regular aria-hidden />
          <input
            aria-label={t("missions:filters.search")}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("missions:filters.search")}
            type="search"
            value={search}
          />
        </label>
        <div aria-label={t("missions:filters.rangeLabel")} role="group">
          {(["sevenDays", "thirtyDays", "all"] as const).map((item) => (
            <button
              aria-pressed={range === item}
              data-active={range === item}
              key={item}
              onClick={() => setRange(item)}
              type="button"
            >
              {t(`missions:filters.ranges.${item}`)}
            </button>
          ))}
        </div>
        <span>{t("missions:queue.showing", { count: loaded, total })}</span>
      </div>

      <div className="mission-queue-layout">
        <section className="mission-queue glass-surface">
          <header>
            <div>
              <small>{t(`missions:status.${tab === "events" ? "events" : tab}`)}</small>
              <h2>{tab === "events" ? t("missions:queue.eventsTitle") : t("missions:queue.title")}</h2>
            </div>
            <span>{t("missions:queue.loaded", { loaded, total })}</span>
          </header>

          {tab === "events" ? (
            <div className="mission-event-list">
              {filteredEvents.length === 0 && <EmptyQueue />}
              {filteredEvents.map((event, index) => (
                <motion.article
                  animate={{ opacity: 1, y: 0 }}
                  className="mission-event-row"
                  data-selected={selectedEvent?.id === event.id}
                  id={`mission-${event.id}`}
                  initial={{ opacity: 0, y: 5 }}
                  key={event.id}
                  transition={{ delay: Math.min(index * 0.02, 0.18) }}
                >
                  <button
                    aria-label={t("missions:queue.open", { name: event.name })}
                    className="mission-event-row__main"
                    onClick={() => setSelectedEventId(event.id)}
                    type="button"
                  >
                    <span className="mission-event-row__time">
                      <CalendarClock24Regular aria-hidden />
                      <time>{formatDateTime(event.date, locale, timeDisplay, { year: undefined }).primary}</time>
                    </span>
                    <span>
                      <small>{event.typeName ?? t("launches:missions.events")}</small>
                      <strong>{event.name}</strong>
                      <span>{event.location ?? t("launches:common.unavailable")}</span>
                    </span>
                  </button>
                  <div className="mission-event-row__actions">
                    <FavoriteButton favorite={{
                      id: event.id,
                      imageUrl: event.image?.thumbnailUrl ?? event.image?.url ?? null,
                      kind: "event",
                      occurredAt: event.date,
                      subtitle: event.typeName ?? event.location,
                      title: event.name,
                    }} />
                    {event.streamUrl && (
                      <button aria-label={t("launches:missions.watch")} className="icon-button" onClick={() => void openExternal(event.streamUrl!)} type="button"><Video24Regular aria-hidden /></button>
                    )}
                  </div>
                </motion.article>
              ))}
            </div>
          ) : (
            <div className="mission-launch-list">
              {filteredQueue.length === 0 && (
                tab === "completed" && completedQuery.isPending
                  ? <p className="mission-queue-loading">{t("launches:loading.description")}</p>
                  : <EmptyQueue />
              )}
              {filteredQueue.slice(0, 100).map((launch, index) => (
                <motion.button
                  animate={{ opacity: 1, x: 0 }}
                  aria-label={t("missions:queue.select", { name: launch.name })}
                  className="mission-launch-row"
                  data-selected={selectedLaunch?.id === launch.id}
                  initial={{ opacity: 0, x: -5 }}
                  key={launch.id}
                  onClick={() => setSelectedLaunchId(launch.id)}
                  transition={{ delay: Math.min(index * 0.012, 0.16) }}
                  type="button"
                >
                  <span className="mission-launch-row__index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="mission-launch-row__date">
                    <time>{formatMissionDay(launch.net, locale)}</time>
                    <small>{formatMissionTime(launch.net, locale)}</small>
                  </span>
                  <span className="mission-launch-row__identity">
                    <small>{launch.agencyName ?? launch.agencyAbbreviation ?? t("launches:common.unavailable")}</small>
                    <strong>{launch.missionName ?? launch.name}</strong>
                    <span>{launch.rocketName ?? t("launches:common.unavailable")} · {launch.orbitAbbreviation ?? launch.orbitName ?? t("launches:common.unavailable")}</span>
                  </span>
                  <span className="mission-launch-row__payload">
                    <small>{t("missions:queue.payload")}</small>
                    <strong>{launch.payloadNames.length > 0 ? formatNumber(launch.payloadNames.length, locale) : "—"}</strong>
                  </span>
                  <MissionStatusBadge launch={launch} />
                </motion.button>
              ))}
            </div>
          )}
        </section>

        {tab === "events" ? (
          <MissionEventInspector event={selectedEvent} locale={locale} timeDisplay={timeDisplay} />
        ) : (
          <MissionInspector
            catalogLoading={catalog.isPending && Boolean(selectedLaunch?.launchDesignator)}
            launch={selectedLaunch}
            locale={locale}
            matches={satelliteMatches}
            now={now}
            onOpenDetails={setDetailLaunch}
            onOpenLaunch={onOpenLaunch}
            onShowLaunchSite={onShowLaunchSite}
            onTrackSatellite={onTrackSatellite}
            timeDisplay={timeDisplay}
          />
        )}
      </div>
    </section>
  );
}

function MissionInspector({
  catalogLoading,
  launch,
  locale,
  matches,
  now,
  onOpenDetails,
  onOpenLaunch,
  onShowLaunchSite,
  onTrackSatellite,
  timeDisplay,
}: {
  catalogLoading: boolean;
  launch: LaunchRecord | null;
  locale: string;
  matches: MissionSatelliteMatch[];
  now: number;
  onOpenDetails: (launch: LaunchRecord) => void;
  onOpenLaunch: ((launchId: string) => void) | undefined;
  onShowLaunchSite: ((launchId: string) => void) | undefined;
  onTrackSatellite: ((satelliteId: string) => void) | undefined;
  timeDisplay: "utc-local" | "utc-only" | "local-only";
}) {
  const { t } = useTranslation(["launches", "missions", "satellites"]);
  if (!launch) {
    return (
      <aside className="mission-inspector mission-inspector--empty glass-surface">
        <Rocket24Regular aria-hidden />
        <h2>{t("missions:inspector.emptyTitle")}</h2>
        <p>{t("missions:inspector.emptyBody")}</p>
      </aside>
    );
  }
  const lifecycle = classifyLaunchStatus(launch.statusId);
  const date = formatDateTime(launch.net, locale, timeDisplay);
  const countdown = calculateLaunchCountdown(launch.net, launch.statusId, now);
  const primaryMatch = matches.find((match) => match.isPrimary) ?? matches[0] ?? null;

  return (
    <aside className="mission-inspector glass-surface">
      <header>
        <span className="mission-inspector__icon"><Rocket24Regular aria-hidden /></span>
        <div>
          <small>{t("missions:inspector.eyebrow")}</small>
          <strong>{launch.missionName ?? launch.name}</strong>
          <span>{launch.agencyName ?? t("launches:common.unavailable")}</span>
        </div>
        <MissionStatusBadge launch={launch} />
      </header>

      <section className="mission-inspector__time">
        <span>
          <small>{lifecycle === "completed" ? t("missions:inspector.outcome") : t("missions:inspector.nextMilestone")}</small>
          <strong>{formatCountdownLabel(
            countdown,
            t("launches:status.hold"),
            t("launches:countdown.awaitingUpdate"),
            t("launches:common.unavailable"),
          )}</strong>
        </span>
        <time>{date.primary}</time>
        {date.local && date.local !== date.primary && <em>{date.local}</em>}
      </section>

      <p className="mission-inspector__description">
        {launch.missionDescription ?? t("launches:missions.noDescription")}
        {launch.missionDescription && <small>{t("missions:inspector.providerContent")}</small>}
      </p>

      <dl className="mission-inspector__facts">
        <MissionFact label={t("launches:fields.rocket")} value={launch.rocketName} />
        <MissionFact label={t("launches:fields.orbit")} value={launch.orbitName ?? launch.orbitAbbreviation} />
        <MissionFact label={t("launches:fields.pad")} value={launch.padName} />
        <MissionFact label={t("launches:fields.designator")} value={launch.launchDesignator} />
      </dl>

      <section className="mission-inspector__payloads">
        <header>
          <span>{t("missions:detail.payloads")}</span>
          <strong>{formatNumber(launch.payloadNames.length, locale)}</strong>
        </header>
        {launch.payloadNames.length > 0
          ? <ul>{launch.payloadNames.slice(0, 4).map((payload) => <li key={payload}>{payload}</li>)}</ul>
          : <p>{t("missions:detail.notPublished")}</p>}
      </section>

      <section className="mission-inspector__tracking" data-available={matches.length > 0}>
        <header>
          <Globe24Regular aria-hidden />
          <div>
            <small>{matches.length > 0 ? t("missions:tracking.available") : t("missions:tracking.pending")}</small>
            <strong>{t("missions:tracking.title")}</strong>
          </div>
          {matches.length > 0 && <b>{formatNumber(matches.length, locale)}</b>}
        </header>
        {catalogLoading ? (
          <p>{t("missions:tracking.checking")}</p>
        ) : matches.length === 0 ? (
          <p>{launch.launchDesignator ? t("missions:tracking.pendingBody") : t("missions:tracking.noDesignator")}</p>
        ) : (
          <div className="mission-inspector__matches">
            {matches.slice(0, 3).map(({ satellite, isPrimary }) => (
              <button
                disabled={!onTrackSatellite}
                key={satellite.id}
                onClick={() => onTrackSatellite?.(satellite.id)}
                type="button"
              >
                <span><strong>{satellite.name}</strong><small>{t("satellites:details.norad", { id: satellite.noradId })}</small></span>
                <i>{isPrimary ? t("missions:tracking.primary") : satellite.objectType ?? satellite.category}</i>
              </button>
            ))}
          </div>
        )}
      </section>

      <footer>
        <button className="primary-button" onClick={() => onOpenDetails(launch)} type="button"><Open24Regular aria-hidden />{t("missions:actions.fullDetails")}</button>
        {onOpenLaunch && <button className="secondary-button" onClick={() => onOpenLaunch(launch.id)} type="button"><Rocket24Regular aria-hidden />{t("missions:actions.launchOperations")}</button>}
        {onShowLaunchSite && launch.latitude !== null && launch.longitude !== null && (
          <button className="secondary-button" onClick={() => onShowLaunchSite(launch.id)} type="button"><Location24Regular aria-hidden />{t("missions:detail.showEarth")}</button>
        )}
        {primaryMatch && onTrackSatellite && (
          <button className="secondary-button" onClick={() => onTrackSatellite(primaryMatch.satellite.id)} type="button"><Globe24Regular aria-hidden />{t("missions:tracking.trackEarth")}</button>
        )}
      </footer>
    </aside>
  );
}

function MissionEventInspector({
  event,
  locale,
  timeDisplay,
}: {
  event: SpaceEventRecord | null;
  locale: string;
  timeDisplay: "utc-local" | "utc-only" | "local-only";
}) {
  const { t } = useTranslation(["launches", "missions"]);
  if (!event) {
    return (
      <aside className="mission-inspector mission-inspector--empty glass-surface">
        <CalendarClock24Regular aria-hidden />
        <h2>{t("missions:events.emptyTitle")}</h2>
        <p>{t("missions:events.emptyBody")}</p>
      </aside>
    );
  }
  const date = formatDateTime(event.date, locale, timeDisplay);
  return (
    <aside className="mission-inspector mission-event-inspector glass-surface">
      <header>
        <span className="mission-inspector__icon"><CalendarClock24Regular aria-hidden /></span>
        <div><small>{event.typeName ?? t("launches:missions.events")}</small><strong>{event.name}</strong></div>
      </header>
      <section className="mission-inspector__time"><time>{date.primary}</time>{date.local && date.local !== date.primary && <em>{date.local}</em>}</section>
      <p className="mission-inspector__description">{event.description ?? t("launches:missions.noDescription")}</p>
      <dl className="mission-inspector__facts">
        <MissionFact label={t("launches:fields.location")} value={event.location} />
        <MissionFact label={t("launches:fields.status")} value={event.typeName} />
      </dl>
      <footer>
        {event.streamUrl && <button className="primary-button" onClick={() => void openExternal(event.streamUrl!)} type="button"><Video24Regular aria-hidden />{t("launches:missions.watch")}</button>}
        {event.infoUrl && <button className="secondary-button" onClick={() => void openExternal(event.infoUrl!)} type="button"><Open24Regular aria-hidden />{t("launches:missions.openInfo")}</button>}
      </footer>
    </aside>
  );
}

function MissionStatusBadge({ launch }: { launch: LaunchRecord }) {
  const { t } = useTranslation("launches");
  return (
    <span className="mission-status-badge" data-status={launchStatusTone(launch.statusId)}>
      <i />
      {t(`status.${launchStatusTranslationKey(launch.statusId)}`)}
    </span>
  );
}

function MissionFact({ label, value }: { label: string; value: string | null }) {
  const { t } = useTranslation("missions");
  return <div><dt>{label}</dt><dd>{value ?? t("detail.notPublished")}</dd></div>;
}

function EmptyQueue() {
  const { t } = useTranslation("missions");
  return <div className="mission-queue-empty"><CalendarClock24Regular aria-hidden /><p>{t("queue.empty")}</p></div>;
}

function MissionState({ loading = false }: { loading?: boolean }) {
  const { t } = useTranslation(["common", "launches"]);
  return (
    <section className="launch-state">
      <span className="launch-state__orbit"><CalendarClock24Regular aria-hidden /></span>
      <h1>{t(loading ? "launches:loading.title" : "launches:error.title")}</h1>
      <p>{t(loading ? "launches:loading.description" : "launches:error.description")}</p>
    </section>
  );
}

function filterMissionEvents(
  events: readonly SpaceEventRecord[],
  search: string,
  range: MissionRange,
  now: number,
): SpaceEventRecord[] {
  const query = search.trim().toLocaleLowerCase();
  const rangeMs = range === "sevenDays" ? 7 * 86_400_000 : range === "thirtyDays" ? 30 * 86_400_000 : Infinity;
  return events.filter((event) => {
    const distance = Date.parse(event.date) - now;
    if (range !== "all" && distance > rangeMs) return false;
    if (!query) return true;
    return [event.name, event.typeName, event.location, event.description]
      .some((value) => value?.toLocaleLowerCase().includes(query));
  });
}

function formatMissionDay(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(iso));
}

function formatMissionTime(iso: string, locale: string): string {
  const value = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(iso));
  return `${value} UTC`;
}

function formatCountdownLabel(
  countdown: ReturnType<typeof calculateLaunchCountdown>,
  holdLabel: string,
  awaitingLabel: string,
  unavailableLabel: string,
): string {
  if (countdown.phase === "hold") return holdLabel;
  if (countdown.phase === "awaiting") return awaitingLabel;
  if (countdown.phase === "invalid") return unavailableLabel;
  const prefix = countdown.phase === "counting" ? "T−" : "T+";
  return `${prefix} ${String(countdown.days).padStart(2, "0")}:${String(countdown.hours).padStart(2, "0")}:${String(countdown.minutes).padStart(2, "0")}`;
}

async function openExternal(url: string): Promise<void> {
  await openExternalUrl(url).catch(() => undefined);
}
