import {
  BuildingMultiple24Regular,
  Communication24Regular,
  DataHistogram24Regular,
  Dismiss24Regular,
  GlobeLocation24Regular,
  LayerDiagonal24Regular,
  Microscope24Regular,
  NetworkCheck24Regular,
  Open24Regular,
  Rocket24Regular,
  WeatherCloudy24Regular,
} from "@fluentui/react-icons";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { FavoriteButton } from "@/features/awareness/ui/FavoriteButton";
import { ObjectInspector } from "@/features/earth-engine/ui/ObjectInspector";
import { usePreferencesStore } from "@/features/settings/model/preferences";
import {
  formatCompactDate,
  formatDateTime,
  formatNumber,
} from "@/shared/i18n/formatters";
import { formatDistanceFromKm, formatOrbitalSpeed } from "@/shared/formatting/units";
import { openExternalUrl } from "@/shared/security/externalUrl";

import { satelliteMediaAssetUrl } from "../api/satelliteMedia";
import { useSatelliteObjectMedia } from "../api/useSatelliteObjectMedia";
import type { SatelliteCategory, SatelliteRecord } from "../domain/satellite";
import type { SatelliteTelemetry } from "../rendering/CesiumSatelliteLayer";

interface SatelliteInfoPanelProps {
  fetchedAt: string | null;
  followActive: boolean;
  groundTrackVisible: boolean;
  onFocus: () => void;
  onClose: () => void;
  onHide: () => void;
  onAnalyze: () => void;
  onToggleFollow: () => void;
  onToggleGroundTrack: () => void;
  onToggleOrbit: () => void;
  orbitVisible: boolean;
  satellite: SatelliteRecord;
  source: string | null;
  telemetry: SatelliteTelemetry | null;
}

