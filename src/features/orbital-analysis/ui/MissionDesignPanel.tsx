import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { SatelliteRecord } from "@/features/satellites/domain/satellite";
import { usePreferencesStore } from "@/features/settings/model/preferences";
import { formatNumber } from "@/shared/i18n/formatters";

import { designMissionScenario, type MissionDesignInput, type MissionDesignMode } from "../domain/missionDesign";
import { AnalysisMetric, AnalysisSectionHeading } from "./AnalysisOutput";

interface MissionDesignPanelProps {
  satellite: SatelliteRecord;
}

const defaults: MissionDesignInput = {
  mode: "altitude",
  phaseChangeDegrees: 5,
  phasingRevolutions: 1,
  spacecraftMassKg: null,
  specificImpulseSeconds: null,
  targetAltitudeKm: 550,
  targetInclinationDegrees: 53,
};

export function MissionDesignPanel({ satellite }: MissionDesignPanelProps) {
  const { t } = useTranslation("orbitalAnalysis");
  const locale = usePreferencesStore((state) => state.locale);
  const [input, setInput] = useState(defaults);
  const [runInput, setRunInput] = useState(defaults);
  const outcome = useMemo(() => {
    try {
      return { error: false, result: designMissionScenario(satellite, runInput) };
    } catch {
      return { error: true, result: null };
    }
  }, [runInput, satellite]);
  const inputChanged = JSON.stringify(input) !== JSON.stringify(runInput);
  const result = inputChanged ? null : outcome.result;

  const updateNumber = (key: keyof MissionDesignInput, value: string) => {
    const parsed = value === "" ? null : Number(value);
    setInput((current) => ({ ...current, [key]: parsed }));
  };

  return (
    <section className="analysis-panel-stack">
      <div className="analysis-simulation-banner">
        <div><span>{t("missionDesign.badge")}</span><strong>{t("missionDesign.title")}</strong></div>
        <p>{t("missionDesign.disclaimer")}</p>
      </div>
      <div className="analysis-filter-grid analysis-filter-grid--scenario">
        <label><span>{t("missionDesign.scenario")}</span><select value={input.mode} onChange={(event) => setInput((current) => ({ ...current, mode: event.target.value as MissionDesignMode }))}><option value="altitude">{t("missionDesign.altitudeChange")}</option><option value="planeChange">{t("missionDesign.planeChange")}</option><option value="phasing">{t("missionDesign.phasing")}</option></select></label>
        {input.mode === "altitude" && <NumberField label={t("missionDesign.targetAltitude")} onChange={(value) => updateNumber("targetAltitudeKm", value)} value={input.targetAltitudeKm} />}
        {input.mode === "planeChange" && <NumberField label={t("missionDesign.targetInclination")} onChange={(value) => updateNumber("targetInclinationDegrees", value)} value={input.targetInclinationDegrees} />}
        {input.mode === "phasing" && <><NumberField label={t("missionDesign.phaseChange")} onChange={(value) => updateNumber("phaseChangeDegrees", value)} value={input.phaseChangeDegrees} /><NumberField label={t("missionDesign.revolutions")} onChange={(value) => updateNumber("phasingRevolutions", value)} value={input.phasingRevolutions} /></>}
        <NumberField label={t("missionDesign.mass")} onChange={(value) => updateNumber("spacecraftMassKg", value)} optional value={input.spacecraftMassKg} />
        <NumberField label={t("missionDesign.isp")} onChange={(value) => updateNumber("specificImpulseSeconds", value)} optional value={input.specificImpulseSeconds} />
        <button className="primary-button" onClick={() => setRunInput(input)} type="button">{t("missionDesign.calculate")}</button>
      </div>
      {!inputChanged && outcome.error ? <div className="analysis-error-state">{t("missionDesign.invalid")}</div> : null}
      {result ? <>
        <AnalysisSectionHeading description={t("missionDesign.outputDescription")} title={t("missionDesign.output")} />
        <div className="analysis-metric-grid analysis-metric-grid--primary">
          <AnalysisMetric emphasis="primary" label={t("missionDesign.totalDeltaV")} source="derived" value={`${formatNumber(result.totalDeltaVMetersPerSecond, locale, { maximumFractionDigits: 2 })} m/s`} />
          <AnalysisMetric emphasis="primary" label={t("missionDesign.burnOne")} source="derived" value={`${formatNumber(result.burnOneMetersPerSecond, locale, { maximumFractionDigits: 2 })} m/s`} />
          <AnalysisMetric emphasis="primary" label={t("missionDesign.burnTwo")} source="derived" value={`${formatNumber(result.burnTwoMetersPerSecond, locale, { maximumFractionDigits: 2 })} m/s`} />
          <AnalysisMetric emphasis="primary" label={t("missionDesign.duration")} source="derived" value={formatDuration(result.durationSeconds, locale)} />
        </div>
        <div className="analysis-scenario-layout">
          <ScenarioOrbit result={result} title={t("missionDesign.orbitDiagram")} />
          <div className="analysis-metric-grid analysis-metric-grid--compact">
            <AnalysisMetric label={t("missionDesign.initialAltitude")} source="derived" value={`${formatNumber(result.initialAltitudeKm, locale, { maximumFractionDigits: 2 })} km`} />
            <AnalysisMetric label={t("missionDesign.plannedAltitude")} source="derived" value={`${formatNumber(result.targetAltitudeKm, locale, { maximumFractionDigits: 2 })} km`} />
            <AnalysisMetric label={t("missionDesign.initialInclination")} source="source" value={`${formatNumber(result.initialInclinationDegrees, locale, { maximumFractionDigits: 3 })}°`} />
            <AnalysisMetric label={t("missionDesign.plannedInclination")} source="derived" value={`${formatNumber(result.targetInclinationDegrees, locale, { maximumFractionDigits: 3 })}°`} />
            <AnalysisMetric label={t("missionDesign.propellant")} source="derived" value={result.propellantMassKg === null ? t("missionDesign.massRequired") : `${formatNumber(result.propellantMassKg, locale, { maximumFractionDigits: 2 })} kg`} />
          </div>
        </div>
      </> : null}
    </section>
  );
}

