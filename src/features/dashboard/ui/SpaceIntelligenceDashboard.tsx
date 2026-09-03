import {
  ArrowRight20Regular,
  CloudArrowDown24Regular,
  Globe24Regular,
  News24Regular,
  Rocket24Regular,
  Server24Regular,
  ShieldTask24Regular,
  WeatherMoon24Regular,
} from "@fluentui/react-icons";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { calculateLaunchCountdown } from "@/features/launches/domain/countdown";
import { launchStatusIds } from "@/features/launches/domain/launch";
import { closestForecast } from "@/features/launches/domain/weather";
import { usePreferencesStore } from "@/features/settings/model/preferences";
import { currentScale, latestKp } from "@/features/space-weather/domain/spaceWeather";
import { formatSurfaceSpeed, formatTemperature } from "@/shared/formatting/units";
import { formatDateTime, formatNumber } from "@/shared/i18n/formatters";
import { RemoteMediaImage } from "@/shared/ui/RemoteMediaImage";

import { useDashboardComposition } from "../api/useDashboardComposition";
import {
  displayableNoaaText,
  recentOperationalAlerts,
  summarizeDashboardCatalog,
} from "../domain/dashboard";

interface SpaceIntelligenceDashboardProps {
  onOpenEarth: () => void;
  onOpenLaunch: (launchId: string) => void;
  onOpenLaunches: () => void;
  onOpenMissions: () => void;
  onOpenNasa: () => void;
  onOpenNews: () => void;
  onOpenNewsItem: (newsId: string) => void;
  onOpenSpaceWeather: () => void;
}

type EmptyStateKey = "noLaunch" | "noMission" | "noNews" | "unavailable";