export function SatelliteInfoPanel({
  fetchedAt,
  followActive,
  groundTrackVisible,
  onFocus,
  onClose,
  onHide,
  onAnalyze,
  onToggleFollow,
  onToggleGroundTrack,
  onToggleOrbit,
  orbitVisible,
  satellite,
  source,
  telemetry,
}: SatelliteInfoPanelProps) {
  const { i18n, t } = useTranslation(["satellites", "orbitalAnalysis"]);
  const locale = i18n.resolvedLanguage ?? "en";
  const timeDisplay = usePreferencesStore((state) => state.timeDisplay);
  const units = usePreferencesStore((state) => state.units);
  const mediaQuery = useSatelliteObjectMedia(satellite.noradId);
  const media = mediaQuery.data;
  const [expanded, setExpanded] = useState(false);
  const [brokenImagePath, setBrokenImagePath] = useState<string | null>(null);
  const headingId = `satellite-inspector-${satellite.noradId}`;
  const number = (value: number, maximumFractionDigits = 2) =>
    formatNumber(value, locale, { maximumFractionDigits });

  const imageAvailable = media?.state === "available"
    && media.cachedPath
    && media.cachedPath !== brokenImagePath;

  return (
    <ObjectInspector
      ariaLabel={t("details.regionLabel")}
      className="satellite-info glass-surface"
      headingId={headingId}
    >
      <div className="satellite-info__sticky-header">
        <header className="satellite-info__header">
          <div className="satellite-info__identity-mark" data-kind={satellite.category}>
            <CategoryIcon category={satellite.category} />
          </div>
          <div className="satellite-info__identity">
            <span>{t(`category.${satellite.category}`)}</span>
            <h2 data-inspector-heading id={headingId} tabIndex={-1}>{satellite.name}</h2>
            <p>{t("details.norad", { id: satellite.noradId })}</p>
          </div>
          <div className="satellite-info__actions">
            <FavoriteButton favorite={{
              id: satellite.id,
              imageUrl: null,
              kind: "satellite",
              occurredAt: satellite.launchDate,
              subtitle: satellite.ownerCode,
              title: satellite.name,
            }} />
            <button aria-label={t("details.close")} onClick={onClose} type="button">
              <Dismiss24Regular aria-hidden />
            </button>
          </div>
        </header>
      </div>

      {imageAvailable && (
        <figure className="satellite-media">
          <img
            alt={t("media.alt", { name: satellite.name })}
            decoding="async"
            onError={() => setBrokenImagePath(media.cachedPath)}
            src={satelliteMediaAssetUrl(media.cachedPath!)}
          />
          <figcaption>
            <span>{media.creator ?? t("media.creatorUnknown")}</span>
            <div>
              {media.commonsPageUrl && (
                <button onClick={() => void openExternalUrl(media.commonsPageUrl!).catch(() => undefined)} type="button">
                  <Open24Regular aria-hidden />{t("media.source")}
                </button>
              )}
              {media.licenseName && (
                <button
                  disabled={!media.licenseUrl}
                  onClick={() => media.licenseUrl && void openExternalUrl(media.licenseUrl).catch(() => undefined)}
                  type="button"
                >
                  {media.licenseName}
                </button>
              )}
            </div>
          </figcaption>
        </figure>
      )}

      {(mediaQuery.isPending || media?.state === "pending") && (
        <div className="satellite-media-status" role="status">
          <span aria-hidden />{t("media.pending")}
        </div>
      )}

      <div className="satellite-live-strip">
        <span aria-hidden />
        <strong>{t("details.livePosition")}</strong>
        <small>{telemetry ? t("details.updatedNow") : t("details.calculating")}</small>
      </div>

      <div className="object-inspector-actions">
        <button className="object-inspector-actions__analysis" onClick={onAnalyze} type="button"><DataHistogram24Regular aria-hidden />{t("orbitalAnalysis:actions.analyze")}</button>
        <button onClick={onFocus} type="button">{t("actions.focus")}</button>
        <button aria-pressed={followActive} data-active={followActive} onClick={onToggleFollow} type="button">
          {t(followActive ? "actions.stopFollow" : "actions.follow")}
        </button>
        <button aria-pressed={orbitVisible} data-active={orbitVisible} onClick={onToggleOrbit} type="button">
          {t("actions.orbit")}
        </button>
        <button aria-pressed={groundTrackVisible} data-active={groundTrackVisible} onClick={onToggleGroundTrack} type="button">
          {t("actions.groundTrack")}
        </button>
        <button onClick={onHide} type="button">{t("actions.hide")}</button>
        <button aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} type="button">
          {t(expanded ? "actions.less" : "actions.details")}
        </button>
      </div>

      <InspectorSection title={t("sections.liveTelemetry")}>
        <dl className="satellite-info__metrics">
          <Metric label={t("fields.altitude")} value={telemetry ? formatDistanceFromKm(telemetry.altitudeKm, units, locale, 2) : "—"} />
          <Metric label={t("fields.velocity")} value={telemetry ? formatOrbitalSpeed(telemetry.velocityKmPerSecond, units, locale) : "—"} />
          <Metric label={t("fields.latitude")} value={telemetry?.latitudeDegrees != null ? t("units.degrees", { value: number(telemetry.latitudeDegrees, 3) }) : "—"} />
          <Metric label={t("fields.longitude")} value={telemetry?.longitudeDegrees != null ? t("units.degrees", { value: number(telemetry.longitudeDegrees, 3) }) : "—"} />
        </dl>
      </InspectorSection>

      <InspectorSection title={t("sections.orbit")}>
        <dl className="satellite-info__details satellite-info__details--orbit">
          <DetailRow label={t("fields.inclination")} value={t("units.degrees", { value: number(satellite.inclinationDegrees) })} />
          <DetailRow label={t("fields.period")} value={t("units.minutes", { value: number(satellite.periodMinutes) })} />
          {satellite.perigeeKm !== null && <DetailRow label={t("fields.perigee")} value={formatDistanceFromKm(satellite.perigeeKm, units, locale)} />}
          {satellite.apogeeKm !== null && <DetailRow label={t("fields.apogee")} value={formatDistanceFromKm(satellite.apogeeKm, units, locale)} />}
          <DetailRow label={t("fields.eccentricity")} value={number(satellite.eccentricity, 6)} />
          <DetailRow label={t("fields.meanMotion")} value={number(satellite.meanMotionRevolutionsPerDay, 5)} />
          <DetailRow label={t("fields.epoch")} value={formatTimestamp(satellite.epoch, locale, timeDisplay)} />
        </dl>
      </InspectorSection>

      {expanded && (
        <InspectorSection title={t("sections.identity")}>
          <p className="satellite-category-provenance">{t("details.categoryProvenance")}</p>
          <dl className="satellite-info__details satellite-info__details--extended">
            {satellite.ownerCode && <DetailRow label={t("fields.owner")} value={satellite.ownerCode} />}
            {satellite.objectType && <DetailRow label={t("fields.objectType")} value={satellite.objectType} />}
            {satellite.internationalDesignator && <DetailRow label={t("fields.designator")} value={satellite.internationalDesignator} />}
            {satellite.launchDate && <DetailRow label={t("fields.launchDate")} value={formatCompactDate(`${satellite.launchDate}T00:00:00Z`, locale)} />}
            {satellite.launchSiteCode && <DetailRow label={t("fields.launchSite")} value={satellite.launchSiteCode} />}
            {satellite.operationalStatusCode && <DetailRow label={t("fields.status")} value={t(`status.${statusKey(satellite.operationalStatusCode)}`)} />}
          </dl>
        </InspectorSection>
      )}

      <footer>
        <strong>{source ?? t("details.source")}</strong>
        {fetchedAt && <span>{formatTimestamp(fetchedAt, locale, timeDisplay)}</span>}
      </footer>
    </ObjectInspector>
  );
}

function InspectorSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="satellite-info__section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd title={value}>{value}</dd></div>;
}

function CategoryIcon({ category }: { category: SatelliteCategory }) {
  const icons: Record<SatelliteCategory, ReactNode> = {
    communications: <Communication24Regular aria-hidden />,
    debris: <LayerDiagonal24Regular aria-hidden />,
    navigation: <GlobeLocation24Regular aria-hidden />,
    other: <GlobeLocation24Regular aria-hidden />,
    "rocket-body": <Rocket24Regular aria-hidden />,
    science: <Microscope24Regular aria-hidden />,
    starlink: <NetworkCheck24Regular aria-hidden />,
    station: <BuildingMultiple24Regular aria-hidden />,
    weather: <WeatherCloudy24Regular aria-hidden />,
  };
  return <>{icons[category]}</>;
}

function formatTimestamp(
  value: string,
  locale: string,
  timeDisplay: "utc-local" | "utc-only" | "local-only",
): string {
  return formatDateTime(value, locale, timeDisplay, {
    dateStyle: "medium",
    timeStyle: "short",
  }).primary;
}

function statusKey(code: string): "operational" | "partial" | "standby" | "inactive" | "unknown" {
  if (code === "+") return "operational";
  if (code === "P") return "partial";
  if (code === "B" || code === "S" || code === "X") return "standby";
  if (code === "-") return "inactive";
  return "unknown";
}
