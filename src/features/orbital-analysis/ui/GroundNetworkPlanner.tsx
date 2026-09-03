import { useTranslation } from "react-i18next";

import { usePreferencesStore } from "@/features/settings/model/preferences";
import { formatDateTime, formatNumber } from "@/shared/i18n/formatters";

import type { AnalysisEnvelope, GroundNetworkResult } from "../domain/analysis";
import { AnalysisMetric, AnalysisRunSummary, AnalysisSectionHeading } from "./AnalysisOutput";
import { AnalysisWarnings } from "./AnalysisWarnings";

interface GroundNetworkPlannerProps {
  envelope: AnalysisEnvelope<GroundNetworkResult> | null;
  onShowEarthAtTime: (timestampUnixMs: number) => void;
}

export function GroundNetworkPlanner({ envelope, onShowEarthAtTime }: GroundNetworkPlannerProps) {
  const { t } = useTranslation("orbitalAnalysis");
  const locale = usePreferencesStore((state) => state.locale);
  if (!envelope) return <div className="analysis-empty-state">{t("network.empty")}</div>;
  const result = envelope.result;
  const passCount = result.stationResults.reduce((total, station) => total + station.passes.length, 0);
  return (
    <div className="analysis-panel-stack">
      <AnalysisRunSummary envelope={envelope} resultCount={passCount} resultLabel={t("network.passes")} />
      <AnalysisWarnings warnings={envelope.warnings} />
      <aside className="analysis-scientific-disclaimer analysis-scientific-disclaimer--neutral">
        <strong>{t("network.contactCoverage")}</strong>
        <span>{t("network.disclaimer")}</span>
      </aside>
      <AnalysisSectionHeading description={t("network.summaryDescription")} title={t("network.summary")} />
      <div className="analysis-metric-grid analysis-metric-grid--compact">
        <AnalysisMetric emphasis="primary" label={t("network.stations")} value={formatNumber(result.stationResults.length, locale)} />
        <AnalysisMetric emphasis="primary" label={t("network.availability")} value={`${formatNumber(result.availabilityPercent, locale, { maximumFractionDigits: 2 })}%`} />
        <AnalysisMetric label={t("network.contactTime")} value={formatDuration(result.totalContactSeconds, locale)} />
        <AnalysisMetric label={t("network.longestGap")} value={formatDuration(result.longestGapSeconds, locale)} />
        <AnalysisMetric label={t("network.contactWindows")} value={formatNumber(result.contactWindows.length, locale)} />
      </div>
      <NetworkTimeline result={result} />
      <div className="analysis-table-scroll">
        <table>
          <thead><tr><th>{t("network.station")}</th><th>{t("station.aos")}</th><th>{t("station.tca")}</th><th>{t("station.los")}</th><th>{t("station.maximumElevation")}</th><th>{t("network.inspect")}</th></tr></thead>
          <tbody>
            {result.stationResults.flatMap((stationResult) => stationResult.passes.map((pass) => (
              <tr key={`${stationResult.station.id}:${pass.aosUnixMs}`}>
                <td>{stationResult.station.name}</td>
                <td>{formatDateTime(pass.aosUnixMs, locale, "utc-only").primary}</td>
                <td>{formatDateTime(pass.tcaUnixMs, locale, "utc-only").primary}</td>
                <td>{formatDateTime(pass.losUnixMs, locale, "utc-only").primary}</td>
                <td>{formatNumber(pass.maximumElevationDegrees, locale, { maximumFractionDigits: 2 })}°</td>
                <td><button className="analysis-inline-action" onClick={() => onShowEarthAtTime(pass.tcaUnixMs)} type="button">{t("actions.openTcaOnEarth")}</button></td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NetworkTimeline({ result }: { result: GroundNetworkResult }) {
  const { t } = useTranslation("orbitalAnalysis");
  const duration = Math.max(1, result.endUnixMs - result.startUnixMs);
  return (
    <section aria-label={t("network.timeline")} className="analysis-network-timeline">
      <header><strong>{t("network.timeline")}</strong><span>{t("network.timelineHint")}</span></header>
      <div className="analysis-network-timeline__axis"><span>{t("network.start")}</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
      {result.stationResults.map((stationResult, stationIndex) => (
        <div className="analysis-network-timeline__row" key={stationResult.station.id}>
          <span>{stationResult.station.name}</span>
          <div>
            {stationResult.passes.map((pass) => (
              <i
                aria-label={`${stationResult.station.name}: ${new Date(pass.aosUnixMs).toISOString()} – ${new Date(pass.losUnixMs).toISOString()}`}
                key={pass.aosUnixMs}
                style={{
                  left: `${(pass.aosUnixMs - result.startUnixMs) / duration * 100}%`,
                  width: `${Math.max(0.2, (pass.losUnixMs - pass.aosUnixMs) / duration * 100)}%`,
                  "--network-row": stationIndex,
                } as React.CSSProperties}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function formatDuration(seconds: number, locale: string): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0 min";
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.round((seconds % 3_600) / 60);
  if (hours <= 0) return `${new Intl.NumberFormat(locale).format(minutes)} min`;
  return `${new Intl.NumberFormat(locale).format(hours)} h ${new Intl.NumberFormat(locale).format(minutes)} min`;
}
