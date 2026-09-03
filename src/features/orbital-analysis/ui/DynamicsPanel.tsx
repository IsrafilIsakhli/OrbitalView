import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { SatelliteRecord } from "@/features/satellites/domain/satellite";
import { usePreferencesStore } from "@/features/settings/model/preferences";
import { formatDateTime, formatNumber } from "@/shared/i18n/formatters";
import { formatDistanceFromKm, formatOrbitalSpeed } from "@/shared/formatting/units";

import type { AnalysisEnvelope, DynamicsResult } from "../domain/analysis";
import { AnalysisMetric, AnalysisRunSummary, AnalysisSectionHeading } from "./AnalysisOutput";
import { AnalysisTimeSeriesChart } from "./AnalysisTimeSeriesChart";
import { AnalysisWarnings } from "./AnalysisWarnings";
import { OrbitSchematicCanvas } from "./OrbitSchematicCanvas";

interface DynamicsPanelProps {
  envelope: AnalysisEnvelope<DynamicsResult> | null;
  onRun: (hours: number, samples: number) => void;
  onShowEarthAtTime: (timestampUnixMs: number) => void;
  running: boolean;
  satellite: SatelliteRecord;
}

const intervals = [
  { hours: 0, key: "oneOrbit", samples: 361 },
  { hours: 6, key: "sixHours", samples: 361 },
  { hours: 24, key: "day", samples: 721 },
  { hours: 168, key: "week", samples: 1_440 },
] as const;

