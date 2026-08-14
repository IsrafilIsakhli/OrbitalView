import { useMemo, useState } from "react";
import { Delete24Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";

import { usePreferencesStore } from "@/features/settings/model/preferences";
import { formatDateTime, formatNumber } from "@/shared/i18n/formatters";

import { useAnalysisGroundStations, useDeleteAnalysisGroundStation, useSaveAnalysisGroundStation } from "../api/useAnalysisStorage";
import type { AnalysisEnvelope, GroundStationAccessResult, GroundStationInput } from "../domain/analysis";
import { AnalysisTimeSeriesChart } from "./AnalysisTimeSeriesChart";
import { AnalysisWarnings } from "./AnalysisWarnings";

interface GroundStationPanelProps {
  envelope: AnalysisEnvelope<GroundStationAccessResult> | null;
  onRun: (station: GroundStationInput, hours: number) => void;
}

const blankStation = {
  altitudeMeters: "0",
  downlinkFrequencyHz: "",
  latitudeDegrees: "40.4093",
  longitudeDegrees: "49.8671",
  minimumElevationDegrees: "10",
  name: "",
};

export function GroundStationPanel({ envelope, onRun }: GroundStationPanelProps) {
  const { t } = useTranslation("orbitalAnalysis");
  const locale = usePreferencesStore((state) => state.locale);
  const stations = useAnalysisGroundStations();
  const saveStation = useSaveAnalysisGroundStation();
  const deleteStation = useDeleteAnalysisGroundStation();
  const [selectedId, setSelectedId] = useState<string>("");
  const [selectedPassIndex, setSelectedPassIndex] = useState(0);
  const [horizonHours, setHorizonHours] = useState(24);
  const [form, setForm] = useState(blankStation);
  const effectiveSelectedId = selectedId || stations.data?.[0]?.id || "";
  const selected = stations.data?.find((station) => station.id === effectiveSelectedId) ?? null;
  const selectedPass = envelope?.result.passes[Math.min(selectedPassIndex, Math.max(0, (envelope?.result.passes.length ?? 1) - 1))] ?? null;
  const timestamps = useMemo(() => selectedPass?.samples.map((sample) => sample.timestampUnixMs) ?? [], [selectedPass]);
  const passSeries = useMemo(() => {
    const samples = selectedPass?.samples ?? [];
    return {
      azimuth: [{ color: "#ffb85c", label: t("technical.azimuth"), spanGaps: false, values: withCircularGaps(samples.map((sample) => sample.azimuthDegrees)) }],
      doppler: [{ color: "#ffca70", label: t("station.doppler"), values: samples.map((sample) => sample.dopplerShiftHz ?? 0) }],
      elevation: [{ color: "#79e6ff", label: t("station.maximumElevation"), values: samples.map((sample) => sample.elevationDegrees) }],
      radialVelocity: [{ color: "#9a8cff", label: t("station.radialVelocity"), values: samples.map((sample) => sample.radialVelocityKmPerSecond) }],
      range: [{ color: "#71df9a", label: t("station.range"), values: samples.map((sample) => sample.rangeKm) }],
    };
  }, [selectedPass, t]);

  return (
    <section className="analysis-panel-stack analysis-station-layout">
      <aside className="analysis-station-sidebar">
        <h2>{t("station.profiles")}</h2>
        <div className="analysis-station-list">
          {stations.data?.map((station) => (
            <button aria-pressed={station.id === effectiveSelectedId} key={station.id} onClick={() => setSelectedId(station.id)} type="button">
              <span>{station.name}</span><small>{t("technical.coordinates", { latitude: station.latitudeDegrees.toFixed(3), longitude: station.longitudeDegrees.toFixed(3) })}</small>
            </button>
          ))}
        </div>
        {stations.isError && <p className="analysis-storage-error">{t("errors.storage")}</p>}
        <form className="analysis-station-form" onSubmit={(event) => {
          event.preventDefault();
          void saveStation.mutateAsync({
            altitudeMeters: Number(form.altitudeMeters),
            downlinkFrequencyHz: form.downlinkFrequencyHz ? Number(form.downlinkFrequencyHz) : null,
            latitudeDegrees: Number(form.latitudeDegrees),
            longitudeDegrees: Number(form.longitudeDegrees),
            minimumElevationDegrees: Number(form.minimumElevationDegrees),
            name: form.name,
          }).then((saved) => { setSelectedId(saved.id); setForm(blankStation); });
        }}>
          <h3>{t("station.newProfile")}</h3>
          <StationInput label={t("station.name")} onChange={(value) => setForm((current) => ({ ...current, name: value }))} required value={form.name} />
          <div className="analysis-form-pair">
            <StationInput label={t("station.latitude")} max="90" min="-90" onChange={(value) => setForm((current) => ({ ...current, latitudeDegrees: value }))} step="any" type="number" value={form.latitudeDegrees} />
            <StationInput label={t("station.longitude")} max="180" min="-180" onChange={(value) => setForm((current) => ({ ...current, longitudeDegrees: value }))} step="any" type="number" value={form.longitudeDegrees} />
          </div>
          <StationInput label={t("station.altitude")} max="10000" min="-500" onChange={(value) => setForm((current) => ({ ...current, altitudeMeters: value }))} step="any" type="number" value={form.altitudeMeters} />
          <StationInput label={t("station.minimumElevation")} max="90" min="0" onChange={(value) => setForm((current) => ({ ...current, minimumElevationDegrees: value }))} step="any" type="number" value={form.minimumElevationDegrees} />
          <StationInput label={t("station.frequency")} min="1" onChange={(value) => setForm((current) => ({ ...current, downlinkFrequencyHz: value }))} step="any" type="number" value={form.downlinkFrequencyHz} />
          <button className="secondary-button" disabled={saveStation.isPending} type="submit">{t("actions.saveStation")}</button>
          <p>{t("station.saveHint")}</p>
        </form>
      </aside>

      <div className="analysis-station-main">
        <div className="analysis-control-card">
          <label><span>{t("station.prediction")}</span><select value={horizonHours} onChange={(event) => setHorizonHours(Number(event.target.value))}><option value={24}>{t("station.day")}</option><option value={72}>{t("station.threeDays")}</option><option value={168}>{t("station.week")}</option></select></label>
          <button className="primary-button" disabled={!selected} onClick={() => selected && onRun(selected, horizonHours)} type="button">{t("actions.run")}</button>
          {selected && <button aria-label={t("actions.deleteStation")} className="icon-button" onClick={() => void deleteStation.mutateAsync(selected.id).then(() => setSelectedId(""))} type="button"><Delete24Regular aria-hidden /></button>}
        </div>
        {envelope ? (
          <>
            <AnalysisWarnings warnings={envelope.warnings} />
            <div className="analysis-metric-grid analysis-metric-grid--compact">
              <Metric label={t("station.passes")} value={formatNumber(envelope.result.passes.length, locale)} />
              <Metric label={t("station.maximumElevation")} value={selectedPass ? `${formatNumber(selectedPass.maximumElevationDegrees, locale, { maximumFractionDigits: 2 })}°` : "—"} />
              <Metric label={t("station.range")} value={selectedPass ? `${formatNumber(selectedPass.minimumRangeKm, locale, { maximumFractionDigits: 1 })} km` : "—"} />
              <Metric label={t("station.duration")} value={selectedPass ? `${formatNumber(selectedPass.durationSeconds, locale, { maximumFractionDigits: 0 })} s` : "—"} />
            </div>
            {selectedPass ? <div className="analysis-chart-grid"><article className="analysis-chart-card"><h3>{t("station.maximumElevation")}</h3><AnalysisTimeSeriesChart ariaLabel={t("station.maximumElevation")} locale={locale} series={passSeries.elevation} timestampsUnixMs={timestamps} unit="°" /></article><article className="analysis-chart-card"><h3>{t("technical.azimuth")}</h3><AnalysisTimeSeriesChart ariaLabel={t("technical.azimuth")} locale={locale} series={passSeries.azimuth} timestampsUnixMs={timestamps} unit="°" /></article><article className="analysis-chart-card"><h3>{t("station.range")}</h3><AnalysisTimeSeriesChart ariaLabel={t("station.range")} locale={locale} series={passSeries.range} timestampsUnixMs={timestamps} unit="km" /></article><article className="analysis-chart-card"><h3>{t("station.radialVelocity")}</h3><AnalysisTimeSeriesChart ariaLabel={t("station.radialVelocity")} locale={locale} series={passSeries.radialVelocity} timestampsUnixMs={timestamps} unit="km/s" /></article>{selectedPass.samples.some((sample) => sample.dopplerShiftHz !== null) && <article className="analysis-chart-card"><h3>{t("station.doppler")}</h3><AnalysisTimeSeriesChart ariaLabel={t("station.doppler")} locale={locale} series={passSeries.doppler} timestampsUnixMs={timestamps} unit="Hz" /></article>}</div> : <div className="analysis-empty-state">{t("station.noPass")}</div>}
            <div className="analysis-table-scroll"><table><thead><tr><th>{t("station.aos")}</th><th>{t("station.tca")}</th><th>{t("station.los")}</th><th>{t("station.maximumElevation")}</th><th>{t("station.range")}</th></tr></thead><tbody>{envelope.result.passes.map((pass, index) => <tr data-selected={index === selectedPassIndex} key={pass.aosUnixMs}><td><button aria-pressed={index === selectedPassIndex} className="analysis-table-link" onClick={() => setSelectedPassIndex(index)} type="button">{formatDateTime(pass.aosUnixMs, locale, "utc-only").primary}</button></td><td>{formatDateTime(pass.tcaUnixMs, locale, "utc-only").primary}</td><td>{formatDateTime(pass.losUnixMs, locale, "utc-only").primary}</td><td>{formatNumber(pass.maximumElevationDegrees, locale, { maximumFractionDigits: 2 })}°</td><td>{`${formatNumber(pass.minimumRangeKm, locale, { maximumFractionDigits: 1 })} ${t("units.km")}`}</td></tr>)}</tbody></table></div>
          </>
        ) : <div className="analysis-empty-state">{selected ? t("status.noResult") : t("station.newProfile")}</div>}
      </div>
    </section>
  );
}

function StationInput({ label, onChange, ...input }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> & { label: string; onChange: (value: string) => void }) {
  return <label><span>{label}</span><input {...input} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Metric({ label, value }: { label: string; value: string }) { return <article className="analysis-metric"><span>{label}</span><strong>{value}</strong></article>; }

function withCircularGaps(values: number[]): number[] {
  return values.map((value, index) => index > 0 && Math.abs(value - (values[index - 1] ?? value)) > 180 ? Number.NaN : value);
}
