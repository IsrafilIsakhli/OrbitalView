import { useDeferredValue, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { SatelliteRecord } from "@/features/satellites/domain/satellite";
import { usePreferencesStore } from "@/features/settings/model/preferences";
import { formatDateTime, formatNumber } from "@/shared/i18n/formatters";

import type { AnalysisEnvelope, CoverageResult, CoverageTarget } from "../domain/analysis";
import { AnalysisMetric, AnalysisRunSummary, AnalysisSectionHeading } from "./AnalysisOutput";
import { AnalysisWarnings } from "./AnalysisWarnings";

interface CoveragePanelProps {
  catalog: SatelliteRecord[];
  envelope: AnalysisEnvelope<CoverageResult> | null;
  onRun: (satelliteIds: string[], target: CoverageTarget, hours: number) => void;
  onShowEarthAtTime: (satelliteId: string, timestampUnixMs: number) => void;
  running: boolean;
  selected: SatelliteRecord;
}

export function CoveragePanel({ catalog, envelope, onRun, onShowEarthAtTime, running, selected }: CoveragePanelProps) {
  const { t } = useTranslation("orbitalAnalysis");
  const locale = usePreferencesStore((state) => state.locale);
  const [satelliteIds, setSatelliteIds] = useState<string[]>([selected.id]);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [hours, setHours] = useState(24);
  const [target, setTarget] = useState<CoverageTarget>({
    altitudeMeters: 28,
    latitudeDegrees: 40.4093,
    longitudeDegrees: 49.8671,
    minimumElevationDegrees: 10,
    name: "Baku",
  });
  const catalogById = useMemo(() => new Map(catalog.map((item) => [item.id, item])), [catalog]);
  const searchResults = useMemo(() => {
    const query = deferredSearch.trim().toLocaleUpperCase();
    if (!query) return [];
    return catalog.filter((item) => !satelliteIds.includes(item.id) && (
      item.name.toLocaleUpperCase().includes(query) || item.noradId.includes(query)
    )).slice(0, 8);
  }, [catalog, deferredSearch, satelliteIds]);
  const hourBuckets = useMemo(() => coverageHourBuckets(envelope?.result), [envelope]);

  const updateTarget = (key: keyof CoverageTarget, value: string) => {
    setTarget((current) => ({
      ...current,
      [key]: key === "name" ? value : Number(value),
    }));
  };

  return (
    <section className="analysis-panel-stack">
      <div className="analysis-scientific-disclaimer analysis-scientific-disclaimer--neutral">
        <strong>{t("coverage.disclaimerTitle")}</strong>
        <span>{t("coverage.disclaimer")}</span>
      </div>
      <div className="analysis-coverage-layout">
        <section data-analysis-input className="analysis-control-card analysis-coverage-target">
          <label><span>{t("coverage.targetName")}</span><input maxLength={80} onChange={(event) => updateTarget("name", event.target.value)} value={target.name} /></label>
          <label><span>{t("coverage.latitude")}</span><input inputMode="decimal" max="90" min="-90" onChange={(event) => updateTarget("latitudeDegrees", event.target.value)} type="number" value={target.latitudeDegrees} /></label>
          <label><span>{t("coverage.longitude")}</span><input inputMode="decimal" max="180" min="-180" onChange={(event) => updateTarget("longitudeDegrees", event.target.value)} type="number" value={target.longitudeDegrees} /></label>
          <label><span>{t("coverage.minimumElevation")}</span><input inputMode="decimal" max="90" min="0" onChange={(event) => updateTarget("minimumElevationDegrees", event.target.value)} type="number" value={target.minimumElevationDegrees} /></label>
          <label><span>{t("coverage.horizon")}</span><select onChange={(event) => setHours(Number(event.target.value))} value={hours}><option value={24}>{t("station.day")}</option><option value={72}>{t("station.threeDays")}</option><option value={168}>{t("station.week")}</option></select></label>
          <button className="primary-button" disabled={running || satelliteIds.length === 0} onClick={() => onRun(satelliteIds, target, hours)} type="button">{running ? t("status.running") : t("coverage.calculate")}</button>
        </section>
        <aside data-analysis-selection className="analysis-coverage-selector">
          <header><strong>{t("coverage.objects")}</strong><span>{satelliteIds.length}/24</span></header>
          <div className="analysis-coverage-chips">{satelliteIds.map((id) => { const item = catalogById.get(id); return <button aria-label={t("coverage.remove", { name: item?.name ?? id })} key={id} onClick={() => setSatelliteIds((current) => current.filter((value) => value !== id))} type="button"><span>{item?.name ?? id}</span><b>×</b></button>; })}</div>
          <input onChange={(event) => setSearch(event.target.value)} placeholder={t("coverage.searchObjects")} value={search} />
          {searchResults.length > 0 && <div className="analysis-coverage-results">{searchResults.map((item) => <button key={item.id} onClick={() => { setSatelliteIds((current) => current.length >= 24 ? current : [...current, item.id]); setSearch(""); }} type="button"><strong>{item.name}</strong><span>NORAD {item.noradId}</span></button>)}</div>}
        </aside>
      </div>

      {envelope ? <>
        <AnalysisRunSummary envelope={envelope} resultCount={envelope.result.passes.length} resultLabel={t("coverage.windows")} />
        <AnalysisWarnings warnings={envelope.warnings} />
        <div className="analysis-metric-grid analysis-metric-grid--primary">
          <AnalysisMetric emphasis="primary" label={t("coverage.availability")} source="derived" value={`${formatNumber(envelope.result.availabilityPercent, locale, { maximumFractionDigits: 2 })}%`} />
          <AnalysisMetric emphasis="primary" label={t("coverage.windows")} source="derived" value={formatNumber(envelope.result.windows.length, locale)} />
          <AnalysisMetric emphasis="primary" label={t("coverage.longestRevisit")} source="derived" value={envelope.result.longestRevisitSeconds === null ? "—" : formatDuration(envelope.result.longestRevisitSeconds, locale)} />
          <AnalysisMetric emphasis="primary" label={t("coverage.objectsUsed")} source="source" value={formatNumber(envelope.result.satelliteIds.length, locale)} />
        </div>
        <AnalysisSectionHeading description={t("coverage.heatmapDescription")} title={t("coverage.heatmap")} />
        <div aria-label={t("coverage.heatmap")} className="analysis-coverage-heatmap" role="img">{hourBuckets.map((minutes, hour) => <div key={hour} style={{ "--coverage-intensity": Math.min(1, minutes / 60) } as React.CSSProperties}><span>{String(hour).padStart(2, "0")}</span><i /><b>{formatNumber(minutes, locale, { maximumFractionDigits: 0 })} {t("units.minutes")}</b></div>)}</div>
        <AnalysisSectionHeading description={t("coverage.passDescription")} title={t("coverage.passTable")} />
        <div className="analysis-table-scroll"><table><thead><tr><th>{t("coverage.object")}</th><th>{t("station.aos")}</th><th>{t("station.tca")}</th><th>{t("station.los")}</th><th>{t("station.maximumElevation")}</th><th>{t("coverage.light")}</th></tr></thead><tbody>{envelope.result.passes.slice(0, 50).map((pass) => <tr key={`${pass.satelliteId}:${pass.aosUnixMs}`}><td><button className="analysis-table-link" onClick={() => onShowEarthAtTime(pass.satelliteId, pass.tcaUnixMs)} type="button">{pass.satelliteName}</button></td><td>{formatDateTime(pass.aosUnixMs, locale, "utc-only").primary}</td><td>{formatDateTime(pass.tcaUnixMs, locale, "utc-only").primary}</td><td>{formatDateTime(pass.losUnixMs, locale, "utc-only").primary}</td><td>{formatNumber(pass.maximumElevationDegrees, locale, { maximumFractionDigits: 1 })}°</td><td>{t(`coverage.${pass.lighting}`)} · {formatNumber(pass.sunElevationDegrees, locale, { maximumFractionDigits: 1 })}°</td></tr>)}</tbody></table></div>
      </> : <div className="analysis-empty-state">{t("coverage.empty")}</div>}
    </section>
  );
}

function coverageHourBuckets(result: CoverageResult | undefined): number[] {
  const buckets = Array.from({ length: 24 }, () => 0);
  if (!result) return buckets;
  for (const window of result.windows) {
    let cursor = window.startUnixMs;
    while (cursor < window.endUnixMs) {
      const date = new Date(cursor);
      const nextHour = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours() + 1);
      const end = Math.min(nextHour, window.endUnixMs);
      buckets[date.getUTCHours()]! += (end - cursor) / 60_000;
      cursor = end;
    }
  }
  return buckets;
}

function formatDuration(seconds: number, locale: string): string {
  if (seconds >= 86_400) return `${formatNumber(seconds / 86_400, locale, { maximumFractionDigits: 2 })} d`;
  if (seconds >= 3_600) return `${formatNumber(seconds / 3_600, locale, { maximumFractionDigits: 2 })} h`;
  return `${formatNumber(seconds / 60, locale, { maximumFractionDigits: 1 })} min`;
}
