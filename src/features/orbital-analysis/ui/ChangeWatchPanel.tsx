import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { usePreferencesStore } from "@/features/settings/model/preferences";
import { formatDateTime, formatNumber } from "@/shared/i18n/formatters";

import { useAnalysisOrbitalHistory } from "../api/useAnalysisStorage";
import { AnalysisMetric, AnalysisSectionHeading } from "./AnalysisOutput";
import { AnalysisTimeSeriesChart } from "./AnalysisTimeSeriesChart";

interface ChangeWatchPanelProps {
  noradId: string;
}

export function ChangeWatchPanel({ noradId }: ChangeWatchPanelProps) {
  const { t } = useTranslation("orbitalAnalysis");
  const locale = usePreferencesStore((state) => state.locale);
  const historyQuery = useAnalysisOrbitalHistory(noradId);
  const history = useMemo(() => historyQuery.data ?? [], [historyQuery.data]);
  const first = history[0];
  const latest = history.length > 0 ? history[history.length - 1] : undefined;
  const deltas = first && latest ? {
    apogee: optionalDelta(latest.apogeeKm, first.apogeeKm),
    inclination: latest.inclinationDegrees - first.inclinationDegrees,
    meanMotion: latest.meanMotion - first.meanMotion,
    perigee: optionalDelta(latest.perigeeKm, first.perigeeKm),
  } : null;
  const review = deltas !== null && (
    Math.abs(deltas.apogee ?? 0) >= 2
    || Math.abs(deltas.perigee ?? 0) >= 2
    || Math.abs(deltas.inclination) >= 0.05
    || Math.abs(deltas.meanMotion) >= 0.005
  );
  const chartSeries = useMemo(() => ({
    apsides: [
      { color: "#79e6ff", label: t("changeWatch.perigee"), values: history.map((item) => item.perigeeKm ?? Number.NaN) },
      { color: "#ffb85c", dash: [6, 4], label: t("changeWatch.apogee"), values: history.map((item) => item.apogeeKm ?? Number.NaN) },
    ],
    inclination: [{ color: "#9a8cff", label: t("changeWatch.inclination"), values: history.map((item) => item.inclinationDegrees) }],
    meanMotion: [{ color: "#71df9a", label: t("changeWatch.meanMotion"), values: history.map((item) => item.meanMotion) }],
  }), [history, t]);
  const timestamps = history.map((item) => item.sourceEpochUnixMs);

  return (
    <section className="analysis-panel-stack">
      <div className="analysis-scientific-disclaimer analysis-scientific-disclaimer--neutral">
        <strong>{t("changeWatch.disclaimerTitle")}</strong>
        <span>{t("changeWatch.disclaimer")}</span>
      </div>
      <AnalysisSectionHeading description={t("changeWatch.summaryDescription")} title={t("changeWatch.summary")} />
      <div className="analysis-metric-grid analysis-metric-grid--primary">
        <AnalysisMetric emphasis="primary" label={t("changeWatch.snapshots")} source="source" value={formatNumber(history.length, locale)} />
        <AnalysisMetric emphasis="primary" label={t("changeWatch.perigeeDelta")} source="derived" value={formatDelta(deltas?.perigee, locale, "km")} />
        <AnalysisMetric emphasis="primary" label={t("changeWatch.apogeeDelta")} source="derived" value={formatDelta(deltas?.apogee, locale, "km")} />
        <AnalysisMetric emphasis="primary" label={t("changeWatch.reviewState")} source="derived" value={history.length < 2 || historyQuery.isError ? "—" : t(review ? "changeWatch.review" : "changeWatch.nominal")} />
      </div>
      {historyQuery.isError ? <div className="analysis-error-state">{t("errors.history")}</div> : null}
      {history.length < 2 ? (
        <div className="analysis-empty-state">{t(historyQuery.isPending ? "status.preparing" : history.length === 0 ? "changeWatch.noHistory" : "changeWatch.collecting")}</div>
      ) : (
        <>
          <div className="analysis-chart-grid">
            <ChartCard title={t("changeWatch.apsides")}><AnalysisTimeSeriesChart ariaLabel={t("changeWatch.apsides")} locale={locale} series={chartSeries.apsides} timestampsUnixMs={timestamps} unit="km" /></ChartCard>
            <ChartCard title={t("changeWatch.meanMotion")}><AnalysisTimeSeriesChart ariaLabel={t("changeWatch.meanMotion")} locale={locale} series={chartSeries.meanMotion} timestampsUnixMs={timestamps} unit="rev/day" /></ChartCard>
            <ChartCard title={t("changeWatch.inclination")}><AnalysisTimeSeriesChart ariaLabel={t("changeWatch.inclination")} locale={locale} series={chartSeries.inclination} timestampsUnixMs={timestamps} unit="°" /></ChartCard>
          </div>
          <p className="analysis-provenance-line">{t("changeWatch.range", {
            end: formatDateTime(latest!.sourceEpochUnixMs, locale, "utc-only").primary,
            start: formatDateTime(first!.sourceEpochUnixMs, locale, "utc-only").primary,
          })}</p>
        </>
      )}
    </section>
  );
}

function optionalDelta(latest: number | null, first: number | null): number | null {
  return latest === null || first === null ? null : latest - first;
}

function formatDelta(value: number | null | undefined, locale: string, unit: string): string {
  if (value === null || value === undefined) return "—";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatNumber(value, locale, { maximumFractionDigits: 4 })} ${unit}`;
}

function ChartCard({ children, title }: { children: React.ReactNode; title: string }) {
  return <article className="analysis-chart-card"><h3>{title}</h3>{children}</article>;
}
