import {
  ArrowExport24Regular,
  GlobeLocation24Regular,
  Search24Regular,
  Stop24Regular,
} from "@fluentui/react-icons";
import "@/styles/workspaces/orbital-analysis.css";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useActiveSatelliteCatalog } from "@/features/satellites/api/useActiveSatelliteCatalog";
import type { SatelliteRecord } from "@/features/satellites/domain/satellite";
import { usePreferencesStore } from "@/features/settings/model/preferences";
import { formatDateTime, formatNumber } from "@/shared/i18n/formatters";
import { parseUtcEpoch } from "@/shared/data/utcEpoch";
import { analysisExportName, resultMatchesSelection } from "../domain/runContext";

import { exportOrbitalAnalysis } from "../api/analysisStorage";
import { useRecordAnalysisOrbitalSnapshot } from "../api/useAnalysisStorage";
import type {
  AnalysisEnvelope,
  AnalysisTab,
  ConstellationFilter,
  ConstellationResult,
  CoverageResult,
  DynamicsResult,
  GroundStationAccessResult,
  GroundNetworkResult,
  ProximityResult,
} from "../domain/analysis";
import { analysisTabs } from "../domain/analysis";
import { analysisToCsv, analysisToJson } from "../domain/exportAnalysis";
import { useAnalysisSelectionStore } from "../model/analysisSelection";
import { useAnalysisWorker } from "../model/useAnalysisWorker";
import { ConstellationPanel } from "./ConstellationPanel";
import { ChangeWatchPanel } from "./ChangeWatchPanel";
import { CoveragePanel } from "./CoveragePanel";
import { DynamicsPanel } from "./DynamicsPanel";
import { GroundStationPanel } from "./GroundStationPanel";
import { MissionDesignPanel } from "./MissionDesignPanel";
import { ProximityPanel } from "./ProximityPanel";

