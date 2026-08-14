import { Dismiss20Regular, Location20Regular, Rocket24Regular } from "@fluentui/react-icons";
import { openExternalUrl } from "@/shared/security/externalUrl";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useLaunchWeather } from "../api/useLaunchWeather";
import { useRocketConfiguration } from "../api/useRocketConfiguration";
import { ObjectInspector } from "@/features/earth-engine/ui/ObjectInspector";
import { usePreferencesStore } from "@/features/settings/model/preferences";
import type { LaunchRecord } from "../domain/launch";
import type { LaunchSiteRecord } from "../domain/launchSite";
import { closestForecast } from "../domain/weather";
import { formatCompactDate, formatDateTime as formatLocalizedDateTime, formatNumber } from "@/shared/i18n/formatters";
import {
  formatDistanceFromKm,
  formatForceFromKilonewtons,
  formatLengthFromMeters,
  formatMassFromKilograms,
  formatMassFromTonnes,
  formatSurfaceSpeed,
  formatTemperature,
} from "@/shared/formatting/units";

interface LaunchGlobePanelProps {
  fetchedAt: string | null;
  launch: LaunchRecord;
  nowIso: string;
  onClose: () => void;
  onFocus: () => void;
  onSelectLaunch: (id: string) => void;
  site: LaunchSiteRecord;
  source: string | null;
  stale: boolean;
}

