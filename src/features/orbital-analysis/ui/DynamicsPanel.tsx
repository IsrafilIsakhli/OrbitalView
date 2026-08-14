import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { SatelliteRecord } from "@/features/satellites/domain/satellite";
import { usePreferencesStore } from "@/features/settings/model/preferences";
import { formatDateTime, formatNumber } from "@/shared/i18n/formatters";
import { formatDistanceFromKm, formatOrbitalSpeed } from "@/shared/formatting/units";

import type { AnalysisEnvelope, DynamicsResult } from "../domain/analysis";
import { AnalysisTimeSeriesChart } from "./AnalysisTimeSeriesChart";
import { AnalysisWarnings } from "./AnalysisWarnings";
import { OrbitSchematicCanvas } from "./OrbitSchematicCanvas";

interface DynamicsPanelProps {
  envelope: AnalysisEnvelope<DynamicsResult> | null;
  onRun: (hours: number, samples: number) => void;
  satellite: SatelliteRecord;
}

const intervals = [
  { hours: 0, key: "oneOrbit", samples: 361 },
  { hours: 6, key: "sixHours", samples: 361 },
  { hours: 24, key: "day", samples: 721 },
  { hours: 168, key: "week", samples: 1_440 },
] as const;

export function DynamicsPanel({ envelope, onRun, satellite }: DynamicsPanelProps) {
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
        { color: "#ffb85c", dash: [6, 4], label: t("dynamics.longitude"), values: samples.map((sample) => sample.longitudeDegrees) },
      ],
      velocity: [{ color: "#71df9a", label: t("dynamics.velocity"), values: samples.map((sample) => sample.velocityKmPerSecond) }],
    };
  }, [envelope, t]);
  const omm = satellite.omm as unknown as Record<string, number | string>;

  return (
    <section className="analysis-panel-stack">
      <div className="analysis-control-card">
        <label>
          <span>{t("dynamics.interval")}</span>
          <select value={intervalKey} onChange={(event) => setIntervalKey(event.target.value as typeof intervalKey)}>
            {intervals.map((item) => <option key={item.key} value={item.key}>{t(`dynamics.${item.key}`)}</option>)}
          </select>
        </label>
        <button className="primary-button" onClick={() => onRun(selectedInterval.hours || satellite.periodMinutes / 60, selectedInterval.samples)} type="button">
          {t("actions.run")}
        </button>
      </div>

      <div className="analysis-metric-grid">
        <Metric label={t("dynamics.altitude")} value={firstSample ? formatDistanceFromKm(firstSample.altitudeKm, units, locale, 2) : "—"} />
        <Metric label={t("dynamics.velocity")} value={firstSample ? formatOrbitalSpeed(firstSample.velocityKmPerSecond, units, locale, 3) : "—"} />
        <Metric label={t("dynamics.period")} value={`${formatNumber(satellite.periodMinutes, locale, { maximumFractionDigits: 2 })} ${t("units.minutes")}`} source />
        <Metric label={t("dynamics.inclination")} value={`${formatNumber(satellite.inclinationDegrees, locale, { maximumFractionDigits: 4 })}°`} source />
        <Metric label={t("dynamics.perigee")} value={formatDistanceFromKm(satellite.perigeeKm ?? envelope?.result.derivedPerigeeKm ?? 0, units, locale, 1)} source={satellite.perigeeKm !== null} />
        <Metric label={t("dynamics.apogee")} value={formatDistanceFromKm(satellite.apogeeKm ?? envelope?.result.derivedApogeeKm ?? 0, units, locale, 1)} source={satellite.apogeeKm !== null} />
        <Metric label={t("dynamics.eccentricity")} value={formatNumber(satellite.eccentricity, locale, { maximumFractionDigits: 8 })} source />
        <Metric label={t("dynamics.raan")} value={`${formatNumber(satellite.rightAscensionDegrees, locale, { maximumFractionDigits: 4 })}°`} source />
        <Metric label={t("dynamics.argument")} value={`${formatNumber(satellite.argumentOfPerigeeDegrees, locale, { maximumFractionDigits: 4 })}°`} source />
        <Metric label={t("dynamics.meanAnomaly")} value={`${formatNumber(satellite.meanAnomalyDegrees, locale, { maximumFractionDigits: 4 })}°`} source />
        <Metric label={t("dynamics.bstar")} value={String(omm.BSTAR ?? "—")} source />
        <Metric label={t("dynamics.motionDerivative")} value={String(omm.MEAN_MOTION_DOT ?? "—")} source />
      </div>

      {envelope ? (
        <>
          <AnalysisWarnings warnings={envelope.warnings} />
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

function Metric({ label, source = false, value }: { label: string; source?: boolean; value: string }) {
  const { t } = useTranslation("orbitalAnalysis");
  return <article className="analysis-metric"><span>{label}</span><strong>{value}</strong><small>{t(source ? "dynamics.sourceData" : "dynamics.derived")}</small></article>;
}

function ChartCard({ children, title }: { children: React.ReactNode; title: string }) {
  return <article className="analysis-chart-card"><h3>{title}</h3>{children}</article>;
}