interface OrbitalAnalysisWorkspaceProps {
  active?: boolean;
  onShowEarth: (
    satelliteId: string,
    timestampUnixMs?: number,
    origin?: "analysis" | "ground-station" | "conjunction",
  ) => void;
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
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const analysis = useAnalysisWorker(catalog, active);
  const invalidateAnalysis = analysis.invalidate;
  const { mutate: recordSnapshot } = useRecordAnalysisOrbitalSnapshot();
  const deferredSearch = useDeferredValue(search);

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
    const query = deferredSearch.trim().toLocaleUpperCase();
    if (!query || !catalog) return [];
    return catalog.satellites.filter((satellite) =>
      satellite.name.toLocaleUpperCase().includes(query)
      || satellite.noradId.includes(query)
      || satellite.internationalDesignator.toLocaleUpperCase().includes(query),
    ).slice(0, 12);
  }, [catalog, deferredSearch]);

  const setSelectedSatellite = useCallback((satellite: SatelliteRecord) => {
    invalidateAnalysis();
    clearRequest();
    setSelectedId(satellite.id);
    setSearch(satellite.name);
    setSearchOpen(false);
  }, [clearRequest, invalidateAnalysis]);

  useEffect(() => {
    if (!selected) return;
    const sourceEpochUnixMs = parseUtcEpoch(selected.epoch);
    if (!Number.isFinite(sourceEpochUnixMs)) return;
    const rawBstar = Number((selected.omm as unknown as Record<string, unknown>).BSTAR);
    recordSnapshot({
      apogeeKm: selected.apogeeKm,
      argumentPerigeeDegrees: selected.argumentOfPerigeeDegrees,
      bstar: Number.isFinite(rawBstar) ? rawBstar : null,
      eccentricity: selected.eccentricity,
      inclinationDegrees: selected.inclinationDegrees,
      meanAnomalyDegrees: selected.meanAnomalyDegrees,
      meanMotion: selected.meanMotionRevolutionsPerDay,
      noradId: selected.noradId,
      perigeeKm: selected.perigeeKm,
      raanDegrees: selected.rightAscensionDegrees,
      sourceEpochUnixMs,
    });
  }, [catalog?.fetchedAt, recordSnapshot, selected]);

  const resultCandidates = analysis.results;
  const visibleResults = Object.fromEntries((Object.entries(resultCandidates) as Array<[string, typeof resultCandidates[keyof typeof resultCandidates]]>).map(([key, value]) => [
    key, selected && resultMatchesSelection(value, selected.id) ? value : null,
  ])) as unknown as typeof resultCandidates;
  const currentEnvelope = getEnvelope(activeTab, visibleResults);
  const progressLabel = t(getProgressKey(analysis.stage));
  const exportResult = async (format: "csv" | "json") => {
    if (!currentEnvelope || !selected) return;
    setExporting(true);
    setExportNotice(null);
    try {
      const result = await exportOrbitalAnalysis({
        content: format === "json" ? analysisToJson(currentEnvelope) : analysisToCsv(currentEnvelope),
        format,
        suggestedName: analysisExportName(currentEnvelope),
      });
      if (result.saved) setExportNotice(t("status.saved"));
    } catch {
      setExportNotice(t("errors.export"));
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
        <div className="analysis-header-status">
          <span>{catalog?.source ?? "CelesTrak"}</span>
          <small>{catalog ? t("technical.catalogSummary", { count: formatNumber(catalog.catalogObjectCount, locale) }) : "—"}</small>
        </div>
      </header>

      {catalogQuery.isError ? <div className="analysis-error-state"><strong>{t("errors.catalog")}</strong></div> : null}
      {!catalog && catalogQuery.isPending ? <div className="analysis-loading-state"><span />{t("status.preparing")}</div> : null}

      {catalog && selected ? (
        <>
          <section className="analysis-command-deck">
            <div className="analysis-satellite-picker">
              <label htmlFor="analysis-satellite-search">{t("header.satellite")}</label>
              <div><Search24Regular aria-hidden /><input aria-activedescendant={searchOpen && searchResults[activeSearchIndex] ? `analysis-result-${searchResults[activeSearchIndex].id}` : undefined} aria-autocomplete="list" aria-controls="analysis-search-results" autoComplete="off" id="analysis-satellite-search" onChange={(event) => { setSearch(event.target.value); setActiveSearchIndex(0); setSearchOpen(true); }} onFocus={() => setSearchOpen(true)} onKeyDown={(event) => {
                if (!searchOpen || searchResults.length === 0) return;
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActiveSearchIndex((current) => (current + 1) % searchResults.length);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveSearchIndex((current) => (current - 1 + searchResults.length) % searchResults.length);
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  const result = searchResults[activeSearchIndex];
                  if (result) setSelectedSatellite(result);
                }
              }} placeholder={`${selected.name} · NORAD ${selected.noradId}`} role="combobox" value={search} /></div>
              {searchOpen && search.trim() && <div aria-label={t("header.satellite")} className="analysis-search-results" id="analysis-search-results" role="listbox">{searchResults.map((satellite, index) => <button aria-selected={index === activeSearchIndex} data-active={index === activeSearchIndex} id={`analysis-result-${satellite.id}`} key={satellite.id} onClick={() => setSelectedSatellite(satellite)} onMouseEnter={() => setActiveSearchIndex(index)} role="option" type="button"><strong>{satellite.name}</strong><span>NORAD {satellite.noradId} · {t(`satellites:category.${satellite.category}`)}</span></button>)}{searchResults.length === 0 && <p>{t("status.noResult")}</p>}</div>}
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
            <div><span>{t("header.frame")}</span><strong>{frameForTab(activeTab)}</strong></div>
            <div><span>{t("header.epoch")}</span><strong>{formatDateTime(currentEnvelope?.objectEpochs[selected.id] ?? selected.epoch, locale, "utc-only").primary}</strong></div>
            <div><span>{t("header.freshness")}</span><strong>{formatDateTime(currentEnvelope?.catalogFetchedAtUnixMs ?? catalog.fetchedAt, locale, "utc-only").primary}</strong></div>
          </section>

          <nav aria-label={t("title")} className="analysis-tabs" role="tablist">
            {analysisTabs.map((item, index) => <button aria-selected={activeTab === item} key={item} onClick={() => { clearRequest(); analysis.invalidate(item); setTab(item); }} role="tab" type="button"><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{t(`tabs.${item}`)}</strong><small>{t(`tabDescriptions.${item}`)}</small></div></button>)}
          </nav>

          {analysis.running && <div aria-live="polite" className="analysis-progress"><div style={{ width: `${Math.max(3, analysis.progress * 100)}%` }} /><span><strong>{progressLabel}</strong><b>{Math.round(analysis.progress * 100)}%</b></span></div>}
          {analysis.error && <div className="analysis-error-state">{t(`errors.${analysis.error}`, { defaultValue: t("errors.analysis-failed") })}</div>}
          {exportNotice && <p aria-live="polite" className="analysis-export-notice">{exportNotice}</p>}

          <div key={`${selected.id}:${activeTab}`} aria-label={t(`tabs.${activeTab}`)} className="analysis-tab-content" role="tabpanel" onChangeCapture={(event) => {
            if (event.target instanceof Element && event.target.closest("[data-analysis-input]")) analysis.invalidate(activeTab);
          }} onClickCapture={(event) => {
            if (event.target instanceof Element && event.target.closest("[data-analysis-selection] button")) analysis.invalidate(activeTab);
          }}>
            {activeTab === "dynamics" && <DynamicsPanel envelope={visibleResults.dynamics} onRun={(hours, samples) => { const startUnixMs = Date.now(); analysis.runDynamics({ endUnixMs: startUnixMs + hours * 3_600_000, sampleCount: samples, satelliteId: selected.id, startUnixMs }); }} onShowEarthAtTime={(timestampUnixMs) => visibleResults.dynamics && onShowEarth(visibleResults.dynamics.result.satelliteId, timestampUnixMs, "analysis")} running={analysis.running || !analysis.ready} satellite={visibleResults.dynamics?.context.sourceObjects[0] ?? selected} />}
            {activeTab === "groundStation" && <GroundStationPanel envelope={visibleResults.groundStation} networkEnvelope={visibleResults.groundNetwork} onRun={(station, hours) => { const startUnixMs = Date.now(); analysis.runGroundStation({ endUnixMs: startUnixMs + hours * 3_600_000, satelliteId: selected.id, startUnixMs, station }); }} onRunNetwork={(stations, hours) => { const startUnixMs = Date.now(); analysis.runGroundNetwork({ endUnixMs: startUnixMs + hours * 3_600_000, satelliteId: selected.id, startUnixMs, stations }); }} onShowEarthAtTime={(timestampUnixMs) => onShowEarth((visibleResults.groundNetwork ?? visibleResults.groundStation)?.result.satelliteId ?? selected.id, timestampUnixMs, "ground-station")} running={analysis.running || !analysis.ready} />}
            {activeTab === "constellation" && <ConstellationPanel envelope={visibleResults.constellation} onRun={(filter: ConstellationFilter) => analysis.runConstellation(filter)} onSelect={(id) => { const satellite = satellitesById.get(id); if (satellite) setSelectedSatellite(satellite); }} running={analysis.running || !analysis.ready} selectedId={selected.id} />}
            {activeTab === "proximity" && <ProximityPanel envelope={visibleResults.proximity} onRun={(hours, thresholdKm) => { const startUnixMs = Date.now(); analysis.runProximity({ endUnixMs: startUnixMs + hours * 3_600_000, primaryId: selected.id, startUnixMs, thresholdKm }); }} onSelect={(id) => { const satellite = satellitesById.get(id); if (satellite) setSelectedSatellite(satellite); }} onShowEarthAtTime={(timestampUnixMs) => visibleResults.proximity && onShowEarth(visibleResults.proximity.result.primaryId, timestampUnixMs, "conjunction")} running={analysis.running || !analysis.ready} satellitesById={satellitesById} />}
            {activeTab === "changeWatch" && <ChangeWatchPanel noradId={selected.noradId} />}
            {activeTab === "coverage" && <CoveragePanel catalog={catalog.satellites} envelope={visibleResults.coverage} key={selected.id} onRun={(satelliteIds, target, hours) => { const startUnixMs = Date.now(); analysis.runCoverage({ endUnixMs: startUnixMs + hours * 3_600_000, satelliteIds, startUnixMs, target }); }} onShowEarthAtTime={(satelliteId, timestampUnixMs) => onShowEarth(satelliteId, timestampUnixMs, "analysis")} running={analysis.running || !analysis.ready} selected={selected} />}
            {activeTab === "missionDesign" && <MissionDesignPanel satellite={selected} />}
          </div>
        </>
      ) : null}
    </div>
  );
}

