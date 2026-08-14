import {
  ArrowExport24Regular,
  GlobeLocation24Regular,
  Search24Regular,
  Stop24Regular,
} from "@fluentui/react-icons";
import "@/styles/workspaces/orbital-analysis.css";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useActiveSatelliteCatalog } from "@/features/satellites/api/useActiveSatelliteCatalog";
import type { SatelliteRecord } from "@/features/satellites/domain/satellite";
import { usePreferencesStore } from "@/features/settings/model/preferences";
import { formatDateTime, formatNumber } from "@/shared/i18n/formatters";

import { exportOrbitalAnalysis } from "../api/analysisStorage";
import type {
  AnalysisEnvelope,
  AnalysisTab,
  ConstellationFilter,
  ConstellationResult,
  DynamicsResult,
  GroundStationAccessResult,
  ProximityResult,
} from "../domain/analysis";
import { analysisTabs } from "../domain/analysis";
import { analysisToCsv, analysisToJson } from "../domain/exportAnalysis";
import { useAnalysisSelectionStore } from "../model/analysisSelection";
import { useAnalysisWorker } from "../model/useAnalysisWorker";
import { ConstellationPanel } from "./ConstellationPanel";
import { DynamicsPanel } from "./DynamicsPanel";
import { GroundStationPanel } from "./GroundStationPanel";
import { ProximityPanel } from "./ProximityPanel";

interface OrbitalAnalysisWorkspaceProps {
  active?: boolean;
  onShowEarth: (satelliteId: string) => void;
}

