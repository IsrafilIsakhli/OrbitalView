import {
  ArrowLeft24Regular,
  Globe24Regular,
  Rocket24Regular,
  Video24Regular,
} from "@fluentui/react-icons";
import { openExternalUrl } from "@/shared/security/externalUrl";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useActiveSatelliteCatalog } from "@/features/satellites/api/useActiveSatelliteCatalog";
import { usePreferencesStore } from "@/features/settings/model/preferences";
import { formatDateTime } from "@/shared/i18n/formatters";
import { RemoteMediaImage } from "@/shared/ui/RemoteMediaImage";

import { useLaunchDetail } from "../api/useLaunchOperations";
import type { LaunchRecord } from "../domain/launch";
import { launchStatusTranslationKey } from "../domain/launchPresentation";
import { matchMissionSatellites } from "../domain/missionSatelliteMatcher";

interface MissionDetailWorkspaceProps {
  fallbackLaunch: LaunchRecord;
  onBack: () => void;
  onShowLaunchSite: (launchId: string) => void;
  onTrackSatellite: (satelliteId: string) => void;
}

export function MissionDetailWorkspace({
  fallbackLaunch,
  onBack,
  onShowLaunchSite,
  onTrackSatellite,
}: MissionDetailWorkspaceProps) {
  const { i18n, t } = useTranslation(["launches", "missions", "satellites"]);
  const detail = useLaunchDetail(fallbackLaunch.id);
  const catalog = useActiveSatelliteCatalog();
  const launch = detail.data?.launch ?? fallbackLaunch;
  const matches = useMemo(
    () => matchMissionSatellites(launch.launchDesignator, catalog.data?.satellites ?? []),
    [catalog.data?.satellites, launch.launchDesignator],
  );
  const [selectedSatelliteId, setSelectedSatelliteId] = useState<string | null>(null);
  const selectedMatch = matches.find((match) => match.satellite.id === selectedSatelliteId)
    ?? matches.find((match) => match.isPrimary)
    ?? null;
  const timeDisplay = usePreferencesStore((state) => state.timeDisplay);
  const date = formatDateTime(launch.net, i18n.resolvedLanguage, timeDisplay);

  return (
    <section className="mission-detail-workspace">
      <header className="mission-detail-header">
        <button aria-label={t("missions:detail.back")} className="icon-button" onClick={onBack} type="button"><ArrowLeft24Regular aria-hidden /></button>
        <div><p className="eyebrow">{t("missions:detail.overview")}</p><h1>{launch.missionName ?? launch.name}</h1><p>{launch.agencyName ?? t("launches:common.unavailable")}</p></div>
      </header>

      <div className="mission-detail-layout">
        <article className="mission-overview-card glass-surface">
          <div className="mission-overview-card__image">
            <RemoteMediaImage alt={launch.name} fallback={<Rocket24Regular aria-hidden />} provider="launchLibrary" url={launch.image?.url ?? launch.image?.thumbnailUrl} />
          </div>
          <div className="mission-overview-card__body">
            <span>{t(`launches:status.${launchStatusTranslationKey(launch.statusId)}`)}</span>
            <h2>{launch.name}</h2>
            <p>{launch.missionDescription ?? t("launches:missions.noDescription")}</p>
            <dl>
              <MissionFact label={t("launches:fields.rocket")} value={launch.rocketName} />
              <MissionFact label={t("launches:fields.payload")} value={launch.payloadNames.join(", ") || null} />
              <MissionFact label={t("launches:fields.pad")} value={launch.padName} />
              <MissionFact label={t("launches:fields.orbit")} value={launch.orbitName ?? launch.orbitAbbreviation} />
              <MissionFact label={t("launches:fields.window")} value={date.primary} />
              <MissionFact label={t("launches:fields.designator")} value={launch.launchDesignator} />
            </dl>
            {date.local && date.local !== date.primary && <small className="mission-local-time">{date.local}</small>}
          </div>
        </article>

        <article className="mission-tracking-card glass-surface" data-available={matches.length > 0}>
          <header><div><small>{matches.length > 0 ? t("missions:tracking.available") : t("missions:tracking.pending")}</small><h2>{t("missions:tracking.title")}</h2></div><Globe24Regular aria-hidden /></header>
          {matches.length === 0 ? (
            <div className="mission-telemetry-pending"><span aria-hidden><i /><i /><i /></span><p>{t("missions:tracking.pendingBody")}</p><small>{launch.launchDesignator ?? t("missions:detail.notPublished")}</small></div>
          ) : (
            <>
              <p className="mission-match-count">{t("missions:tracking.matches")} · {matches.length}</p>
              <div className="mission-match-list">
                {matches.map(({ satellite, isPrimary }) => (
                  <button aria-pressed={selectedMatch?.satellite.id === satellite.id} data-active={selectedMatch?.satellite.id === satellite.id} key={satellite.id} onClick={() => setSelectedSatelliteId(satellite.id)} type="button">
                    <span><strong>{satellite.name}</strong><small>{t("satellites:details.norad", { id: satellite.noradId })}</small></span>
                    <i>{isPrimary ? t("missions:status.active") : satellite.objectType ?? satellite.category}</i>
                  </button>
                ))}
              </div>
              <button className="primary-button" disabled={!selectedMatch} onClick={() => selectedMatch && onTrackSatellite(selectedMatch.satellite.id)} type="button"><Globe24Regular aria-hidden />{t("missions:tracking.trackEarth")}</button>
            </>
          )}
        </article>
      </div>

      <footer className="mission-detail-actions">
        <button className="secondary-button" disabled={launch.latitude === null || launch.longitude === null} onClick={() => onShowLaunchSite(launch.id)} type="button"><Globe24Regular aria-hidden />{t("missions:detail.showEarth")}</button>
        {launch.streamUrl && <button className="secondary-button" onClick={() => void openExternalUrl(launch.streamUrl!).catch(() => undefined)} type="button"><Video24Regular aria-hidden />{t("missions:detail.watch")}</button>}
      </footer>
    </section>
  );
}

function MissionFact({ label, value }: { label: string; value: string | null }) {
  const { t } = useTranslation("missions");
  return <div><dt>{label}</dt><dd>{value ?? t("detail.notPublished")}</dd></div>;
}
