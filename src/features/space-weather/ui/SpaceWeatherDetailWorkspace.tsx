import { ArrowLeft24Regular, WeatherMoon24Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";

import { formatDateTime, formatNumber } from "@/shared/i18n/formatters";
import { usePreferencesStore } from "@/features/settings/model/preferences";
import { formatOrbitalSpeed } from "@/shared/formatting/units";

import { useNoaaSpaceWeather } from "../api/useNoaaSpaceWeather";
import { currentScale, latestKp } from "../domain/spaceWeather";
import { NoaaScaleBadge } from "./NoaaScaleBadge";

export function SpaceWeatherDetailWorkspace({ onBack }: { onBack: () => void }) {
  const { i18n, t } = useTranslation(["common", "spaceWeather"]);
  const query = useNoaaSpaceWeather();
  const data = query.data;
  const units = usePreferencesStore((state) => state.units);
  if (query.isLoading && !data) {
    return <section className="module-state"><WeatherMoon24Regular aria-hidden /><h1>{t("spaceWeather:title")}</h1><p>{t("spaceWeather:states.loading")}</p></section>;
  }
  if (!data) {
    return <section className="module-state"><WeatherMoon24Regular aria-hidden /><h1>{t("spaceWeather:states.unavailable")}</h1><button className="primary-button" onClick={() => void query.refetch()} type="button">{t("common:actions.retry")}</button></section>;
  }
  const kp = latestKp(data);
  return (
    <section className="space-weather-page">
      <header className="workspace-heading">
        <button className="secondary-button" onClick={onBack} type="button"><ArrowLeft24Regular aria-hidden />{t("spaceWeather:actions.back")}</button>
        <div><p className="eyebrow">{data.source}</p><h1>{t("spaceWeather:title")}</h1><p>{t("spaceWeather:subtitle")}</p></div>
        <span className="status-chip" data-status={data.status}>{t(`spaceWeather:status.${data.status}`)}</span>
      </header>
      <div className="space-weather-scale-grid">
        <NoaaScaleBadge scale={currentScale(data, "radioBlackout")} scaleType="radioBlackout" />
        <NoaaScaleBadge scale={currentScale(data, "solarRadiation")} scaleType="solarRadiation" />
        <NoaaScaleBadge scale={currentScale(data, "geomagneticStorm")} scaleType="geomagneticStorm" />
      </div>
      <div className="space-weather-metrics">
        <article className="glass-surface"><small>{t("spaceWeather:metrics.kp")}</small><strong>{kp ? formatNumber(kp.kp, i18n.resolvedLanguage, { maximumFractionDigits: 2 }) : "—"}</strong><span>{kp ? formatDateTime(kp.observedAtUnixMs, i18n.resolvedLanguage, "utc-only").primary : t("spaceWeather:states.unavailable")}</span></article>
        <article className="glass-surface"><small>{t("spaceWeather:metrics.solarWind")}</small><strong>{data.solarWind ? formatOrbitalSpeed(data.solarWind.speedKilometersPerSecond, units, i18n.resolvedLanguage ?? "en", 0) : "—"}</strong><span>{data.solarWind ? formatDateTime(data.solarWind.observedAtUnixMs, i18n.resolvedLanguage, "utc-only").primary : t("spaceWeather:states.unavailable")}</span></article>
      </div>
      <section className="space-weather-alerts glass-surface"><header><div><p className="eyebrow">{t("spaceWeather:alerts.eyebrow")}</p><h2>{t("spaceWeather:alerts.title")}</h2></div><strong>{data.alerts.length}</strong></header>{data.alerts.length === 0 ? <p>{t("spaceWeather:alerts.empty")}</p> : data.alerts.slice(0, 20).map((alert) => <article key={`${alert.productId}:${alert.issuedAtUnixMs}`}><div><span className="status-chip">{t(`spaceWeather:alerts.kind.${alert.alertKind}`)}</span>{alert.scaleType && alert.scaleLevel !== null && <strong>{alert.scaleType}{alert.scaleLevel}</strong>}</div><h3>{alert.headline}</h3><time>{formatDateTime(alert.issuedAtUnixMs, i18n.resolvedLanguage, "utc-local").primary}</time></article>)}</section>
    </section>
  );
}