export function SpaceIntelligenceDashboard(props: SpaceIntelligenceDashboardProps) {
  const { i18n, t } = useTranslation(["dashboard", "launches", "spaceWeather"]);
  const data = useDashboardComposition();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const locale = i18n.resolvedLanguage ?? "en";
  const units = usePreferencesStore((state) => state.units);
  const nextLaunch = data.launchSelection.nextLaunch;
  const activeLaunch = data.launchSelection.activeLaunches[0] ?? null;
  const countdown = nextLaunch
    ? calculateLaunchCountdown(nextLaunch.net, nextLaunch.statusId, now)
    : null;
  const forecast = nextLaunch && data.weather.data
    ? closestForecast(data.weather.data, nextLaunch.net)
    : null;
  const catalogSummary = useMemo(
    () => summarizeDashboardCatalog(data.satellites.data),
    [data.satellites.data],
  );

  const noaa = data.noaa.data;
  const kp = latestKp(noaa);
  const geomagnetic = currentScale(noaa, "geomagneticStorm");
  const radio = currentScale(noaa, "radioBlackout");
  const solarRadiation = currentScale(noaa, "solarRadiation");
  const recentAlerts = recentOperationalAlerts(noaa, now);
  const weatherMessage = recentAlerts[0]?.headline
    ?? displayableNoaaText(geomagnetic?.text)
    ?? t("dashboard:states.noSpaceWeatherAlert");

  const relatedItems = data.relatedNews.data?.items ?? [];
  const latestItems = data.news.data?.items ?? [];
  const newsItems = relatedItems.length > 0 ? relatedItems : latestItems;
  const missionFocus = activeLaunch ?? nextLaunch;

  const weatherTemperature = forecast?.temperatureCelsius === null || forecast?.temperatureCelsius === undefined
    ? t("dashboard:states.unknown")
    : formatTemperature(forecast.temperatureCelsius, units, locale, 1);
  const weatherWind = forecast?.windSpeedKmh === null || forecast?.windSpeedKmh === undefined
    ? t("dashboard:states.unknown")
    : formatSurfaceSpeed(forecast.windSpeedKmh, units, locale);

  const moduleStateMessage = (emptyKey: EmptyStateKey): string => {
    if (emptyKey === "noLaunch") return t("dashboard:states.noLaunch");
    if (emptyKey === "noMission") return t("dashboard:states.noMission");
    if (emptyKey === "noNews") return t("dashboard:states.noNews");
    return t("dashboard:states.unknown");
  };

  return (
    <section className="command-dashboard">
      <header className="command-dashboard__header">
        <div>
          <p className="eyebrow">{t("dashboard:eyebrow")}</p>
          <h1>{t("dashboard:title")}</h1>
          <p>{t("dashboard:subtitle")}</p>
        </div>
        <div className="command-dashboard__actions">
          <button className="secondary-button" onClick={props.onOpenNasa} type="button">
            {t("dashboard:actions.nasa")}
          </button>
          <button className="primary-button" onClick={props.onOpenEarth} type="button">
            <Globe24Regular aria-hidden />
            <span>{t("dashboard:actions.earth")}</span>
          </button>
        </div>
      </header>

      <div className="command-dashboard__grid">
        <article className="command-module command-module--launch" data-has-media={Boolean(nextLaunch?.image)}>
          {nextLaunch?.image && (
            <div aria-hidden className="command-launch__media">
              <RemoteMediaImage
                alt=""
                fallback={<span><Rocket24Regular aria-hidden /></span>}
                provider="launchLibrary"
                url={nextLaunch.image.url ?? nextLaunch.image.thumbnailUrl}
              />
              <i />
              {nextLaunch.image.credit && <small>{nextLaunch.image.credit}</small>}
            </div>
          )}
          <ModuleHeader
            icon={Rocket24Regular}
            label={t("dashboard:modules.nextLaunch")}
            source={t("dashboard:providers.launchLibrary")}
          />
          {nextLaunch ? (
            <>
              <div className="command-module__hero-copy">
                <span>{t(`launches:status.${launchStatusKey(nextLaunch.statusId)}`)}</span>
                <h2>{nextLaunch.name}</h2>
                <p>{nextLaunch.missionName ?? nextLaunch.rocketName ?? t("dashboard:states.unknown")}</p>
              </div>
              {countdown && (
                <div className="command-countdown" data-phase={countdown.phase}>
                  <header>
                    <small>{t("dashboard:labels.countdown")}</small>
                    <span>{t(`dashboard:countdown.${countdown.phase}`)}</span>
                  </header>
                  <div className="command-countdown__prefix">
                    {countdown.phase === "in-flight" || countdown.phase === "elapsed" || countdown.phase === "awaiting" ? "T+" : "T−"}
                  </div>
                  <div className="command-countdown__cells">
                    <CountdownCell label={t("dashboard:countdown.days")} value={countdown.days} />
                    <CountdownCell label={t("dashboard:countdown.hours")} value={countdown.hours} />
                    <CountdownCell label={t("dashboard:countdown.minutes")} value={countdown.minutes} />
                    <CountdownCell label={t("dashboard:countdown.seconds")} value={countdown.seconds} />
                  </div>
                </div>
              )}
              <dl className="command-module__facts">
                <div><dt>{t("launches:fields.pad")}</dt><dd>{nextLaunch.padName ?? t("dashboard:states.unknown")}</dd></div>
                <div><dt>{t("launches:fields.agency")}</dt><dd>{nextLaunch.agencyName ?? t("dashboard:states.unknown")}</dd></div>
                <div><dt>{t("dashboard:labels.launchTime")}</dt><dd>{operationalDate(nextLaunch.net, locale)}</dd></div>
              </dl>
              {forecast && (
                <div className="inline-provenance command-launch__weather">
                  <CloudArrowDown24Regular aria-hidden />
                  <span>{t("dashboard:labels.weatherMetric", { temperature: weatherTemperature, wind: weatherWind })}</span>
                  <small>{t("dashboard:providers.openMeteo")}</small>
                </div>
              )}
              <div className="command-module__footer">
                <button className="module-link" onClick={() => props.onOpenLaunch(nextLaunch.id)} type="button">
                  {t("dashboard:actions.view")}<ArrowRight20Regular aria-hidden />
                </button>
                <button className="text-button" onClick={props.onOpenLaunches} type="button">
                  {t("dashboard:actions.launches")}
                </button>
              </div>
            </>
          ) : (
            <ModuleEmpty text={moduleStateMessage("noLaunch")} />
          )}
        </article>

        <article className="command-module command-module--mission">
          <ModuleHeader
            icon={ShieldTask24Regular}
            label={t("dashboard:modules.mission")}
            source={t("dashboard:providers.launchLibrary")}
          />
          <div className="metric-pair">
            <div><small>{t("dashboard:labels.active")}</small><strong>{data.launches.data ? formatNumber(data.launchSelection.activeLaunches.length, locale) : "—"}</strong></div>
            <div><small>{t("dashboard:labels.upcomingLoaded")}</small><strong>{data.launches.data ? formatNumber(data.launchSelection.upcomingLaunches.length, locale) : "—"}</strong></div>
          </div>
          {missionFocus ? (
            <div className="mission-focus">
              <small>{activeLaunch ? t("dashboard:labels.activeMission") : t("dashboard:labels.nextMission")}</small>
              <strong>{missionFocus.missionName ?? missionFocus.name}</strong>
              <span>{missionFocus.rocketName ?? missionFocus.agencyName ?? t("dashboard:states.unknown")}</span>
              {!activeLaunch && <time>{operationalDate(missionFocus.net, locale)}</time>}
            </div>
          ) : (
            <ModuleEmpty text={moduleStateMessage("noMission")} />
          )}
          <button className="module-link" onClick={props.onOpenMissions} type="button">
            {t("dashboard:actions.missions")}<ArrowRight20Regular aria-hidden />
          </button>
        </article>

        <article className="command-module command-module--weather">
          <ModuleHeader
            icon={WeatherMoon24Regular}
            label={t("dashboard:modules.spaceWeather")}
            source={t("dashboard:providers.noaaSwpc")}
          />
          {noaa && noaa.status !== "unavailable" ? (
            <>
              <div className="space-weather-scales">
                <ScaleCell label={t("dashboard:labels.geomagnetic")} prefix="G" value={geomagnetic?.level} />
                <ScaleCell label={t("dashboard:labels.radioBlackout")} prefix="R" value={radio?.level} />
                <ScaleCell label={t("dashboard:labels.solarRadiation")} prefix="S" value={solarRadiation?.level} />
              </div>
              <div className="space-weather-observations">
                <span><small>{t("dashboard:labels.kp")}</small><strong>{kp ? formatNumber(kp.kp, locale, { maximumFractionDigits: 2 }) : "—"}</strong></span>
                <span><small>{t("dashboard:labels.solarWind")}</small><strong>{noaa.solarWind ? `${formatNumber(noaa.solarWind.speedKilometersPerSecond, locale, { maximumFractionDigits: 0 })} km/s` : "—"}</strong></span>
                <span><small>{t("dashboard:labels.recentAlerts")}</small><strong>{formatNumber(recentAlerts.length, locale)}</strong></span>
              </div>
              <p className="command-module__body">{weatherMessage}</p>
              {kp && <time>{t("dashboard:labels.observed", { time: operationalDate(kp.observedAtUnixMs, locale) })}</time>}
            </>
          ) : (
            <ModuleEmpty text={moduleStateMessage("unavailable")} />
          )}
          <button className="module-link" onClick={props.onOpenSpaceWeather} type="button">
            {t("dashboard:actions.weather")}<ArrowRight20Regular aria-hidden />
          </button>
        </article>

        <article className="command-module command-module--satellites">
          <ModuleHeader
            icon={Globe24Regular}
            label={t("dashboard:modules.satellites")}
            source={t("dashboard:providers.celestrak")}
          />
          {catalogSummary ? (
            <>
              <div className="command-module__big-number">{formatNumber(catalogSummary.propagatableCount, locale)}</div>
              <p>{t("dashboard:labels.propagatableObjects")}</p>
              <div className="catalog-metrics">
                <Metric label={t("dashboard:labels.catalogTotal")} value={formatNumber(catalogSummary.catalogCount, locale)} />
                <Metric label={t("dashboard:labels.payloads")} value={formatNumber(catalogSummary.payloadCount, locale)} />
                <Metric label={t("dashboard:labels.debris")}
                  value={formatNumber(catalogSummary.debrisCount + catalogSummary.rocketBodyCount, locale)} />
              </div>
              <time>{t("dashboard:labels.updatedAt", { time: operationalDate(data.satellites.data!.fetchedAt, locale) })}</time>
            </>
          ) : (
            <ModuleEmpty text={moduleStateMessage("unavailable")} />
          )}
          <button className="module-link" onClick={props.onOpenEarth} type="button">
            {t("dashboard:actions.earth")}<ArrowRight20Regular aria-hidden />
          </button>
        </article>

        <article className="command-module command-module--news">
          <ModuleHeader
            icon={News24Regular}
            label={t("dashboard:modules.news")}
            source={t("dashboard:providers.spaceflightNews")}
          />
          {newsItems.length > 0 ? (
            <>
              <p className="relation-label">{t(relatedItems.length > 0 ? "dashboard:labels.related" : "dashboard:labels.latestNews")}</p>
              <NewsRows items={newsItems.slice(0, 3)} locale={locale} onSelect={props.onOpenNewsItem} />
            </>
          ) : (
            <ModuleEmpty text={moduleStateMessage("noNews")} />
          )}
          <button className="module-link" onClick={props.onOpenNews} type="button">
            {t("dashboard:actions.news")}<ArrowRight20Regular aria-hidden />
          </button>
        </article>
      </div>
    </section>
  );
}