export function LaunchGlobePanel({
  fetchedAt,
  launch,
  nowIso,
  onClose,
  onFocus,
  onSelectLaunch,
  site,
  source,
  stale,
}: LaunchGlobePanelProps) {
  const { i18n, t } = useTranslation("launches");
  const [expanded, setExpanded] = useState(false);
  const units = usePreferencesStore((state) => state.units);
  const locale = i18n.resolvedLanguage ?? "en";
  const remaining = Math.max(0, Date.parse(launch.net) - Date.parse(nowIso));
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining / 3_600_000) % 24);
  const minutes = Math.floor((remaining / 60_000) % 60);
  const weatherQuery = useLaunchWeather(site.latitude, site.longitude);
  const rocketQuery = useRocketConfiguration(launch.rocket?.id ?? null, expanded);
  const rocket = rocketQuery.data?.rocket ?? launch.rocket;
  const forecast = weatherQuery.data
    ? closestForecast(weatherQuery.data, launch.net)
    : null;
  const weatherPoint = forecast ?? weatherQuery.data?.current ?? null;

  return (
    <ObjectInspector
      className="launch-globe-info glass-surface"
    >
      <header>
        <span><Rocket24Regular aria-hidden /></span>
        <div>
          <small>{t("globe.siteEyebrow")}</small>
          <strong>{site.name}</strong>
        </div>
        <button aria-label={t("globe.close")} onClick={onClose} type="button">
          <Dismiss20Regular aria-hidden />
        </button>
      </header>

      <p className="launch-site-location">
        <Location20Regular aria-hidden />
        {[
          site.countryName,
          site.locationName,
          `${site.latitude.toFixed(3)}°, ${site.longitude.toFixed(3)}°`,
        ].filter(Boolean).join(" · ")}
      </p>

      <div className="object-inspector-actions object-inspector-actions--launch">
        <button onClick={onFocus} type="button">{t("globe.focus")}</button>
        <button onClick={() => setExpanded((value) => !value)} type="button">
          {t(expanded ? "globe.less" : "globe.openDetails")}
        </button>
        {launch.streamUrl && (
          <button onClick={() => void openExternal(launch.streamUrl!)} type="button">
            {t("hero.watch")}
          </button>
        )}
      </div>

      <section className="launch-globe-info__mission">
        <div className="launch-globe-info__status">
          <span>{launch.statusAbbreviation ?? launch.statusName ?? t("common.unavailable")}</span>
          <small>{launch.agencyName ?? t("common.unavailable")}</small>
        </div>
        <h2>{launch.name}</h2>
        <div className="launch-globe-info__countdown">
          <strong>{String(days).padStart(2, "0")}</strong><span>{t("countdown.days")}</span>
          <strong>{String(hours).padStart(2, "0")}</strong><span>{t("countdown.hours")}</span>
          <strong>{String(minutes).padStart(2, "0")}</strong><span>{t("countdown.minutes")}</span>
        </div>
        <time>{formatDateTime(launch.net, locale)}</time>
      </section>

      <dl className="launch-globe-info__facts">
        <Detail label={t("fields.rocket")} value={launch.rocketName} />
        <Detail label={t("fields.orbit")} value={launch.orbitName ?? launch.orbitAbbreviation} />
        <Detail label={t("fields.pad")} value={launch.padName} />
        <Detail label={t("fields.mission")} value={launch.missionName ?? launch.missionType} />
      </dl>

      {launch.missionDescription && (
        <p className="launch-globe-info__description">{launch.missionDescription}</p>
      )}

      <section className="launch-site-upcoming">
        <header>
          <strong>{t("globe.upcomingAtSite")}</strong>
          <span>{site.launches.length}</span>
        </header>
        {site.launches.slice(0, 4).map((candidate) => (
          <button
            data-active={candidate.id === launch.id}
            key={candidate.id}
            onClick={() => onSelectLaunch(candidate.id)}
            type="button"
          >
            <span>{candidate.name}</span>
            <time>{formatShortDate(candidate.net, locale)}</time>
          </button>
        ))}
      </section>

      <section className="launch-site-weather">
        <header>
          <strong>{t("hero.weather")}</strong>
          <small>{weatherQuery.data?.source ?? t("weather.loading")}</small>
        </header>
        {weatherPoint ? (
          <dl>
            <Detail label={t("fields.temperature")} value={weatherPoint.temperatureCelsius === null ? null : formatTemperature(weatherPoint.temperatureCelsius, units, locale, 1)} />
            <Detail label={t("fields.wind")} value={weatherPoint.windSpeedKmh === null ? null : formatSurfaceSpeed(weatherPoint.windSpeedKmh, units, locale, 1)} />
            <Detail label={t("fields.clouds")} value={formatUnit(weatherPoint.cloudCover, "%", locale)} />
            <Detail label={t("fields.visibility")} value={weatherPoint.visibilityMeters === null ? null : formatDistanceFromKm(weatherPoint.visibilityMeters / 1_000, units, locale, 1)} />
          </dl>
        ) : (
          <p>{weatherQuery.isPending ? t("weather.loading") : t("weather.unavailable")}</p>
        )}
      </section>

      {expanded && (
        <div className="launch-globe-info__expanded">
          <dl>
            <Detail label={t("fields.status")} value={launch.statusDescription ?? launch.statusName} />
            <Detail label={t("fields.providerType")} value={launch.agencyType} />
            <Detail label={t("fields.location")} value={launch.locationName} />
            <Detail label={t("fields.probability")} value={launch.probability === null ? null : `${Math.round(launch.probability)}%`} />
            <Detail label={t("fields.payload")} value={launch.payloadNames.join(", ") || null} />
            <Detail label={t("fields.designator")} value={launch.launchDesignator} />
          </dl>
          {expanded && launch.rocket?.id && rocketQuery.isPending && (
            <p className="launch-rocket-loading">{t("rocket.loading")}</p>
          )}
          {expanded && launch.rocket?.id && rocketQuery.isError && (
            <p className="launch-rocket-loading">{t("rocket.unavailable")}</p>
          )}
          {rocket && !rocket.isPlaceholder && (
            <section className="launch-rocket-details">
              <header><strong>{rocket.fullName}</strong><small>{rocket.manufacturerName}</small></header>
              {rocket.description && <p>{rocket.description}</p>}
              <dl>
                <Detail label={t("rocket.height")} value={rocket.lengthMeters === null ? null : formatLengthFromMeters(rocket.lengthMeters, units, locale)} />
                <Detail label={t("rocket.diameter")} value={rocket.diameterMeters === null ? null : formatLengthFromMeters(rocket.diameterMeters, units, locale)} />
                <Detail label={t("rocket.mass")} value={rocket.launchMassTonnes === null ? null : formatMassFromTonnes(rocket.launchMassTonnes, units, locale)} />
                <Detail label={t("rocket.leo")} value={rocket.leoCapacityKg === null ? null : formatMassFromKilograms(rocket.leoCapacityKg, units, locale)} />
                <Detail label={t("rocket.gto")} value={rocket.gtoCapacityKg === null ? null : formatMassFromKilograms(rocket.gtoCapacityKg, units, locale)} />
                <Detail label={t("rocket.thrust")} value={rocket.thrustKilonewtons === null ? null : formatForceFromKilonewtons(rocket.thrustKilonewtons, units, locale)} />
                <Detail label={t("rocket.launches")} value={rocket.totalLaunchCount === null ? null : formatNumber(rocket.totalLaunchCount, locale)} />
                <Detail label={t("rocket.successes")} value={rocket.successfulLaunches === null ? null : formatNumber(rocket.successfulLaunches, locale)} />
              </dl>
              {rocketQuery.data && (
                <small className="launch-rocket-source">
                  {rocketQuery.data.source} · {formatDateTime(rocketQuery.data.fetchedAt, locale)}
                </small>
              )}
            </section>
          )}
          {(launch.sourceUrl || rocket?.infoUrl || rocket?.wikiUrl) && (
            <div className="launch-source-links">
              {launch.sourceUrl && (
                <button onClick={() => void openExternal(launch.sourceUrl!)} type="button">
                  {t("globe.officialSource")}
                </button>
              )}
              {(rocket?.infoUrl || rocket?.wikiUrl) && (
                <button
                  onClick={() => void openExternal(rocket.infoUrl ?? rocket.wikiUrl!)}
                  type="button"
                >
                  {t("globe.rocketSource")}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <footer>
        <strong>{source ?? t("globe.source")}</strong>
        <span>{t(stale ? "globe.cached" : "globe.fresh", {
          time: fetchedAt ? formatDateTime(fetchedAt, locale) : t("common.unavailable"),
        })}</span>
      </footer>
    </ObjectInspector>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  const { t } = useTranslation("launches");
  return <div><dt>{label}</dt><dd>{value ?? t("common.unavailable")}</dd></div>;
}

function formatDateTime(iso: string, locale: string): string {
  return formatLocalizedDateTime(iso, locale, "utc-only").primary;
}

function formatShortDate(iso: string, locale: string): string {
  return formatCompactDate(iso, locale);
}

function formatUnit(
  value: number | null,
  unit: string,
  locale: string,
): string | null {
  return value === null ? null : `${formatNumber(value, locale, { maximumFractionDigits: 1 })} ${unit}`;
}

async function openExternal(url: string): Promise<void> {
  await openExternalUrl(url).catch(() => undefined);
}
