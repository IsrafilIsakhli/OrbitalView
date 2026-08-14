import "cesium/Build/Cesium/Widgets/widgets.css";

import { ArrowClockwise24Regular } from "@fluentui/react-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useSpaceIntelligence } from "@/features/launches/api/useSpaceIntelligence";
import { createLaunchSites } from "@/features/launches/domain/launchSite";
import { useLaunchSelectionStore } from "@/features/launches/model/selection";
import type { CesiumLaunchLayer, LaunchLayerSnapshot } from "@/features/launches/rendering/CesiumLaunchLayer";
import { LaunchGlobePanel } from "@/features/launches/ui/LaunchGlobePanel";
import { useActiveSatelliteCatalog } from "@/features/satellites/api/useActiveSatelliteCatalog";
import {
  countSatelliteCategories,
  satelliteCategories,
  type SatelliteCategory,
} from "@/features/satellites/domain/satellite";
import { useSatelliteSelectionStore } from "@/features/satellites/model/selection";
import type {
  CesiumSatelliteLayer,
  SatelliteLayerSnapshot,
} from "@/features/satellites/rendering/CesiumSatelliteLayer";
import { SatelliteInfoPanel } from "@/features/satellites/ui/SatelliteInfoPanel";
import { usePreferencesStore } from "@/features/settings/model/preferences";
import { BrandMark } from "@/shared/ui/BrandMark";
import { formatTime } from "@/shared/i18n/formatters";
import { formatDistanceFromKm, formatOrbitalSpeed } from "@/shared/formatting/units";

import type {
  CameraPresetId,
  EarthEngine,
  EarthEngineSnapshot,
} from "../contracts/earth-engine";
import { initialEarthEngineSnapshot } from "../contracts/earth-engine";
import { closeEarthFocusSession } from "../camera/earthFocusLifecycle";
import { EarthControls } from "./EarthControls";
import { EarthContextCards } from "./EarthContextCards";
import { EarthLayerPanel } from "./EarthLayerPanel";
import { EarthObjectTooltip } from "./EarthObjectTooltip";

function surfaceLabelKey(
  snapshot: Pick<EarthEngineSnapshot, "imagery" | "terrain">,
): "loading" | "highResolution" | "adaptive" | "fallback" {
  if (snapshot.imagery === "fallback" || snapshot.terrain === "fallback") return "fallback";
  if (snapshot.imagery === "loading" || snapshot.terrain === "loading") return "loading";
  if (snapshot.imagery === "high-resolution" && snapshot.terrain === "high-resolution") {
    return "highResolution";
  }
  return "adaptive";
}