export function DynamicsPanel({ envelope, onRun, onShowEarthAtTime, running, satellite }: DynamicsPanelProps) {
  const { t } = useTranslation("orbitalAnalysis");
  const locale = usePreferencesStore((state) => state.locale);
  const units = usePreferencesStore((state) => state.units);
  const [intervalKey, setIntervalKey] = useState<(typeof intervals)[number]["key"]>("oneOrbit");
  const [selectedSampleIndex, setSelectedSampleIndex] = useState(0);
  const selectedInterval = intervals.find((item) => item.key === intervalKey) ?? intervals[0];
  const firstSample = envelope?.result.samples[selectedSampleIndex] ?? envelope?.result.samples[0] ?? null;
  const timestamps = useMemo(
    () => envelope?.result.samples.map((sample) => sample.timestampUnixMs) ?? [],
    [envelope],
  );
  const chartSeries = useMemo(() => {
    const samples = envelope?.result.samples ?? [];
    return {
      altitude: [{ color: "#79e6ff", label: t("dynamics.altitude"), values: samples.map((sample) => sample.altitudeKm) }],
      energy: [{ color: "#9a8cff", label: t("dynamics.energy"), values: samples.map((sample) => sample.specificEnergyKm2PerSecond2) }],
      position: [
        { color: "#79c7ff", label: t("dynamics.latitude"), values: samples.map((sample) => sample.latitudeDegrees) },
        { color: "#ffb85c", dash: [6, 4], label: t("dynamics.longitude"), spanGaps: false, values: samples.map((sample, index) => index > 0 && Math.abs(sample.longitudeDegrees - samples[index - 1]!.longitudeDegrees) > 180 ? null : sample.longitudeDegrees) },
      ],
      velocity: [{ color: "#71df9a", label: t("dynamics.velocity"), values: samples.map((sample) => sample.velocityKmPerSecond) }],
    };
  }, [envelope, t]);
  const omm = satellite.omm as unknown as Record<string, number | string>;

  return (
    <section className="analysis-panel-stack">
      <div data-analysis-input className="analysis-control-card">
        <label>
          <span>{t("dynamics.interval")}</span>
          <select value={intervalKey} onChange={(event) => setIntervalKey(event.target.value as typeof intervalKey)}>
            {intervals.map((item) => <option key={item.key} value={item.key}>{t(`dynamics.${item.key}`)}</option>)}
          </select>
        </label>
        <button className="primary-button" disabled={running} onClick={() => onRun(selectedInterval.hours || satellite.periodMinutes / 60, selectedInterval.samples)} type="button">
          {running ? t("status.running") : t("actions.run")}
        </button>
      </div>

      {firstSample && (
        <section className="analysis-time-machine-card">
          <div>
            <span>{t("dynamics.timeMachine")}</span>
            <strong>{formatDateTime(firstSample.timestampUnixMs, locale, "utc-only").primary}</strong>
            <small>{t("dynamics.timeMachineDescription")}</small>
          </div>
          <div className="analysis-time-machine-card__state">
            <span>{t("dynamics.selectedInstant")}</span>
            <b>{String(selectedSampleIndex + 1).padStart(3, "0")} / {String(envelope?.result.samples.length ?? 0).padStart(3, "0")}</b>
          </div>
          <button className="primary-button" onClick={() => onShowEarthAtTime(firstSample.timestampUnixMs)} type="button">{t("actions.openSelectedTime")}</button>
        </section>
      )}

      <section className="analysis-output-section">
        <AnalysisSectionHeading description={t("dynamics.propagatedStateDescription")} title={t("dynamics.propagatedState")} />
        <div className="analysis-metric-grid analysis-metric-grid--primary">
          <AnalysisMetric emphasis="primary" label={t("dynamics.altitude")} source="derived" value={firstSample ? formatDistanceFromKm(firstSample.altitudeKm, units, locale, 2) : "—"} />
          <AnalysisMetric emphasis="primary" label={t("dynamics.velocity")} source="derived" value={firstSample ? formatOrbitalSpeed(firstSample.velocityKmPerSecond, units, locale, 3) : "—"} />
          <AnalysisMetric emphasis="primary" label={t("dynamics.radius")} source="derived" value={firstSample ? formatDistanceFromKm(firstSample.radiusKm, units, locale, 2) : "—"} />
          <AnalysisMetric emphasis="primary" label={t("dynamics.energy")} source="derived" value={firstSample ? `${formatNumber(firstSample.specificEnergyKm2PerSecond2, locale, { maximumFractionDigits: 4 })} km²/s²` : "—"} />
        </div>
      </section>

      <section className="analysis-output-section">
        <AnalysisSectionHeading description={t("dynamics.orbitalElementsDescription")} title={t("dynamics.orbitalElements")} />
        <div className="analysis-metric-grid">
          <AnalysisMetric label={t("dynamics.period")} source="source" value={`${formatNumber(satellite.periodMinutes, locale, { maximumFractionDigits: 2 })} ${t("units.minutes")}`} />
          <AnalysisMetric label={t("dynamics.inclination")} source="source" value={`${formatNumber(satellite.inclinationDegrees, locale, { maximumFractionDigits: 4 })}°`} />
          <AnalysisMetric label={t("dynamics.perigee")} source={satellite.perigeeKm !== null ? "source" : "derived"} value={formatOptionalDistance(satellite.perigeeKm ?? envelope?.result.derivedPerigeeKm, units, locale)} />
          <AnalysisMetric label={t("dynamics.apogee")} source={satellite.apogeeKm !== null ? "source" : "derived"} value={formatOptionalDistance(satellite.apogeeKm ?? envelope?.result.derivedApogeeKm, units, locale)} />
          <AnalysisMetric label={t("dynamics.eccentricity")} source="source" value={formatNumber(satellite.eccentricity, locale, { maximumFractionDigits: 8 })} />
          <AnalysisMetric label={t("dynamics.raan")} source="source" value={`${formatNumber(satellite.rightAscensionDegrees, locale, { maximumFractionDigits: 4 })}°`} />
          <AnalysisMetric label={t("dynamics.argument")} source="source" value={`${formatNumber(satellite.argumentOfPerigeeDegrees, locale, { maximumFractionDigits: 4 })}°`} />
          <AnalysisMetric label={t("dynamics.meanAnomaly")} source="source" value={`${formatNumber(satellite.meanAnomalyDegrees, locale, { maximumFractionDigits: 4 })}°`} />
          <AnalysisMetric label={t("dynamics.bstar")} source="source" value={String(omm.BSTAR ?? "—")} />
          <AnalysisMetric label={t("dynamics.motionDerivative")} source="source" value={String(omm.MEAN_MOTION_DOT ?? "—")} />
        </div>
      </section>

      {envelope ? (
        <>
          <AnalysisRunSummary envelope={envelope} resultCount={envelope.result.samples.length} resultLabel={t("dynamics.timeline")} />
          <AnalysisWarnings warnings={envelope.warnings} />
          <AnalysisSectionHeading description={t("dynamics.timelineDescription")} title={t("dynamics.timeline")} />
          <div className="analysis-chart-grid">
            <ChartCard title={t("dynamics.altitude")}>
              <AnalysisTimeSeriesChart ariaLabel={t("dynamics.altitude")} locale={locale} onCursorIndexChange={setSelectedSampleIndex} series={chartSeries.altitude} timestampsUnixMs={timestamps} unit="km" />
            </ChartCard>
            <ChartCard title={t("dynamics.velocity")}>
              <AnalysisTimeSeriesChart ariaLabel={t("dynamics.velocity")} locale={locale} onCursorIndexChange={setSelectedSampleIndex} series={chartSeries.velocity} timestampsUnixMs={timestamps} unit="km/s" />
            </ChartCard>
            <ChartCard title={`${t("dynamics.latitude")} / ${t("dynamics.longitude")}`}>
              <AnalysisTimeSeriesChart ariaLabel={`${t("dynamics.latitude")} / ${t("dynamics.longitude")}`} locale={locale} onCursorIndexChange={setSelectedSampleIndex} series={chartSeries.position} timestampsUnixMs={timestamps} unit="°" />
            </ChartCard>
            <ChartCard title={t("dynamics.energy")}>
              <AnalysisTimeSeriesChart ariaLabel={t("dynamics.energy")} locale={locale} onCursorIndexChange={setSelectedSampleIndex} series={chartSeries.energy} timestampsUnixMs={timestamps} unit="km²/s²" />
            </ChartCard>
            <ChartCard title={t("dynamics.radius")}><OrbitSchematicCanvas ariaLabel={t("dynamics.radius")} samples={envelope.result.samples} selectedIndex={selectedSampleIndex} /></ChartCard>
          </div>
          <p className="analysis-provenance-line">{t("technical.provenance", { time: formatDateTime(envelope.generatedAtUnixMs, locale, "utc-only").primary })}</p>
        </>
      ) : <div className="analysis-empty-state">{t("status.noResult")}</div>}
    </section>
  );
}

function formatOptionalDistance(value: number | null | undefined, units: "metric" | "imperial", locale: string): string {
  return value === null || value === undefined ? "—" : formatDistanceFromKm(value, units, locale, 1);
}

function ChartCard({ children, title }: { children: React.ReactNode; title: string }) {
  return <article className="analysis-chart-card"><h3>{title}</h3>{children}</article>;
}
