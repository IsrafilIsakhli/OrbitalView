import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { SatelliteRecord } from "@/features/satellites/domain/satellite";
import { usePreferencesStore } from "@/features/settings/model/preferences";
import { formatDateTime, formatNumber } from "@/shared/i18n/formatters";

import type { AnalysisEnvelope, ProximityResult } from "../domain/analysis";
import { AnalysisMetric, AnalysisRunSummary, AnalysisSectionHeading } from "./AnalysisOutput";
import { AnalysisWarnings } from "./AnalysisWarnings";

interface ProximityPanelProps {
  envelope: AnalysisEnvelope<ProximityResult> | null;
  onRun: (hours: number, thresholdKm: number) => void;
  onSelect: (satelliteId: string) => void;
  onShowEarthAtTime: (timestampUnixMs: number) => void;
  running: boolean;
  satellitesById: ReadonlyMap<string, SatelliteRecord>;
}

export function ProximityPanel({ envelope, onRun, onSelect, onShowEarthAtTime, running, satellitesById }: ProximityPanelProps) {
  const { t } = useTranslation("orbitalAnalysis");
  const locale = usePreferencesStore((state) => state.locale);
  const [horizon, setHorizon] = useState(24);
  const [threshold, setThreshold] = useState(25);
  const [selectedEventKey, setSelectedEventKey] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<"distance" | "time">("distance");
  const events = useMemo(() => {
    const values = [...(envelope?.result.events ?? [])];
    return values.sort((left, right) => sortMode === "time"
      ? left.tcaUnixMs - right.tcaUnixMs
      : left.missDistanceKm - right.missDistanceKm);
  }, [envelope, sortMode]);
  const selectedEvent = events.find((event) => `${event.secondaryId}:${event.tcaUnixMs}` === selectedEventKey) ?? events[0] ?? null;
  const selectedSecondary = selectedEvent ? satellitesById.get(selectedEvent.secondaryId) : null;
  return (
    <section className="analysis-panel-stack">
      <div data-analysis-input className="analysis-control-card">
        <label><span>{t("proximity.horizon")}</span><select value={horizon} onChange={(event) => setHorizon(Number(event.target.value))}>{[6, 12, 24].map((value) => <option key={value} value={value}>{t("technical.hours", { value })}</option>)}</select></label>
        <label><span>{t("proximity.threshold")}</span><select value={threshold} onChange={(event) => setThreshold(Number(event.target.value))}>{[10, 25, 100, 250].map((value) => <option key={value} value={value}>{`${value} ${t("units.km")}`}</option>)}</select></label>
        <button className="primary-button" disabled={running} onClick={() => onRun(horizon, threshold)} type="button">{running ? t("status.running") : t("actions.run")}</button>
      </div>
      <aside className="analysis-scientific-disclaimer"><strong>{t("proximity.title")}</strong><span>{t("proximity.disclaimer")}</span></aside>
      {envelope ? (
        <>
          <AnalysisRunSummary envelope={envelope} resultCount={envelope.result.events.length} resultLabel={t("proximity.events")} />
          <AnalysisWarnings warnings={envelope.warnings} />
          <AnalysisSectionHeading description={t("proximity.outputDescription")} title={t("proximity.outputTitle")} />
          <div className="analysis-metric-grid analysis-metric-grid--compact"><AnalysisMetric label={t("proximity.candidateCount")} value={formatNumber(envelope.result.candidateCount, locale)} /><AnalysisMetric emphasis="primary" label={t("proximity.screenedCount")} value={formatNumber(envelope.result.screenedObjectCount, locale)} /><AnalysisMetric emphasis="primary" label={t("proximity.events")} value={formatNumber(envelope.result.events.length, locale)} /></div>
          {selectedEvent && <section className="analysis-conjunction-inspector">
            <header><div><span>{t("proximity.selectedEvent")}</span><strong>{selectedSecondary?.name ?? selectedEvent.secondaryId}</strong><small>{formatDateTime(selectedEvent.tcaUnixMs, locale, "utc-only").primary}</small></div><span data-band={distanceBand(selectedEvent.missDistanceKm)}>{t(`proximity.bands.${distanceBand(selectedEvent.missDistanceKm)}`)}</span></header>
            <div className="analysis-conjunction-vector">
              <AnalysisMetric emphasis="primary" label={t("proximity.missDistance")} value={`${formatNumber(selectedEvent.missDistanceKm, locale, { maximumFractionDigits: 3 })} ${t("units.km")}`} />
              <AnalysisMetric label={t("proximity.relativeVelocity")} value={`${formatNumber(selectedEvent.relativeVelocityKmPerSecond, locale, { maximumFractionDigits: 4 })} ${t("units.kmPerSecond")}`} />
              <AnalysisMetric label={t("proximity.radial")} value={`${formatNumber(selectedEvent.radialSeparationKm, locale, { maximumFractionDigits: 3 })} ${t("units.km")}`} />
              <AnalysisMetric label={t("proximity.alongTrack")} value={`${formatNumber(selectedEvent.alongTrackSeparationKm, locale, { maximumFractionDigits: 3 })} ${t("units.km")}`} />
              <AnalysisMetric label={t("proximity.crossTrack")} value={`${formatNumber(selectedEvent.crossTrackSeparationKm, locale, { maximumFractionDigits: 3 })} ${t("units.km")}`} />
            </div>
            <footer><button className="primary-button" onClick={() => onShowEarthAtTime(selectedEvent.tcaUnixMs)} type="button">{t("actions.openTcaOnEarth")}</button><button className="secondary-button" onClick={() => onSelect(selectedEvent.secondaryId)} type="button">{t("proximity.analyzeSecondary")}</button><span>{t("proximity.bandNotice")}</span></footer>
          </section>}
          {events.length ? <><div className="analysis-table-toolbar"><strong>{t("proximity.eventQueue")}</strong><label><span>{t("proximity.sort")}</span><select onChange={(event) => setSortMode(event.target.value as typeof sortMode)} value={sortMode}><option value="distance">{t("proximity.sortDistance")}</option><option value="time">{t("proximity.sortTime")}</option></select></label></div><div className="analysis-table-scroll"><table><thead><tr><th>{t("proximity.secondary")}</th><th>{t("proximity.tca")}</th><th>{t("proximity.missDistance")}</th><th>{t("proximity.relativeVelocity")}</th><th>{t("proximity.radial")}</th><th>{t("proximity.alongTrack")}</th><th>{t("proximity.crossTrack")}</th><th>{t("proximity.inspect")}</th></tr></thead><tbody>{events.map((event) => { const secondary = satellitesById.get(event.secondaryId); const key = `${event.secondaryId}:${event.tcaUnixMs}`; return <tr data-selected={key === `${selectedEvent?.secondaryId}:${selectedEvent?.tcaUnixMs}`} key={key}><td><button className="analysis-table-link" onClick={() => setSelectedEventKey(key)} type="button">{secondary?.name ?? event.secondaryId}<small>NORAD {secondary?.noradId ?? "—"}</small></button></td><td>{formatDateTime(event.tcaUnixMs, locale, "utc-only").primary}</td><td>{`${formatNumber(event.missDistanceKm, locale, { maximumFractionDigits: 3 })} ${t("units.km")}`}</td><td>{`${formatNumber(event.relativeVelocityKmPerSecond, locale, { maximumFractionDigits: 4 })} ${t("units.kmPerSecond")}`}</td><td>{`${formatNumber(event.radialSeparationKm, locale, { maximumFractionDigits: 3 })} ${t("units.km")}`}</td><td>{`${formatNumber(event.alongTrackSeparationKm, locale, { maximumFractionDigits: 3 })} ${t("units.km")}`}</td><td>{`${formatNumber(event.crossTrackSeparationKm, locale, { maximumFractionDigits: 3 })} ${t("units.km")}`}</td><td><button className="analysis-inline-action" onClick={() => onShowEarthAtTime(event.tcaUnixMs)} type="button">{t("actions.openTcaOnEarth")}</button></td></tr>; })}</tbody></table></div></> : <div className="analysis-empty-state">{t("proximity.noEvents")}</div>}
        </>
      ) : <div className="analysis-empty-state">{t("status.noResult")}</div>}
    </section>
  );
}

function distanceBand(distanceKm: number): "close" | "review" | "context" {
  if (distanceKm <= 10) return "close";
  if (distanceKm <= 25) return "review";
  return "context";
}
