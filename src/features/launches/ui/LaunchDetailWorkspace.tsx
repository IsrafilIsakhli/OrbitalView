import {
  ArrowLeft24Regular,
  Globe24Regular,
  Location24Regular,
  Rocket24Regular,
  Video24Regular,
} from "@fluentui/react-icons";
import { openExternalUrl } from "@/shared/security/externalUrl";
import { useTranslation } from "react-i18next";

import { DataFreshnessBadge } from "@/features/control-center/ui/DataFreshnessBadge";
import { usePreferencesStore } from "@/features/settings/model/preferences";
import { useSpaceNewsForRelation } from "@/features/space-news/api/useSpaceNews";
import { formatDateTime } from "@/shared/i18n/formatters";
import { RemoteMediaImage } from "@/shared/ui/RemoteMediaImage";

import { useLaunchDetail } from "../api/useLaunchOperations";
import type { LaunchRecord } from "../domain/launch";
import { launchStatusTranslationKey } from "../domain/launchPresentation";

interface LaunchDetailWorkspaceProps {
  fallbackLaunch: LaunchRecord | null;
  launchId: string;
  onBack: () => void;
  onShowEarth: (launchId: string) => void;
  onOpenNews: ((newsId: string) => void) | undefined;
}

export function LaunchDetailWorkspace({
  fallbackLaunch,
  launchId,
  onBack,
  onShowEarth,
  onOpenNews,
}: LaunchDetailWorkspaceProps) {
  const { i18n, t } = useTranslation(["common", "launches", "missions", "news"]);
  const detail = useLaunchDetail(launchId);
  const launch = detail.data?.launch ?? fallbackLaunch;
  const timeDisplay = usePreferencesStore((state) => state.timeDisplay);
  const timestamp = launch ? formatDateTime(launch.net, i18n.resolvedLanguage, timeDisplay) : null;
  const relatedNews = useSpaceNewsForRelation("launch", launchId, 6);

  if (!launch) {
    return (
      <section className="launch-detail-workspace launch-detail-workspace--state">
        <Rocket24Regular aria-hidden />
        <h2>{t(detail.isPending ? "launches:loading.title" : "launches:error.title")}</h2>
        <p>{t(detail.isPending ? "launches:loading.description" : "launches:error.description")}</p>
        <button className="secondary-button" onClick={onBack} type="button"><ArrowLeft24Regular aria-hidden />{t("missions:detail.back")}</button>
      </section>
    );
  }

  return (
    <section className="launch-detail-workspace">
      <header className="launch-detail-header">
        <button className="icon-button" onClick={onBack} type="button"><ArrowLeft24Regular aria-hidden /></button>
        <div>
          <p className="eyebrow">{t("missions:detail.overview")}</p>
          <h2>{launch.missionName ?? launch.name}</h2>
          <p>{launch.agencyName ?? t("launches:common.unavailable")}</p>
        </div>
        <DataFreshnessBadge status={detail.data?.stale ? "stale" : detail.isError ? "degraded" : "healthy"} timestampUnixMs={detail.data ? Date.parse(detail.data.fetchedAt) : launch.lastUpdated ? Date.parse(launch.lastUpdated) : null} />
      </header>

      <div className="launch-detail-grid-layout">
        <article className="launch-detail-visual glass-surface">
          <RemoteMediaImage alt={launch.name} fallback={<Rocket24Regular aria-hidden />} provider="launchLibrary" url={launch.image?.url ?? launch.image?.thumbnailUrl} />
          <div><span>{t(`launches:status.${launchStatusTranslationKey(launch.statusId)}`)}</span><h1>{launch.name}</h1><p>{launch.missionDescription ?? t("launches:missions.noDescription")}</p></div>
        </article>

        <article className="launch-detail-facts glass-surface">
          <h3>{t("missions:detail.overview")}</h3>
          <dl>
            <Fact label={t("launches:fields.rocket")} value={launch.rocketName} />
            <Fact label={t("launches:fields.agency")} value={launch.agencyName} />
            <Fact label={t("launches:fields.orbit")} value={launch.orbitName ?? launch.orbitAbbreviation} />
            <Fact label={t("launches:fields.pad")} value={launch.padName} />
            <Fact label={t("launches:fields.location")} value={launch.locationName} />
            <Fact label={t("launches:fields.designator")} value={launch.launchDesignator} />
          </dl>
        </article>

        <article className="launch-detail-time glass-surface">
          <small>{t("launches:fields.window")}</small>
          <strong>{timestamp?.primary ?? "—"}</strong>
          {timestamp?.local && timestamp.local !== timestamp.primary && <span>{timestamp.local}</span>}
          <p><Location24Regular aria-hidden />{launch.countryName ?? launch.countryCode ?? t("launches:common.unavailable")}</p>
        </article>

        <article className="launch-detail-payloads glass-surface">
          <h3>{t("missions:detail.payloads")}</h3>
          {launch.payloadNames.length > 0
            ? <ul>{launch.payloadNames.map((payload) => <li key={payload}>{payload}</li>)}</ul>
            : <p>{t("missions:detail.notPublished")}</p>}
        </article>

        <article className="launch-detail-related-news glass-surface">
          <h3>{t("news:detail.related")}</h3>
          {relatedNews.data?.items.length ? (
            <ul>
              {relatedNews.data.items.map((item) => (
                <li key={item.id}>
                  <button disabled={!onOpenNews} onClick={() => onOpenNews?.(item.id)} type="button">
                    <strong>{item.title}</strong>
                    <span>{item.source} · {formatDateTime(item.publishedAtUnixMs, i18n.resolvedLanguage, "utc-only").primary}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p>{t("news:detail.noRelations")}</p>}
        </article>
      </div>

      <footer className="launch-detail-actions">
        <button className="primary-button" disabled={launch.latitude === null || launch.longitude === null} onClick={() => onShowEarth(launch.id)} type="button"><Globe24Regular aria-hidden />{t("missions:detail.showEarth")}</button>
        {launch.streamUrl && <button className="secondary-button" onClick={() => void openExternalUrl(launch.streamUrl!).catch(() => undefined)} type="button"><Video24Regular aria-hidden />{t("missions:detail.watch")}</button>}
      </footer>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  const { t } = useTranslation("missions");
  return <div><dt>{label}</dt><dd>{value ?? t("detail.notPublished")}</dd></div>;
}