function ModuleHeader({
  icon: Icon,
  label,
  source,
}: {
  icon: typeof Rocket24Regular;
  label: string;
  source: string;
}) {
  return (
    <header className="command-module__header">
      <span className="command-module__icon"><Icon aria-hidden /></span>
      <div><h2>{label}</h2><small>{source}</small></div>
    </header>
  );
}

function CountdownCell({ label, value }: { label: string; value: number }) {
  return <span><strong>{pad(value)}</strong><small>{label}</small></span>;
}

function ScaleCell({ label, prefix, value }: { label: string; prefix: string; value: number | null | undefined }) {
  return <span><strong>{`${prefix}${value ?? "—"}`}</strong><small>{label}</small></span>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <span><small>{label}</small><strong>{value}</strong></span>;
}

function NewsRows({
  items,
  locale,
  onSelect,
}: {
  items: { id: string; publishedAtUnixMs: number; source: string; title: string }[];
  locale: string;
  onSelect: (newsId: string) => void;
}) {
  return (
    <div className="dashboard-news-rows">
      {items.map((item) => (
        <button key={item.id} onClick={() => onSelect(item.id)} type="button">
          <div><strong>{item.title}</strong><span>{item.source}</span></div>
          <time>{formatDateTime(item.publishedAtUnixMs, locale, "utc-only", { day: "2-digit", month: "short" }).primary}</time>
        </button>
      ))}
    </div>
  );
}

function ModuleEmpty({ text }: { text: string }) {
  return <div className="command-module__empty"><Server24Regular aria-hidden /><span>{text}</span></div>;
}

function launchStatusKey(statusId: number | null): "go" | "hold" | "other" | "success" | "tbd" {
  if (statusId === launchStatusIds.go || statusId === launchStatusIds.inFlight) return "go";
  if (statusId === launchStatusIds.tbd || statusId === launchStatusIds.tbc) return "tbd";
  if (statusId === launchStatusIds.hold || statusId === launchStatusIds.failure || statusId === launchStatusIds.partialFailure) return "hold";
  if (statusId === launchStatusIds.success || statusId === launchStatusIds.deployed) return "success";
  return "other";
}

function operationalDate(value: string | number, locale: string): string {
  return formatDateTime(value, locale, "utc-only", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "long",
    year: "numeric",
  }).primary;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