function NumberField({ label, onChange, optional = false, value }: { label: string; onChange: (value: string) => void; optional?: boolean; value: number | null }) {
  return <label><span>{label}</span><input inputMode="decimal" onChange={(event) => onChange(event.target.value)} placeholder={optional ? "—" : undefined} type="number" value={value ?? ""} /></label>;
}

function ScenarioOrbit({ result, title }: { result: NonNullable<ReturnType<typeof designMissionScenario>>; title: string }) {
  const initialRadius = Math.min(92, 54 + Math.max(0, result.initialAltitudeKm) / 2_000 * 24);
  const targetRadius = Math.min(106, 54 + Math.max(0, result.targetAltitudeKm) / 2_000 * 24);
  return <figure aria-label={title} className="analysis-scenario-orbit"><svg role="img" viewBox="0 0 280 220"><defs><radialGradient id="scenario-earth"><stop stopColor="#2f87bd" /><stop offset="1" stopColor="#0a263e" /></radialGradient></defs><circle cx="140" cy="110" fill="url(#scenario-earth)" r="42" /><circle cx="140" cy="110" fill="none" r={initialRadius} stroke="#79c7ff" strokeDasharray="5 5" /><circle cx="140" cy="110" fill="none" r={targetRadius} stroke="#71df9a" /><path d={`M ${140 + initialRadius} 110 Q 140 ${110 - Math.max(initialRadius, targetRadius) - 18} ${140 - targetRadius} 110`} fill="none" stroke="#ffb85c" strokeWidth="2" /><circle cx={140 + initialRadius} cy="110" fill="#79e6ff" r="4" /><circle cx={140 - targetRadius} cy="110" fill="#71df9a" r="4" /></svg><figcaption>{title}</figcaption></figure>;
}

function formatDuration(seconds: number, locale: string): string {
  if (seconds <= 0) return "—";
  if (seconds >= 3_600) return `${formatNumber(seconds / 3_600, locale, { maximumFractionDigits: 2 })} h`;
  return `${formatNumber(seconds / 60, locale, { maximumFractionDigits: 2 })} min`;
}