export function EarthViewport({
  active = true,
  onOpenAnalysis,
}: {
  active?: boolean;
  onOpenAnalysis?: (satelliteId: string) => void;
}) {
  const { i18n, t } = useTranslation(["earth", "launches", "satellites"]);
  const graphicsQuality = usePreferencesStore((state) => state.graphicsQuality);
  const reduceMotion = usePreferencesStore((state) => state.reduceMotion);
  const units = usePreferencesStore((state) => state.units);
  const satelliteCatalogQuery = useActiveSatelliteCatalog();
  const spaceIntelligenceQuery = useSpaceIntelligence();
  const requestedSatelliteId = useSatelliteSelectionStore(
    (state) => state.requestedSatelliteId,
  );
  const clearRequestedSatellite = useSatelliteSelectionStore(
    (state) => state.clearRequestedSatellite,
  );
  const requestedLaunchId = useLaunchSelectionStore((state) => state.requestedLaunchId);
  const clearRequestedLaunch = useLaunchSelectionStore((state) => state.clearRequestedLaunch);
  const canvasLabel = t("canvasLabel");
  const catalogRef = useRef(satelliteCatalogQuery.data ?? null);
  const launchesRef = useRef(spaceIntelligenceQuery.data?.launches ?? null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLElement>(null);
  const engineRef = useRef<EarthEngine | null>(null);
  const satelliteLayerRef = useRef<CesiumSatelliteLayer | null>(null);
  const launchLayerRef = useRef<CesiumLaunchLayer | null>(null);
  const engineOptionsRef = useRef({
    active,
    canvasLabel,
    qualityCap: graphicsQuality,
    reduceMotion,
  });
  const [attempt, setAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<EarthEngineSnapshot>({
    ...initialEarthEngineSnapshot,
    quality: graphicsQuality,
  });
  const [satelliteSnapshot, setSatelliteSnapshot] =
    useState<SatelliteLayerSnapshot>({
      categoryCounts: countSatelliteCategories([]),
      categoryVisibility: {
        communications: true,
        debris: true,
        navigation: true,
        other: true,
        "rocket-body": true,
        science: true,
        starlink: true,
        station: true,
        weather: true,
      },
      focusedCategory: null,
      followSelected: false,
      groundTrackVisible: true,
      hoverScreenPosition: null,
      hoveredId: null,
      hoveredTelemetry: null,
      lastUpdatedAt: null,
      orbitVisible: true,
      presentationMode: "overview",
      primitiveCount: 0,
      renderedCount: 0,
      rocketBodyCount: 0,
      selectedId: null,
      selectedOccluded: false,
      selectedTelemetry: null,
      semanticMarkerCount: 0,
      showcaseOrbitCount: 0,
      signalCount: 0,
      status: "idle",
      totalCount: 0,
      validCount: 0,
    });
  const [launchSnapshot, setLaunchSnapshot] = useState<LaunchLayerSnapshot>({
    hoverScreenPosition: null,
    hoveredSiteId: null,
    renderedSiteCount: 0,
    selectedId: null,
    selectedSiteId: null,
    totalLaunchCount: 0,
  });
  const [launchSitesVisible, setLaunchSitesVisible] = useState(true);

  useEffect(() => {
    engineOptionsRef.current = {
      active,
      canvasLabel,
      qualityCap: graphicsQuality,
      reduceMotion,
    };
  }, [active, canvasLabel, graphicsQuality, reduceMotion]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    let unsubscribeSatellite: (() => void) | null = null;
    let unregisterSatellite: (() => void) | null = null;
    let unsubscribeLaunch: (() => void) | null = null;
    let unregisterLaunch: (() => void) | null = null;
    let engine: EarthEngine | null = null;
    let satelliteLayer: CesiumSatelliteLayer | null = null;
    let launchLayer: CesiumLaunchLayer | null = null;
    const engineOptions = engineOptionsRef.current;

    setSnapshot({
      ...initialEarthEngineSnapshot,
      autoRotation: !engineOptions.reduceMotion,
      phase: "initializing",
      quality: engineOptions.qualityCap,
    });

    void Promise.all([
      import("../core/createEarthEngine"),
      import("@/features/satellites/rendering/CesiumSatelliteLayer"),
      import("@/features/launches/rendering/CesiumLaunchLayer"),
    ])
      .then(async ([
        { createEarthEngine },
        { CesiumSatelliteLayer: SatelliteLayer },
        { CesiumLaunchLayer: LaunchLayer },
      ]) => {
        if (cancelled) {
          return;
        }
        engine = createEarthEngine(container, engineOptions);
        engineRef.current = engine;
        unsubscribe = engine.subscribe(() => {
          if (!cancelled && engine) {
            setSnapshot(engine.getSnapshot());
          }
        });
        await engine.initialize();
        if (cancelled || engine.getSnapshot().phase === "error") {
          return;
        }
        const defaultPreset = usePreferencesStore.getState().defaultCameraPreset;
        if (defaultPreset !== "earth") {
          engine.flyTo(defaultPreset);
        }
        satelliteLayer = new SatelliteLayer();
        satelliteLayerRef.current = satelliteLayer;
        unsubscribeSatellite = satelliteLayer.subscribe(() => {
          if (!cancelled && satelliteLayer) {
            const nextSatelliteSnapshot = satelliteLayer.getSnapshot();
            if (nextSatelliteSnapshot.selectedId) {
              launchLayer?.selectLaunch(null, false, false);
            }
            setSatelliteSnapshot(nextSatelliteSnapshot);
          }
        });
        unregisterSatellite = await engine.registerLayer(satelliteLayer);
        if (catalogRef.current) {
          satelliteLayer.setCatalog(catalogRef.current.satellites);
        }
        launchLayer = new LaunchLayer();
        launchLayerRef.current = launchLayer;
        unsubscribeLaunch = launchLayer.subscribe(() => {
          if (!cancelled && launchLayer) {
            const nextLaunchSnapshot = launchLayer.getSnapshot();
            if (nextLaunchSnapshot.selectedId) {
              satelliteLayer?.selectSatellite(null, false);
            }
            setLaunchSnapshot(nextLaunchSnapshot);
          }
        });
        unregisterLaunch = await engine.registerLayer(launchLayer);
        if (launchesRef.current) {
          launchLayer.setLaunches(launchesRef.current);
        }
        engine.setActive(engineOptions.active);
        setSnapshot(engine.getSnapshot());
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSnapshot((current) => ({
            ...current,
            errorDetail: error instanceof Error ? error.message : String(error),
            phase: "error",
          }));
        }
      });

    return () => {
      cancelled = true;
      unregisterLaunch?.();
      unsubscribeLaunch?.();
      unregisterSatellite?.();
      unsubscribeSatellite?.();
      unsubscribe?.();
      engine?.dispose();
      if (launchLayerRef.current === launchLayer) {
        launchLayerRef.current = null;
      }
      if (satelliteLayerRef.current === satelliteLayer) {
        satelliteLayerRef.current = null;
      }
      if (engineRef.current === engine) {
        engineRef.current = null;
      }
    };
  }, [attempt]);

  useEffect(() => {
    engineRef.current?.setActive(active);
  }, [active]);

  useEffect(() => {
    catalogRef.current = satelliteCatalogQuery.data ?? null;
    if (satelliteCatalogQuery.data) {
      satelliteLayerRef.current?.setCatalog(
        satelliteCatalogQuery.data.satellites,
      );
    }
  }, [satelliteCatalogQuery.data]);

  useEffect(() => {
    launchesRef.current = spaceIntelligenceQuery.data?.launches ?? null;
    if (spaceIntelligenceQuery.data) {
      launchLayerRef.current?.setLaunches(spaceIntelligenceQuery.data.launches);
    }
  }, [spaceIntelligenceQuery.data]);

  useEffect(() => {
    if (requestedSatelliteId && satelliteCatalogQuery.data) {
      satelliteLayerRef.current?.selectSatellite(requestedSatelliteId);
      window.setTimeout(() => satelliteLayerRef.current?.focusSelected(), 80);
    }
  }, [requestedSatelliteId, satelliteCatalogQuery.data, satelliteSnapshot.status]);

  useEffect(() => {
    if (requestedLaunchId && spaceIntelligenceQuery.data) {
      launchLayerRef.current?.selectLaunch(requestedLaunchId, true);
    }
  }, [requestedLaunchId, spaceIntelligenceQuery.data]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const hasSelection = Boolean(
        satelliteLayerRef.current?.getSnapshot().selectedId
        || launchLayerRef.current?.getSnapshot().selectedId,
      );
      if (!hasSelection) return;
      closeEarthFocusSession({
        launchLayer: launchLayerRef.current,
        returnToDefaultEarth: () => engineRef.current?.returnToDefaultEarth() ?? false,
        satelliteLayer: satelliteLayerRef.current,
      }, "all");
      clearRequestedSatellite();
      clearRequestedLaunch();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [clearRequestedLaunch, clearRequestedSatellite]);

  useEffect(() => {
    const canvas = containerRef.current?.querySelector("canvas");
    if (canvas) {
      canvas.style.cursor = satelliteSnapshot.hoveredId || launchSnapshot.hoveredSiteId
        ? "pointer"
        : "grab";
    }
  }, [launchSnapshot.hoveredSiteId, satelliteSnapshot.hoveredId]);

  useEffect(() => {
    const canvas = containerRef.current?.querySelector("canvas");
    if (canvas) {
      canvas.setAttribute("aria-label", canvasLabel);
      canvas.setAttribute("data-earth-focus-target", "true");
    }
  }, [canvasLabel]);

  useEffect(() => {
    engineRef.current?.setQualityCap(graphicsQuality);
  }, [graphicsQuality]);

  useEffect(() => {
    engineRef.current?.setReduceMotion(reduceMotion);
  }, [reduceMotion]);

  const flyTo = useCallback((preset: CameraPresetId) => {
    satelliteLayerRef.current?.setFollowSelected(false);
    engineRef.current?.flyTo(preset);
  }, []);

  const toggleRotation = useCallback(() => {
    engineRef.current?.setAutoRotation(!snapshot.autoRotation);
  }, [snapshot.autoRotation]);

  const closeSatellite = useCallback(() => {
    closeEarthFocusSession({
      launchLayer: launchLayerRef.current,
      returnToDefaultEarth: () => engineRef.current?.returnToDefaultEarth() ?? false,
      satelliteLayer: satelliteLayerRef.current,
    }, "satellite");
    clearRequestedSatellite();
  }, [clearRequestedSatellite]);

  const closeLaunch = useCallback(() => {
    closeEarthFocusSession({
      launchLayer: launchLayerRef.current,
      returnToDefaultEarth: () => engineRef.current?.returnToDefaultEarth() ?? false,
      satelliteLayer: satelliteLayerRef.current,
    }, "launch");
    clearRequestedLaunch();
  }, [clearRequestedLaunch]);

  const toggleCategory = useCallback((category: SatelliteCategory) => {
    const current = satelliteLayerRef.current?.getSnapshot().categoryVisibility[category] ?? true;
    satelliteLayerRef.current?.setCategoryVisible(category, !current);
  }, []);

  const focusCategory = useCallback((category: SatelliteCategory | null) => {
    satelliteLayerRef.current?.focusCategory(category);
  }, []);

  const hideSelectedSatellite = useCallback(() => {
    const selected = satelliteCatalogQuery.data?.satellites.find(
      (satellite) => satellite.id === satelliteLayerRef.current?.getSnapshot().selectedId,
    );
    if (selected) satelliteLayerRef.current?.setCategoryVisible(selected.category, false);
    closeSatellite();
  }, [closeSatellite, satelliteCatalogQuery.data]);

  const selectedSatellite = useMemo(
    () => satelliteCatalogQuery.data?.satellites.find(
      (satellite) => satellite.id === satelliteSnapshot.selectedId,
    ) ?? null,
    [satelliteCatalogQuery.data, satelliteSnapshot.selectedId],
  );
  const selectedLaunch = useMemo(
    () => spaceIntelligenceQuery.data?.launches.find(
      (launch) => launch.id === launchSnapshot.selectedId,
    ) ?? null,
    [launchSnapshot.selectedId, spaceIntelligenceQuery.data],
  );
  const launchSites = useMemo(
    () => createLaunchSites(spaceIntelligenceQuery.data?.launches ?? []),
    [spaceIntelligenceQuery.data?.launches],
  );
  const selectedLaunchSite = useMemo(
    () => launchSites.find((site) => site.id === launchSnapshot.selectedSiteId) ?? null,
    [launchSites, launchSnapshot.selectedSiteId],
  );
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateComposition = () => {
      const width = container.clientWidth;
      const overlayRoot = viewportRef.current;
      const layerPanelWidth = width >= 768
        ? overlayRoot?.querySelector<HTMLElement>(".earth-layer-panel")?.offsetWidth ?? 0
        : 0;
      const inspectorWidth = width >= 768
        ? overlayRoot?.querySelector<HTMLElement>(".object-inspector")?.offsetWidth ?? 0
        : 0;
      const defaultInsets = {
        bottom: width < 900 ? 82 : 104,
        left: width >= 1_180 ? 260 : 20,
        right: layerPanelWidth > 0 ? layerPanelWidth + 32 : 20,
        top: width < 900 ? 72 : 86,
      };
      engineRef.current?.setDefaultCameraCompositionInsets(defaultInsets);
      engineRef.current?.setCameraCompositionInsets(selectedSatellite || selectedLaunch
        ? { ...defaultInsets, right: inspectorWidth > 0 ? inspectorWidth + 32 : 20 }
        : defaultInsets);
    };
    updateComposition();
    const observer = new ResizeObserver(updateComposition);
    observer.observe(container);
    const overlay = viewportRef.current?.querySelector<HTMLElement>(
      selectedSatellite || selectedLaunch ? ".object-inspector" : ".earth-layer-panel",
    );
    if (overlay) observer.observe(overlay);
    return () => observer.disconnect();
  }, [selectedLaunch, selectedSatellite]);
  const hoveredSatellite = useMemo(
    () => satelliteCatalogQuery.data?.satellites.find(
      (satellite) => satellite.id === satelliteSnapshot.hoveredId,
    ) ?? null,
    [satelliteCatalogQuery.data?.satellites, satelliteSnapshot.hoveredId],
  );
  const hoveredLaunchSite = useMemo(
    () => launchSites.find((site) => site.id === launchSnapshot.hoveredSiteId) ?? null,
    [launchSites, launchSnapshot.hoveredSiteId],
  );
  const priorityStation = useMemo(
    () => satelliteCatalogQuery.data?.satellites.find((satellite) =>
      satellite.category === "station" && satellite.name.toLocaleUpperCase().includes("ISS"),
    ) ?? satelliteCatalogQuery.data?.satellites.find(
      (satellite) => satellite.category === "station",
    ) ?? null,
    [satelliteCatalogQuery.data?.satellites],
  );
  const nextLaunch = useMemo(() => {
    const now = Date.parse(snapshot.utcIso);
    return spaceIntelligenceQuery.data?.launches.find(
      (launch) => Date.parse(launch.net) >= now,
    ) ?? null;
  }, [snapshot.utcIso, spaceIntelligenceQuery.data?.launches]);
  const launchesToday = useMemo(() => {
    const today = snapshot.utcIso.slice(0, 10);
    return spaceIntelligenceQuery.data?.launches.filter(
      (launch) => launch.net.slice(0, 10) === today,
    ).length ?? 0;
  }, [snapshot.utcIso, spaceIntelligenceQuery.data?.launches]);

  const locale = i18n.resolvedLanguage ?? "en";
  const utc = formatTime(snapshot.utcIso, locale, "UTC", true);
  const isLoading =
    snapshot.phase === "idle" || snapshot.phase === "initializing";
  const isError = snapshot.phase === "error";

  return (
    <section
      aria-label={t("regionLabel")}
      className="earth-viewport"
      ref={viewportRef}
      data-engine-fps={snapshot.fps ?? "pending"}
      data-engine-phase={snapshot.phase}
      data-engine-quality={snapshot.quality}
      data-gpu-renderer={snapshot.gpu?.renderer ?? "pending"}
      data-satellite-count={satelliteSnapshot.totalCount}
      data-satellite-status={satelliteSnapshot.status}
      data-satellite-valid-count={satelliteSnapshot.validCount}
      data-satellite-signal-count={satelliteSnapshot.signalCount}
      data-satellite-semantic-count={satelliteSnapshot.semanticMarkerCount}
      data-satellite-presentation={satelliteSnapshot.presentationMode}
      data-satellite-primitive-count={satelliteSnapshot.primitiveCount}
      data-showcase-orbit-count={satelliteSnapshot.showcaseOrbitCount}
      data-rocket-body-count={satelliteSnapshot.rocketBodyCount}
      data-launch-count={launchSnapshot.totalLaunchCount}
      data-launch-site-count={launchSnapshot.renderedSiteCount}
    >
      <div className="earth-render-surface" ref={containerRef} />

      {!isError && (
        <div className="earth-hud">
          <div className="earth-identity glass-surface">
            <p className="eyebrow"><span />{t("eyebrow")}</p>
            <div className="earth-identity__title-row">
              <h1>{t("title")}</h1>
              <div className="utc-clock">
                <span>{t("utc")}</span>
                <strong>{utc}</strong>
              </div>
            </div>
            <div className="surface-statuses">
              <span>
                {t("surface.earthData")}
                <strong>{t(`surface.status.${surfaceLabelKey(snapshot)}`)}</strong>
              </span>
              <span>
                {t("satellites:data.label")}
                <strong>
                  {satelliteCatalogQuery.isPending
                    ? t("satellites:data.loading")
                    : satelliteCatalogQuery.isError
                      ? t("satellites:data.error")
                      : t("satellites:data.ready", {
                          count: satelliteSnapshot.totalCount,
                        })}
                </strong>
              </span>
              <span>
                {t("surface.launchesToday")}
                <strong>
                  {spaceIntelligenceQuery.isPending
                    ? t("satellites:data.loading")
                    : spaceIntelligenceQuery.isError
                      ? t("satellites:data.error")
                      : t("surface.launchActivity", {
                          sites: launchSnapshot.renderedSiteCount,
                          today: launchesToday,
                        })}
                </strong>
              </span>
            </div>
          </div>

          {!selectedSatellite && !selectedLaunch && !isLoading && (
            <EarthLayerPanel
              categoryCounts={satelliteSnapshot.categoryCounts}
              categoryLabels={Object.fromEntries(satelliteCategories.map(
                (category) => [category, t(`satellites:category.${category}`)],
              )) as Record<SatelliteCategory, string>}
              categoryVisibility={satelliteSnapshot.categoryVisibility}
              cloudsLabel={t("layers.clouds")}
              cloudsVisible={snapshot.cloudsVisible}
              collapseLabel={t("layers.collapse")}
              expandLabel={t("layers.expand")}
              focusedCategory={satelliteSnapshot.focusedCategory}
              groundTrackCount={selectedSatellite && satelliteSnapshot.groundTrackVisible ? 1 : 0}
              groundTrackLabel={t("layers.groundTrack")}
              groundTrackVisible={satelliteSnapshot.groundTrackVisible}
              launchSiteCount={launchSnapshot.renderedSiteCount}
              launchSitesLabel={t("orbitLegend.launchSites")}
              launchSitesVisible={launchSitesVisible}
              onFocusCategory={focusCategory}
              onToggleCategory={toggleCategory}
              onToggleClouds={() => engineRef.current?.setCloudsVisible(!snapshot.cloudsVisible)}
              onToggleGroundTrack={() => satelliteLayerRef.current?.setGroundTrackVisible(!satelliteSnapshot.groundTrackVisible)}
              onToggleLaunchSites={() => {
                const next = !launchSitesVisible;
                setLaunchSitesVisible(next);
                launchLayerRef.current?.setVisible(next);
              }}
              onToggleNightLights={() => engineRef.current?.setNightLightsVisible(!snapshot.nightLightsVisible)}
              onToggleOrbits={() => satelliteLayerRef.current?.setOrbitVisible(!satelliteSnapshot.orbitVisible)}
              nightLightsLabel={t("layers.nightLights")}
              nightLightsVisible={snapshot.nightLightsVisible}
              orbitCount={satelliteSnapshot.showcaseOrbitCount + (selectedSatellite ? 1 : 0)}
              orbitLabel={t("layers.orbits")}
              orbitsVisible={satelliteSnapshot.orbitVisible}
              overviewLabel={t("orbitLegend.overview")}
              semanticLabel={t("orbitLegend.semantic")}
              semanticMarkerCount={satelliteSnapshot.semanticMarkerCount}
              signalCount={satelliteSnapshot.signalCount}
              signalLabel={t("orbitLegend.signals")}
              title={t("orbitLegend.title")}
              visibleSummary={t("orbitLegend.visible", {
                count: satelliteSnapshot.renderedCount,
                total: satelliteSnapshot.totalCount,
              })}
            />
          )}

          {!isLoading && (
            <div className="earth-mission-dock glass-surface">
              {!selectedSatellite && !selectedLaunch && (
                <EarthContextCards
                  nextLaunch={nextLaunch}
                  onSelectLaunch={(id) => launchLayerRef.current?.selectLaunch(id, true)}
                  onSelectSatellite={(id) => {
                    satelliteLayerRef.current?.selectSatellite(id);
                    window.setTimeout(() => satelliteLayerRef.current?.focusSelected(), 80);
                  }}
                  station={priorityStation}
                />
              )}
              <EarthControls
                onFlyTo={flyTo}
                onToggleRotation={toggleRotation}
                snapshot={snapshot}
              />
            </div>
          )}

          {snapshot.activePreset === "iss" && !isLoading && (
            <p className="camera-context glass-surface">{t("camera.issNotice")}</p>
          )}
          {(snapshot.activePreset === "moon" || snapshot.activePreset === "sun") && !isLoading && (
            <p className="camera-context glass-surface">{t(`camera.${snapshot.activePreset}Notice`)}</p>
          )}

          {selectedSatellite && (
            <SatelliteInfoPanel
              fetchedAt={satelliteCatalogQuery.data?.fetchedAt ?? null}
              followActive={satelliteSnapshot.followSelected}
              groundTrackVisible={satelliteSnapshot.groundTrackVisible}
              onFocus={() => satelliteLayerRef.current?.focusSelected()}
              onAnalyze={() => onOpenAnalysis?.(selectedSatellite.id)}
              onClose={closeSatellite}
              onHide={hideSelectedSatellite}
              onToggleFollow={() => satelliteLayerRef.current?.setFollowSelected(!satelliteSnapshot.followSelected)}
              onToggleGroundTrack={() => satelliteLayerRef.current?.setGroundTrackVisible(!satelliteSnapshot.groundTrackVisible)}
              onToggleOrbit={() => satelliteLayerRef.current?.setOrbitVisible(!satelliteSnapshot.orbitVisible)}
              orbitVisible={satelliteSnapshot.orbitVisible}
              satellite={selectedSatellite}
              source={satelliteCatalogQuery.data?.source ?? null}
              stale={satelliteCatalogQuery.data?.stale ?? false}
              telemetry={satelliteSnapshot.selectedTelemetry}
            />
          )}
          {selectedLaunch && selectedLaunchSite && !selectedSatellite && (
            <LaunchGlobePanel
              fetchedAt={spaceIntelligenceQuery.data?.fetchedAt ?? null}
              launch={selectedLaunch}
              nowIso={snapshot.utcIso}
              onClose={closeLaunch}
              onFocus={() => launchLayerRef.current?.focusSelected()}
              onSelectLaunch={(id) => launchLayerRef.current?.selectLaunch(id)}
              site={selectedLaunchSite}
              source={spaceIntelligenceQuery.data?.source ?? null}
              stale={spaceIntelligenceQuery.data?.stale ?? false}
            />
          )}

          {hoveredSatellite && satelliteSnapshot.hoverScreenPosition && !selectedSatellite && (
            <EarthObjectTooltip
              accent={hoveredSatellite.category === "station"
                ? "station"
                : hoveredSatellite.category === "rocket-body" ? "rocket" : "satellite"}
              facts={[
                t("satellites:details.norad", { id: hoveredSatellite.noradId }),
                satelliteSnapshot.hoveredTelemetry
                  ? formatDistanceFromKm(satelliteSnapshot.hoveredTelemetry.altitudeKm, units, i18n.resolvedLanguage ?? "en", 0)
                  : "",
                satelliteSnapshot.hoveredTelemetry
                  ? formatOrbitalSpeed(satelliteSnapshot.hoveredTelemetry.velocityKmPerSecond, units, i18n.resolvedLanguage ?? "en")
                  : "",
              ]}
              label={t(`satellites:category.${hoveredSatellite.category}`)}
              position={satelliteSnapshot.hoverScreenPosition}
              title={hoveredSatellite.name}
            />
          )}
          {hoveredLaunchSite && launchSnapshot.hoverScreenPosition && !selectedLaunch && !hoveredSatellite && (
            <EarthObjectTooltip
              accent="launch"
              facts={[
                hoveredLaunchSite.countryName ?? "",
                t("launches:globe.upcomingCount", { count: hoveredLaunchSite.launches.length }),
              ]}
              label={t("launches:globe.siteEyebrow")}
              position={launchSnapshot.hoverScreenPosition}
              title={hoveredLaunchSite.name}
            />
          )}
        </div>
      )}

      {isLoading && (
        <div className="earth-loading" role="status">
          <BrandMark className="earth-loading__mark" />
          <p>{t("loading.eyebrow")}</p>
          <h1>{t("loading.title")}</h1>
          <span>{t("loading.description")}</span>
          <div className="earth-loading__track"><i /></div>
        </div>
      )}

      {isError && (
        <div className="earth-error" role="alert">
          <BrandMark className="earth-loading__mark" />
          <h1>{t("error.title")}</h1>
          <p>{t("error.description")}</p>
          {snapshot.errorDetail && (
            <code className="earth-error__detail">{snapshot.errorDetail}</code>
          )}
          <button onClick={() => setAttempt((value) => value + 1)} type="button">
            <ArrowClockwise24Regular aria-hidden />
            {t("error.retry")}
          </button>
        </div>
      )}
    </section>
  );
}
