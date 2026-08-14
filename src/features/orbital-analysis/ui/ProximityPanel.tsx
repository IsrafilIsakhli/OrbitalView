import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { SatelliteRecord } from "@/features/satellites/domain/satellite";
import { usePreferencesStore } from "@/features/settings/model/preferences";
import { formatDateTime, formatNumber } from "@/shared/i18n/formatters";

import type { AnalysisEnvelope, ProximityResult } from "../domain/analysis";
import { AnalysisWarnings } from "./AnalysisWarnings";

interface ProximityPanelProps {
  envelope: AnalysisEnvelope<ProximityResult> | null;
  onRun: (hours: number, thresholdKm: number) => void;
  onSelect: (satelliteId: string) => void;
  satellitesById: ReadonlyMap<string, SatelliteRecord>;
}

export function ProximityPanel({ envelope, onRun, onSelect, satellitesById }: ProximityPanelProps) {
  const { t } = useTranslation("orbitalAnalysis");
  const locale = usePreferencesStore((state) => state.locale);
  const [horizon, setHorizon] = useState(24);
  const [threshold, setThreshold] = useState(25);
  return (
    <section className="analysis-panel-stack">
      <div className="analysis-control-card">
        <label><span>{t("proximity.horizon")}</span><select value={horizon} onChange={(event) => setHorizon(Number(event.target.value))}>{[6, 12, 24].map((value) => <option key={value} value={value}>{t("technical.hours", { value })}</option>)}</select></label>
        <label><span>{t("proximity.threshold")}</span><select value={threshold} onChange={(event) => setThreshold(Number(event.target.value))}>{[10, 25, 100, 250].map((value) => <option key={value} value={value}>{`${value} ${t("units.km")}`}</option>)}</select></label>
        <button className="primary-button" onClick={() => onRun(horizon, threshold)} type="button">{t("actions.run")}</button>
      </div>
      <aside className="analysis-scientific-disclaimer"><strong>{t("proximity.title")}</strong><span>{t("proximity.disclaimer")}</span></aside>
      {envelope ? (
        <>
          <AnalysisWarnings warnings={envelope.warnings} />
          <div className="analysis-metric-grid analysis-metric-grid--compact"><Metric label={t("proximity.candidateCount")} value={formatNumber(envelope.result.candidateCount, locale)} /><Metric label={t("proximity.screenedCount")} value={formatNumber(envelope.result.screenedObjectCount, locale)} /><Metric label={t("proximity.events")} value={formatNumber(envelope.result.events.length, locale)} /></div>
          {envelope.result.events.length ? <div className="analysis-table-scroll"><table><thead><tr><th>{t("proximity.secondary")}</th><th>{t("proximity.tca")}</th><th>{t("proximity.missDistance")}</th><th>{t("proximity.relativeVelocity")}</th><th>{t("proximity.radial")}</th><th>{t("proximity.alongTrack")}</th><th>{t("proximity.crossTrack")}</th></tr></thead><tbody>{envelope.result.events.map((event) => { const secondary = satellitesById.get(event.secondaryId); return <tr key={`${event.secondaryId}:${event.tcaUnixMs}`}><td><button className="analysis-table-link" onClick={() => onSelect(event.secondaryId)} type="button">{secondary?.name ?? event.secondaryId}<small>NORAD {secondary?.noradId ?? "—"}</small></button></td><td>{formatDateTime(event.tcaUnixMs, locale, "utc-only").primary}</td><td>{`${formatNumber(event.missDistanceKm, locale, { maximumFractionDigits: 3 })} ${t("units.km")}`}</td><td>{`${formatNumber(event.relativeVelocityKmPerSecond, locale, { maximumFractionDigits: 4 })} ${t("units.kmPerSecond")}`}</td><td>{`${formatNumber(event.radialSeparationKm, locale, { maximumFractionDigits: 3 })} ${t("units.km")}`}</td><td>{`${formatNumber(event.alongTrackSeparationKm, locale, { maximumFractionDigits: 3 })} ${t("units.km")}`}</td><td>{`${formatNumber(event.crossTrackSeparationKm, locale, { maximumFractionDigits: 3 })} ${t("units.km")}`}</td></tr>; })}</tbody></table></div> : <div className="analysis-empty-state">{t("proximity.noEvents")}</div>}
        </>
      ) : <div className="analysis-empty-state">{t("status.noResult")}</div>}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <article className="analysis-metric"><span>{label}</span><strong>{value}</strong></article>; }