export function OrbitalAnalysisWorkspace({ active = true, onShowEarth }: OrbitalAnalysisWorkspaceProps) {
  const { t } = useTranslation(["orbitalAnalysis", "common", "satellites"]);
  const locale = usePreferencesStore((state) => state.locale);
  const requestedSatelliteId = useAnalysisSelectionStore((state) => state.requestedSatelliteId);
  const requestedTab = useAnalysisSelectionStore((state) => state.requestedTab);
  const clearRequest = useAnalysisSelectionStore((state) => state.clearRequest);
  const catalogQuery = useActiveSatelliteCatalog();
  const catalog = catalogQuery.data;
  const [tab, setTab] = useState<AnalysisTab>("dynamics");
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const analysis = useAnalysisWorker(catalog, active);

  const satellitesById = useMemo(
    () => new Map(catalog?.satellites.map((satellite) => [satellite.id, satellite]) ?? []),
    [catalog],
  );
  const requestedSatellite = useMemo(() => catalog?.satellites.find((satellite) =>
    satellite.id === requestedSatelliteId || satellite.noradId === requestedSatelliteId,
  ) ?? null, [catalog, requestedSatelliteId]);
  const preferredSatellite = useMemo(() => catalog?.satellites.find(
    (satellite) => satellite.noradId === "25544",
  ) ?? catalog?.satellites[0] ?? null, [catalog]);
  const selected = requestedSatellite ?? satellitesById.get(selectedId) ?? preferredSatellite;
  const activeTab = requestedTab ?? tab;
  const searchResults = useMemo(() => {
    const query = search.trim().toLocaleUpperCase();
    if (!query || !catalog) return [];
    return catalog.satellites.filter((satellite) =>
      satellite.name.toLocaleUpperCase().includes(query)
      || satellite.noradId.includes(query)
      || satellite.internationalDesignator.toLocaleUpperCase().includes(query),
    ).slice(0, 12);
  }, [catalog, search]);

  const setSelectedSatellite = useCallback((satellite: SatelliteRecord) => {
    clearRequest();
    setSelectedId(satellite.id);
    setSearch(satellite.name);
    setSearchOpen(false);
  }, [clearRequest]);

  const currentEnvelope = getEnvelope(activeTab, analysis.results);
  const exportResult = async (format: "csv" | "json") => {
    if (!currentEnvelope || !selected) return;
    setExporting(true);
    setExportNotice(null);
    try {
      const result = await exportOrbitalAnalysis({
        content: format === "json" ? analysisToJson(currentEnvelope) : analysisToCsv(currentEnvelope),
        format,
        suggestedName: `${selected.noradId}-${activeTab}-${new Date().toISOString().slice(0, 10)}`,
      });
      if (result.saved) setExportNotice(t("status.saved"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      className="orbital-analysis-page"
      onKeyDown={(event) => {
        if (event.key === "Escape" && searchOpen) {
          event.preventDefault();
          event.stopPropagation();
          setSearchOpen(false);
        }
      }}
    >
      <header className="orbital-analysis-header">
        <div>
          <p className="eyebrow">{t("eyebrow")}</p>
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
        <div className="analysis-header-status" data-stale={catalog?.stale ?? false}>
          <i aria-hidden />
          <span>{catalog?.source ?? "CelesTrak"}</span>
          <strong>{catalog?.stale ? t("status.stale") : t("status.current")}</strong>
          <small>{catalog ? t("technical.catalogSummary", { count: formatNumber(catalog.catalogObjectCount, locale) }) : "—"}</small>
        </div>
      </header>

      {catalogQuery.isError ? <div className="analysis-error-state"><strong>{t("errors.catalog")}</strong><button className="secondary-button" onClick={() => void catalogQuery.refetch()} type="button">{t("common:actions.retry")}</button></div> : null}
      {!catalog && catalogQuery.isPending ? <div className="analysis-loading-state"><span />{t("status.preparing")}</div> : null}

      {catalog && selected ? (
        <>
          <section className="analysis-command-deck">
            <div className="analysis-satellite-picker">
              <label htmlFor="analysis-satellite-search">{t("header.satellite")}</label>
              <div><Search24Regular aria-hidden /><input autoComplete="off" id="analysis-satellite-search" onChange={(event) => { setSearch(event.target.value); setSearchOpen(true); }} onFocus={() => setSearchOpen(true)} placeholder={`${selected.name} · NORAD ${selected.noradId}`} value={search} /></div>
              {searchOpen && search.trim() && <div aria-label={t("header.satellite")} className="analysis-search-results" role="listbox">{searchResults.map((satellite) => <button aria-selected={satellite.id === selected.id} key={satellite.id} onClick={() => setSelectedSatellite(satellite)} role="option" type="button"><strong>{satellite.name}</strong><span>NORAD {satellite.noradId} · {t(`satellites:category.${satellite.category}`)}</span></button>)}{searchResults.length === 0 && <p>{t("status.noResult")}</p>}</div>}
            </div>
            <div className="analysis-selected-identity"><span>{t(`satellites:category.${selected.category}`)}</span><strong>{selected.name}</strong><small>NORAD {selected.noradId} · {selected.internationalDesignator || "—"}</small></div>
            <div className="analysis-command-actions">
              <button className="secondary-button" onClick={() => onShowEarth(selected.id)} type="button"><GlobeLocation24Regular aria-hidden />{t("actions.showEarth")}</button>
              <button className="secondary-button" disabled={!currentEnvelope || exporting} onClick={() => void exportResult("csv")} type="button"><ArrowExport24Regular aria-hidden />{t("actions.exportCsv")}</button>
              <button className="secondary-button" disabled={!currentEnvelope || exporting} onClick={() => void exportResult("json")} type="button"><ArrowExport24Regular aria-hidden />{t("actions.exportJson")}</button>
              {analysis.running && <button className="danger-button" onClick={analysis.cancel} type="button"><Stop24Regular aria-hidden />{t("actions.cancel")}</button>}
            </div>
          </section>

          <section className="analysis-provenance-strip">
            <div><span>{t("header.source")}</span><strong>{catalog.source}</strong></div>
            <div><span>{t("header.model")}</span><strong>{t("technical.model")}</strong></div>
            <div><span>{t("header.frame")}</span><strong>{activeTab === "dynamics" || activeTab === "proximity" ? "SGP4-ECI" : "ECF"}</strong></div>
            <div><span>{t("header.epoch")}</span><strong>{formatDateTime(selected.epoch, locale, "utc-only").primary}</strong></div>
            <div><span>{t("header.freshness")}</span><strong>{formatDateTime(catalog.fetchedAt, locale, "utc-only").primary}</strong></div>
          </section>

          <nav aria-label={t("title")} className="analysis-tabs" role="tablist">
            {analysisTabs.map((item) => <button aria-selected={activeTab === item} key={item} onClick={() => { clearRequest(); setTab(item); }} role="tab" type="button">{t(`tabs.${item}`)}</button>)}
          </nav>

          {analysis.running && <div aria-live="polite" className="analysis-progress"><div style={{ width: `${Math.max(3, analysis.progress * 100)}%` }} /><span>{t("status.running")} {Math.round(analysis.progress * 100)}%</span></div>}
          {analysis.error && <div className="analysis-error-state">{t(`errors.${analysis.error}`, { defaultValue: t("errors.analysis-failed") })}</div>}
          {exportNotice && <p aria-live="polite" className="analysis-export-notice">{exportNotice}</p>}

          <div aria-label={t(`tabs.${activeTab}`)} className="analysis-tab-content" role="tabpanel">
            {activeTab === "dynamics" && <DynamicsPanel envelope={analysis.results.dynamics} onRun={(hours, samples) => analysis.runDynamics({ endUnixMs: Date.now() + hours * 3_600_000, sampleCount: samples, satelliteId: selected.id, startUnixMs: Date.now() })} satellite={selected} />}
            {activeTab === "groundStation" && <GroundStationPanel envelope={analysis.results.groundStation} onRun={(station, hours) => analysis.runGroundStation({ endUnixMs: Date.now() + hours * 3_600_000, satelliteId: selected.id, startUnixMs: Date.now(), station })} />}
            {activeTab === "constellation" && <ConstellationPanel envelope={analysis.results.constellation} onRun={(filter: ConstellationFilter) => analysis.runConstellation(filter)} onSelect={(id) => { const satellite = satellitesById.get(id); if (satellite) setSelectedSatellite(satellite); }} selectedId={selected.id} />}
            {activeTab === "proximity" && <ProximityPanel envelope={analysis.results.proximity} onRun={(hours, thresholdKm) => analysis.runProximity({ endUnixMs: Date.now() + hours * 3_600_000, primaryId: selected.id, startUnixMs: Date.now(), thresholdKm })} onSelect={(id) => { const satellite = satellitesById.get(id); if (satellite) setSelectedSatellite(satellite); }} satellitesById={satellitesById} />}
          </div>
        </>
      ) : null}
    </div>
  );
}

function getEnvelope(
  tab: AnalysisTab,
  results: ReturnType<typeof useAnalysisWorker>["results"],
): AnalysisEnvelope<
  DynamicsResult | GroundStationAccessResult | ConstellationResult | ProximityResult
> | null {
  if (tab === "groundStation") return results.groundStation;
  return results[tab];
}