function getProgressKey(stage: string | null): "progress.passDetection" | "progress.networkPlanning" | "progress.coarseScreening" | "progress.refinement" | "status.running" {
  if (stage === "pass-detection") return "progress.passDetection";
  if (stage === "network-planning") return "progress.networkPlanning";
  if (stage === "coarse-screening") return "progress.coarseScreening";
  if (stage === "refinement") return "progress.refinement";
  return "status.running";
}

function getEnvelope(
  tab: AnalysisTab,
  results: ReturnType<typeof useAnalysisWorker>["results"],
): AnalysisEnvelope<
  DynamicsResult | GroundStationAccessResult | GroundNetworkResult | ConstellationResult | ProximityResult | CoverageResult
> | null {
  if (tab === "groundStation") return results.groundNetwork ?? results.groundStation;
  if (tab === "dynamics" || tab === "constellation" || tab === "proximity" || tab === "coverage") {
    return results[tab];
  }
  return null;
}

function frameForTab(tab: AnalysisTab): string {
  if (tab === "dynamics" || tab === "proximity") return "SGP4-ECI";
  if (tab === "groundStation" || tab === "coverage") return "ECF";
  if (tab === "changeWatch") return "OMM";
  if (tab === "missionDesign") return "SCENARIO";
  return "CATALOG";
}
