import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { satelliteCategories, type SatelliteCategory } from "@/features/satellites/domain/satellite";
import { usePreferencesStore } from "@/features/settings/model/preferences";
import { formatNumber } from "@/shared/i18n/formatters";

import type { AnalysisEnvelope, ConstellationFilter, ConstellationResult } from "../domain/analysis";
import { AnalysisWarnings } from "./AnalysisWarnings";
import { ConstellationCanvas } from "./ConstellationCanvas";

interface ConstellationPanelProps {
  envelope: AnalysisEnvelope<ConstellationResult> | null;
  onRun: (filter: ConstellationFilter) => void;
  onSelect: (satelliteId: string) => void;
  selectedId: string;
}

const emptyBand = { maximum: "", minimum: "" };

export function ConstellationPanel({ envelope, onRun, onSelect, selectedId }: ConstellationPanelProps) {
  const { t } = useTranslation(["orbitalAnalysis", "satellites"]);
  const locale = usePreferencesStore((state) => state.locale);
  const [category, setCategory] = useState<"all" | SatelliteCategory>("all");
  const [owner, setOwner] = useState("");
  const [objectType, setObjectType] = useState("");
  const [status, setStatus] = useState("");
  const [altitude, setAltitude] = useState(emptyBand);
  const [inclination, setInclination] = useState(emptyBand);
  const points = envelope?.result.points ?? [];
  const topCategories = useMemo(
    () => Object.entries(envelope?.result.categoryCounts ?? {}).sort((a, b) => b[1] - a[1]),
    [envelope],
  );

  const run = () => onRun({
    altitudeMaximumKm: numberOrNull(altitude.maximum),
    altitudeMinimumKm: numberOrNull(altitude.minimum),
    categories: category === "all" ? [] : [category],
    inclinationMaximumDegrees: numberOrNull(inclination.maximum),
    inclinationMinimumDegrees: numberOrNull(inclination.minimum),
    objectTypes: splitFilter(objectType),
    operationalStatuses: splitFilter(status),
    ownerCodes: splitFilter(owner),
  });

  return (
    <section className="analysis-panel-stack">
      <div className="analysis-filter-grid">
        <label><span>{t("constellation.category")}</span><select value={category} onChange={(event) => setCategory(event.target.value as typeof category)}><option value="all">{t("constellation.all")}</option>{satelliteCategories.map((item) => <option key={item} value={item}>{t(`satellites:category.${item}`)}</option>)}</select></label>
        <label><span>{t("constellation.owner")}</span><input onChange={(event) => setOwner(event.target.value)} placeholder={t("constellation.all")} value={owner} /></label>
        <label><span>{t("constellation.objectType")}</span><input onChange={(event) => setObjectType(event.target.value)} placeholder={t("constellation.all")} value={objectType} /></label>
        <label><span>{t("constellation.status")}</span><input onChange={(event) => setStatus(event.target.value)} placeholder={t("constellation.all")} value={status} /></label>
        <BandInput label={t("constellation.altitudeBand")} maximumLabel={t("constellation.maximum")} minimumLabel={t("constellation.minimum")} onChange={setAltitude} value={altitude} />
        <BandInput label={t("constellation.inclinationBand")} maximumLabel={t("constellation.maximum")} minimumLabel={t("constellation.minimum")} onChange={setInclination} value={inclination} />
        <button className="primary-button" onClick={run} type="button">{t("actions.run")}</button>
      </div>
      <p className="analysis-derived-notice">{t("constellation.derivedNotice")}</p>
      {envelope ? (
        <>
          <AnalysisWarnings warnings={envelope.warnings} />
          <div className="analysis-metric-grid analysis-metric-grid--compact">
            <Metric label={t("constellation.points")} value={formatNumber(points.length, locale)} />
            <Metric label={t("constellation.catalog")} value={formatNumber(envelope.result.totalCatalogCount, locale)} />
            {topCategories.slice(0, 4).map(([label, value]) => <Metric key={label} label={t(`satellites:category.${label as SatelliteCategory}` as const)} value={formatNumber(value, locale)} />)}
          </div>
          <div className="analysis-chart-grid">
            <article className="analysis-chart-card"><h3>{t("constellation.scatter")}</h3><ConstellationCanvas ariaLabel={t("constellation.scatter")} mode="scatter" onSelect={onSelect} points={points} selectedId={selectedId} /></article>
            <article className="analysis-chart-card"><h3>{t("constellation.raan")}</h3><ConstellationCanvas ariaLabel={t("constellation.raan")} mode="polar" onSelect={onSelect} points={points} selectedId={selectedId} /></article>
          </div>
          <details className="analysis-chart-table">
            <summary>{t("constellation.points")}</summary>
            <div className="analysis-table-scroll"><table><thead><tr><th>{t("constellation.category")}</th><th>{t("constellation.owner")}</th><th>{t("dynamics.altitude")}</th><th>{t("dynamics.inclination")}</th><th>{t("dynamics.raan")}</th></tr></thead><tbody>{points.slice(0, 100).map((point) => <tr key={point.id}><td><button className="analysis-table-link" onClick={() => onSelect(point.id)} type="button">{point.name}<small>NORAD {point.noradId}</small></button></td><td>{point.ownerCode ?? "—"}</td><td>{formatNumber(point.altitudeKm, locale, { maximumFractionDigits: 1 })}</td><td>{formatNumber(point.inclinationDegrees, locale, { maximumFractionDigits: 2 })}</td><td>{formatNumber(point.rightAscensionDegrees, locale, { maximumFractionDigits: 2 })}</td></tr>)}</tbody></table></div>
          </details>
          <div className="analysis-composition-grid">{envelope.result.ownerCounts.slice(0, 12).map((ownerItem) => <article key={ownerItem.ownerCode}><strong>{ownerItem.ownerCode}</strong><span>{formatNumber(ownerItem.count, locale)}</span></article>)}</div>
        </>
      ) : <div className="analysis-empty-state">{t("status.noResult")}</div>}
    </section>
  );
}

function BandInput({ label, maximumLabel, minimumLabel, onChange, value }: { label: string; maximumLabel: string; minimumLabel: string; onChange: (value: typeof emptyBand) => void; value: typeof emptyBand }) {
  return <fieldset className="analysis-band-input"><legend>{label}</legend><input aria-label={`${label}: ${minimumLabel}`} onChange={(event) => onChange({ ...value, minimum: event.target.value })} placeholder={minimumLabel} type="number" value={value.minimum} /><input aria-label={`${label}: ${maximumLabel}`} onChange={(event) => onChange({ ...value, maximum: event.target.value })} placeholder={maximumLabel} type="number" value={value.maximum} /></fieldset>;
}

function splitFilter(value: string): string[] { return value.trim() ? value.split(",").map((part) => part.trim()).filter(Boolean) : []; }
function numberOrNull(value: string): number | null { const parsed = Number(value); return value.trim() && Number.isFinite(parsed) ? parsed : null; }
function Metric({ label, value }: { label: string; value: string }) { return <article className="analysis-metric"><span>{label}</span><strong>{value}</strong></article>; }
