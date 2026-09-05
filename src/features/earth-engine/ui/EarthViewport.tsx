import { registerUpdatePause } from "@/features/updater/domain/updateBarrier";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { measureOverlayInsets, type MeasuredOverlay } from "../camera/overlayInsets";

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
import { formatNumber, formatTime } from "@/shared/i18n/formatters";
import { formatDistanceFromKm, formatOrbitalSpeed } from "@/shared/formatting/units";
import { AUTOMATIC_REFRESH_INTERVAL_MS } from "@/shared/data/refreshPolicy";
import { isTauriRuntime } from "@/shared/platform/window-controls";

import type {
  CameraPresetId,
  EarthEngine,
  EarthEngineSnapshot,
  EarthTimeLensState,
} from "../contracts/earth-engine";
import { initialEarthEngineSnapshot } from "../contracts/earth-engine";
import { closeEarthFocusSession } from "../camera/earthFocusLifecycle";
import { useEarthTimeLensSelectionStore } from "../model/timeLensSelection";
import { clampTimeLensTimestamp } from "../time/orbitalTimeLens";
import { EarthControls } from "./EarthControls";
import { EarthContextCards } from "./EarthContextCards";
import { EarthLayerPanel } from "./EarthLayerPanel";
import { EarthObjectTooltip } from "./EarthObjectTooltip";
import { OrbitalTimeLens } from "./OrbitalTimeLens";

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
  const frameRateMode = usePreferencesStore((state) => state.earthFrameRateMode);
  const drawerOpen = usePreferencesStore((state) => state.earthLayerDrawerOpen);
  const setDrawerOpen = usePreferencesStore((state) => state.setEarthLayerDrawerOpen);
  const updatePausedRef = useRef(false);
  const windowVisibleRef = useRef(true);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const requestedTimeLens = useEarthTimeLensSelectionStore((state) => state.request);
  const clearRequestedTimeLens = useEarthTimeLensSelectionStore((state) => state.clearRequest);
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
    frameRateMode,
    reduceMotion,
  });
  const [attempt, setAttempt] = useState(0);
  const [timeLensWindowStartUnixMs, setTimeLensWindowStartUnixMs] = useState(0);
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
  const selectedTelemetryReady = satelliteSnapshot.selectedTelemetry !== null;
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
      frameRateMode,
      reduceMotion,
    };
  }, [active, canvasLabel, graphicsQuality, frameRateMode, reduceMotion]);

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
        engine.setUpdatePaused(updatePausedRef.current);
        engine.setWindowVisible(windowVisibleRef.current);
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
            engine?.setFollowActive(nextSatelliteSnapshot.followSelected);
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
        engine.setActive(engineOptionsRef.current.active);
        engine.setUpdatePaused(updatePausedRef.current);
        engine.setFrameRateMode(engineOptionsRef.current.frameRateMode);
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
      if (focusTimerRef.current !== null) clearTimeout(focusTimerRef.current);
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

  useEffect(() => registerUpdatePause(() => {
    updatePausedRef.current = true;
    engineRef.current?.setUpdatePaused(true);
    return () => {
      updatePausedRef.current = false;
      engineRef.current?.setUpdatePaused(false);
    };
  }), []);

  useEffect(() => { engineRef.current?.setFrameRateMode(frameRateMode); }, [frameRateMode]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let disposed = false;
    let sequence = 0;
    const removers: (() => void)[] = [];
    const nativeWindow = getCurrentWindow();
    const check = async () => {
      const request = ++sequence;
      const minimized = await nativeWindow.isMinimized();
      if (!disposed && request === sequence) {
        windowVisibleRef.current = !minimized;
        engineRef.current?.setWindowVisible(!minimized);
      }
    };
    const refresh = () => { void check().catch(() => undefined); };
    for (const registration of [nativeWindow.onResized(refresh), nativeWindow.onFocusChanged(refresh)]) {
      void registration.then((remove) => {
        if (disposed) remove(); else removers.push(remove);
      }).catch(() => undefined);
    }
    refresh();
    return () => { disposed = true; removers.forEach((remove) => remove()); };
  }, [attempt]);

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
    if (active && requestedSatelliteId && satelliteCatalogQuery.data && satelliteSnapshot.status === "ready") {
      const layer = satelliteLayerRef.current;
      if (!layer) return;
      if (layer.getSnapshot().selectedId !== requestedSatelliteId) layer.selectSatellite(requestedSatelliteId);
      const timer = window.setTimeout(() => {
        if (engineOptionsRef.current.active && layer.getSnapshot().selectedId === requestedSatelliteId && layer.getSnapshot().selectedTelemetry) {
          layer.focusSelected();
          clearRequestedSatellite();
        }
      }, 80);
      return () => window.clearTimeout(timer);
    }
  }, [active, requestedSatelliteId, satelliteCatalogQuery.data, satelliteSnapshot.status, selectedTelemetryReady, clearRequestedSatellite]);

  useEffect(() => {
    if (requestedLaunchId && spaceIntelligenceQuery.data) {
      launchLayerRef.current?.selectLaunch(requestedLaunchId, true);
    }
  }, [requestedLaunchId, spaceIntelligenceQuery.data]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (!active || event.key !== "Escape" || event.defaultPrevented) return;
      const hasSelection = Boolean(
        satelliteLayerRef.current?.getSnapshot().selectedId
        || launchLayerRef.current?.getSnapshot().selectedId,
      );
      if (!hasSelection) {
        if (drawerOpen) { event.preventDefault(); setDrawerOpen(false); return; }
        if (engineRef.current?.getSnapshot().timeLensActive) {
          engineRef.current.setTimeLensState(null);
          satelliteLayerRef.current?.setTimeLensState(null);
        }
        return;
      }
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
  }, [active, clearRequestedLaunch, clearRequestedSatellite, drawerOpen, setDrawerOpen]);

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

  const applyTimeLensState = useCallback((state: EarthTimeLensState | null) => {
    engineRef.current?.setTimeLensState(state);
    satelliteLayerRef.current?.setTimeLensState(state);
  }, []);

  useEffect(() => {
    if (!active || !requestedTimeLens || snapshot.phase !== "ready") return;
    const timer = window.setTimeout(() => {
      const now = Date.now();
      const requestedTimestamp = requestedTimeLens.timestampUnixMs;
      const windowStartUnixMs = Math.max(now, requestedTimestamp - 6 * 60 * 60_000);
      setTimeLensWindowStartUnixMs(windowStartUnixMs);
      applyTimeLensState({
        playing: false,
        rate: snapshot.timeLensRate,
        timestampUnixMs: requestedTimestamp,
      });
      clearRequestedTimeLens(requestedTimeLens.id);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    active,
    applyTimeLensState,
    clearRequestedTimeLens,
    requestedTimeLens,
    snapshot.phase,
    snapshot.timeLensRate,
  ]);

  const toggleTimeLens = useCallback(() => {
    if (snapshot.timeLensActive) {
      applyTimeLensState(null);
      return;
    }
    const timestampUnixMs = Date.now();
    setTimeLensWindowStartUnixMs(timestampUnixMs);
    applyTimeLensState({
      playing: false,
      rate: snapshot.timeLensRate,
      timestampUnixMs,
    });
  }, [applyTimeLensState, snapshot.timeLensActive, snapshot.timeLensRate]);

  const scrubTimeLens = useCallback((timestampUnixMs: number) => {
    applyTimeLensState({
      playing: false,
      rate: snapshot.timeLensRate,
      timestampUnixMs: clampTimeLensTimestamp(
        timestampUnixMs,
        timeLensWindowStartUnixMs,
      ),
    });
  }, [applyTimeLensState, snapshot.timeLensRate, timeLensWindowStartUnixMs]);

  const setTimeLensPlaying = useCallback((playing: boolean) => {
    applyTimeLensState({
      playing,
      rate: snapshot.timeLensRate,
      timestampUnixMs: clampTimeLensTimestamp(
        Date.parse(snapshot.utcIso),
        timeLensWindowStartUnixMs,
      ),
    });
  }, [applyTimeLensState, snapshot.timeLensRate, snapshot.utcIso, timeLensWindowStartUnixMs]);

  const setTimeLensRate = useCallback((rate: number) => {
    applyTimeLensState({
      playing: snapshot.timeLensPlaying,
      rate,
      timestampUnixMs: clampTimeLensTimestamp(
        Date.parse(snapshot.utcIso),
        timeLensWindowStartUnixMs,
      ),
    });
  }, [applyTimeLensState, snapshot.timeLensPlaying, snapshot.utcIso, timeLensWindowStartUnixMs]);

  const resetTimeLensToNow = useCallback(() => {
    const timestampUnixMs = Date.now();
    setTimeLensWindowStartUnixMs(timestampUnixMs);
    applyTimeLensState({
      playing: false,
      rate: snapshot.timeLensRate,
      timestampUnixMs,
    });
  }, [applyTimeLensState, snapshot.timeLensRate]);

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
      const root = viewportRef.current;
      if (!root) return;
      const bounds = container.getBoundingClientRect();
      const overlays: MeasuredOverlay[] = [];
      const add = (element: HTMLElement | null, edge: MeasuredOverlay["edge"]) => {
        if (element && element.getClientRects().length && !element.hidden) {
          overlays.push({ bounds: element.getBoundingClientRect(), edge });
        }
      };
      add(root.querySelector(".earth-overview"), "top");
      add(root.querySelector(".earth-mission-dock"), "bottom");
      add(root.querySelector(".orbital-time-lens"), "bottom");
      add(document.querySelector(".command-bar"), "top");
      const panel = root.querySelector<HTMLElement>(".earth-layer-panel");
      const inspector = root.querySelector<HTMLElement>(".object-inspector");
      add(panel, bounds.width < 768 ? "bottom" : "right");
      if (!selectedSatellite && !selectedLaunch) {
        engineRef.current?.setDefaultCameraCompositionInsets(measureOverlayInsets(bounds, overlays));
      }
      add(inspector, bounds.width < 768 ? "bottom" : "right");
      engineRef.current?.setCameraCompositionInsets(measureOverlayInsets(bounds, overlays));
    };
    updateComposition();
    const observer = new ResizeObserver(updateComposition);
    observer.observe(container);
    const root = viewportRef.current;
    root?.querySelectorAll<HTMLElement>(
      ".earth-overview, .earth-layer-panel, .object-inspector, .earth-mission-dock, .orbital-time-lens",
    ).forEach((element) => observer.observe(element));
    // Details toggles and drawer visibility can change without resizing the canvas.
    root?.addEventListener("toggle", updateComposition, true);
    return () => {
      observer.disconnect();
      root?.removeEventListener("toggle", updateComposition, true);
    };
  }, [selectedLaunch, selectedSatellite, drawerOpen, snapshot.phase, snapshot.timeLensActive]);
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

  useEffect(() => {
    if (!isError) return;
    const timer = window.setTimeout(
      () => setAttempt((value) => value + 1),
      AUTOMATIC_REFRESH_INTERVAL_MS,
    );
    return () => window.clearTimeout(timer);
  }, [isError]);

  return (
    <section
      aria-label={t("regionLabel")}
      className="earth-viewport"
      ref={viewportRef}
      data-engine-fps={snapshot.fps ?? "pending"}
      data-engine-phase={snapshot.phase}
      data-render-mode={snapshot.renderMode}
      data-presented-frames={snapshot.presentedFrames}
      data-frame-p95={snapshot.p95FrameTimeMs ?? ""}
      data-drawer-open={drawerOpen && !selectedSatellite && !selectedLaunch}
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
      data-time-lens={snapshot.timeLensActive ? "forecast" : "live"}
    >
      <div className="earth-render-surface" ref={containerRef} />

      {!isError && (
        <div className="earth-hud">
          <div className="earth-overview glass-surface">
            <div className="earth-identity__title-row">
              <h1>{t("title")}</h1>
              <div className="utc-clock">
                <span>{t("utc")}</span>
                <strong>{utc}</strong>
              </div>
            </div>
            <p className="earth-catalog-count">{t("overview.catalog", {
              amount: formatNumber(satelliteSnapshot.totalCount, i18n.resolvedLanguage),
            })}</p>
            <details className="earth-scene-details">
              <summary>{t("overview.sceneDetails")}</summary>
              <p>{t("surface.cloudCount")}</p>
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
            <details className="earth-diagnostics">
              <summary>{t("diagnostics.title")}</summary>
              <dl>
                <dt>{t("diagnostics.mode")}</dt><dd>{t(`diagnostics.${snapshot.renderMode}`)}</dd>
                <dt>{t("telemetry.quality")}</dt><dd>{t(`quality.${snapshot.quality}`)}</dd>
                <dt>{t("telemetry.fps")}</dt><dd>{snapshot.fps === null ? "—" : formatNumber(snapshot.fps, locale, { maximumFractionDigits: 1 })}</dd>
                <dt>{t("diagnostics.target")}</dt><dd>{snapshot.effectiveFrameRateTarget}</dd>
                <dt>{t("diagnostics.median")}</dt><dd>{snapshot.frameTimeMs?.toFixed(2) ?? "—"}</dd>
                <dt>{t("diagnostics.p95")}</dt><dd>{snapshot.p95FrameTimeMs?.toFixed(2) ?? "—"}</dd>
                <dt>{t("diagnostics.cpu")}</dt><dd>{snapshot.cpuRenderMs?.toFixed(2) ?? "—"}</dd>
                <dt>{t("diagnostics.gpu")}</dt><dd>{snapshot.gpuTimeMs?.toFixed(2) ?? "—"}</dd>
                <dt>{t("diagnostics.resolution")}</dt><dd>{snapshot.renderWidth} × {snapshot.renderHeight}</dd>
                <dt>{t("telemetry.renderer")}</dt><dd>{snapshot.gpu?.renderer ?? "—"}</dd>
              </dl>
              <p>{t("diagnostics.explanation")}</p>
            </details>
            </details>
          </div>

          {!selectedSatellite && !selectedLaunch && !isLoading && (
            <EarthLayerPanel
              open={drawerOpen}
              onOpenChange={setDrawerOpen}
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
            title={t("orbitLegend.openLayers")}
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
                    if (focusTimerRef.current !== null) clearTimeout(focusTimerRef.current);
                    focusTimerRef.current = setTimeout(() => {
                      focusTimerRef.current = null;
                      if (engineOptionsRef.current.active) satelliteLayerRef.current?.focusSelected();
                    }, 80);
                  }}
                  station={priorityStation}
                />
              )}
              <EarthControls
                onFlyTo={flyTo}
                onToggleRotation={toggleRotation}
                onToggleTimeLens={toggleTimeLens}
                snapshot={snapshot}
              />
            </div>
          )}

          {snapshot.timeLensActive && !isLoading && (
            <OrbitalTimeLens
              currentUnixMs={Date.parse(snapshot.utcIso)}
              launches={spaceIntelligenceQuery.data?.launches ?? []}
              onClose={() => applyTimeLensState(null)}
              onPlayChange={setTimeLensPlaying}
              onRateChange={setTimeLensRate}
              onResetToNow={resetTimeLensToNow}
              onScrub={scrubTimeLens}
              playing={snapshot.timeLensPlaying}
              rate={snapshot.timeLensRate}
              windowStartUnixMs={timeLensWindowStartUnixMs}
            />
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
              telemetry={satelliteSnapshot.selectedTelemetry}
            />
          )}
          {selectedLaunch && selectedLaunchSite && !selectedSatellite && (
            <LaunchGlobePanel
              launch={selectedLaunch}
              nowIso={snapshot.utcIso}
              onClose={closeLaunch}
              onFocus={() => launchLayerRef.current?.focusSelected()}
              onSelectLaunch={(id) => launchLayerRef.current?.selectLaunch(id)}
              site={selectedLaunchSite}
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
        </div>
      )}
    </section>
  );
}
