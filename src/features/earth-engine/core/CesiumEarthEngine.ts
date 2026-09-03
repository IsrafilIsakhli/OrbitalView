import {
  CesiumWidget,
  Clock,
  ClockStep,
  EllipsoidTerrainProvider,
  ImageryLayer,
  JulianDate,
  SingleTileImageryProvider,
  TileMapServiceImageryProvider,
  buildModuleUrl,
} from "cesium";

import type { GraphicsQuality } from "@/features/settings/model/preferences";

import { CesiumCameraController } from "../camera/CesiumCameraController";
import type {
  CameraCompositionInsets,
  CameraPresetId,
  EarthEngine,
  EarthEngineOptions,
  EarthEngineSnapshot,
  EarthTimeLensState,
  SurfaceProviderStatus,
} from "../contracts/earth-engine";
import { initialEarthEngineSnapshot } from "../contracts/earth-engine";
import type { EarthEngineLayer, EarthLayerSlot } from "../contracts/layers";
import { AdaptiveQualityController } from "../quality/AdaptiveQualityController";
import {
  qualityAtMost,
  qualityProfiles,
  recommendGpuQuality,
} from "../quality/qualityProfiles";
import { configureScene } from "../scene/configureScene";
import { ScientificCloudLayer } from "../scene/ScientificCloudLayer";
import { ProceduralStarLayer } from "../scene/ProceduralStarLayer";
import { SurfaceProviderCoordinator } from "../scene/SurfaceProviderCoordinator";
import {
  inspectGpuCapabilities,
  readDeviceMemoryGb,
  webGlContextAttributes,
} from "../telemetry/gpuCapabilities";
import { PerformanceMonitor } from "../telemetry/PerformanceMonitor";
import { EarthLayerRegistry } from "./EarthLayerRegistry";

const ADAPTATION_WARMUP_MS = 8_000;
const INTERACTION_RESOLUTION_RESTORE_MS = 160;
const SURFACE_BUSY_TILE_THRESHOLD = 12;
const OCEAN_BASE_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAANSURBVBhXY+BKmPEfAAN8AgIO8u8MAAAAAElFTkSuQmCC";
const NASA_BLUE_MARBLE_URL =
  "/assets/earth/nasa-blue-marble-2004-12.jpg";

async function createLocalBaseLayer(): Promise<ImageryLayer> {
  try {
    const provider = await SingleTileImageryProvider.fromUrl(
      NASA_BLUE_MARBLE_URL,
    );
    return new ImageryLayer(provider, {
      brightness: 0.92,
      contrast: 1.09,
      saturation: 0.9,
    });
  } catch {
    // Continue with Cesium's packaged offline surface if the installed NASA
    // asset is damaged or omitted by a downstream distributor.
  }

  try {
    const provider = await TileMapServiceImageryProvider.fromUrl(
      buildModuleUrl("Assets/Textures/NaturalEarthII"),
    );
    return new ImageryLayer(provider, {
      brightness: 0.92,
      contrast: 1.06,
      saturation: 0.88,
    });
  } catch {
    const provider = await SingleTileImageryProvider.fromUrl(
      OCEAN_BASE_DATA_URI,
    );
    return new ImageryLayer(provider);
  }
}

export class CesiumEarthEngine implements EarthEngine {
  private active = true;
  private adaptiveQuality: AdaptiveQualityController | null = null;
  private appliedQuality: GraphicsQuality;
  private cameraController: CesiumCameraController | null = null;
  private cloudLayer: ScientificCloudLayer | null = null;
  private disposed = false;
  private initialized = false;
  private interactionResolutionActive = false;
  private interactionRestoreTimer: ReturnType<typeof setTimeout> | null = null;
  private layerRegistry: EarthLayerRegistry | null = null;
  private readonly listeners = new Set<() => void>();
  private performanceMonitor: PerformanceMonitor | null = null;
  private qualityCap: GraphicsQuality;
  private readyAt = 0;
  private recommendedQuality: GraphicsQuality = "balanced";
  private reducedMotion: boolean;
  private removePreRender: (() => void) | null = null;
  private removeRenderError: (() => void) | null = null;
  private removeTileProgress: (() => void) | null = null;
  private snapshot: EarthEngineSnapshot;
  private starLayer: ProceduralStarLayer | null = null;
  private surfaceBusy = true;
  private surfaceCoordinator: SurfaceProviderCoordinator | null = null;
  private timeLensState: EarthTimeLensState | null = null;
  private widget: CesiumWidget | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly options: EarthEngineOptions,
  ) {
    this.qualityCap = options.qualityCap;
    this.appliedQuality = options.qualityCap;
    this.reducedMotion = options.reduceMotion;
    this.snapshot = {
      ...initialEarthEngineSnapshot,
      autoRotation: !options.reduceMotion,
      phase: "idle",
      quality: options.qualityCap,
    };
  }

  getSnapshot = (): EarthEngineSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async initialize(): Promise<void> {
    if (this.initialized || this.disposed) {
      return;
    }
    this.initialized = true;
    this.update({ phase: "initializing" });

    try {
      const baseLayer = await createLocalBaseLayer();
      const clock = new Clock({
        clockStep: ClockStep.SYSTEM_CLOCK,
        shouldAnimate: true,
      });

      this.widget = new CesiumWidget(this.container, {
        baseLayer,
        clock,
        contextOptions: {
          allowTextureFilterAnisotropic: true,
          webgl: webGlContextAttributes,
        },
        msaaSamples: qualityProfiles[this.qualityCap].msaaSamples,
        // The scene uses thin points/lines rather than interpenetrating translucent
        // volumes. Standard depth-tested alpha avoids Cesium's additional OIT
        // framebuffer passes while preserving the intended SSA hierarchy.
        orderIndependentTranslucency: false,
        requestRenderMode: false,
        scene3DOnly: true,
        shouldAnimate: true,
        showRenderLoopErrors: false,
        targetFrameRate: 60,
        terrainProvider: new EllipsoidTerrainProvider(),
        useBrowserRecommendedResolution: true,
      });

      if (this.disposed) {
        this.widget.destroy();
        this.widget = null;
        return;
      }

      this.widget.canvas.setAttribute("aria-label", this.options.canvasLabel);
      this.widget.canvas.setAttribute("role", "img");
      this.widget.canvas.tabIndex = 0;
      configureScene(this.widget);

      const gpu = inspectGpuCapabilities(this.widget.scene);

      this.recommendedQuality = recommendGpuQuality(
        gpu,
        navigator.hardwareConcurrency || 4,
        readDeviceMemoryGb(),
      );
      const initialQuality = qualityAtMost(
        this.recommendedQuality,
        this.qualityCap,
      );
      this.adaptiveQuality = new AdaptiveQualityController(
        initialQuality,
        this.qualityCap,
      );

      this.cameraController = new CesiumCameraController(
        this.widget.scene,
        this.widget.camera,
        this.widget.canvas,
        this.widget.clock,
        (activePreset) => this.update({ activePreset }),
      );
      this.cameraController.setReducedMotion(this.reducedMotion);
      this.cameraController.setAutoRotation(!this.reducedMotion);

      this.cloudLayer = new ScientificCloudLayer(initialQuality);
      this.starLayer = new ProceduralStarLayer(initialQuality);
      this.layerRegistry = new EarthLayerRegistry({
        cameraController: this.cameraController,
        clock: this.widget.clock,
        requestRender: () => this.widget?.scene.requestRender(),
        scene: this.widget.scene,
      });
      await this.layerRegistry.register(this.starLayer);
      await this.layerRegistry.register(this.cloudLayer);
      await this.layerRegistry.mount();

      this.applyQuality(initialQuality);
      this.cameraController.flyTo("earth", true);
      this.installRenderLifecycle();

      this.surfaceCoordinator = new SurfaceProviderCoordinator(
        this.widget,
        this.handleSurfaceUpdate,
        baseLayer,
      );
      this.surfaceCoordinator.start();

      this.performanceMonitor = new PerformanceMonitor(
        this.widget.scene,
        this.handlePerformanceSample,
      );
      this.performanceMonitor.start();

      this.readyAt = performance.now();
      this.update({
        autoRotation: !this.reducedMotion,
        cloudCount: this.cloudLayer.getCount(),
        gpu,
        imagery: "loading",
        phase: "ready",
        quality: initialQuality,
        terrain: "loading",
      });
    } catch (error) {
      if (!this.disposed) {
        this.releaseRuntime();
        this.update({
          errorDetail: error instanceof Error ? error.message : String(error),
          phase: "error",
        });
      }
    }
  }

  flyTo(preset: CameraPresetId): void {
    this.cameraController?.flyTo(preset);
  }

  setCameraCompositionInsets(insets: CameraCompositionInsets): void {
    this.cameraController?.setCompositionInsets(insets);
  }

  setDefaultCameraCompositionInsets(insets: CameraCompositionInsets): void {
    this.cameraController?.setDefaultCompositionInsets(insets);
  }

  async registerLayer(layer: EarthEngineLayer): Promise<() => void> {
    if (!this.layerRegistry || this.disposed) {
      throw new Error("Earth engine is not ready to register layers");
    }
    return this.layerRegistry.register(layer);
  }

  returnToDefaultEarth(): boolean {
    return this.cameraController?.returnToDefaultEarth() ?? false;
  }

  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    this.layerRegistry?.setActive(active);
    if (!this.widget) return;
    this.widget.clock.shouldAnimate = active && (
      this.timeLensState === null || this.timeLensState.playing
    );
    this.widget.scene.requestRenderMode = !active || !this.snapshot.autoRotation;
    this.widget.scene.maximumRenderTimeChange = active && this.snapshot.autoRotation ? 0 : Number.POSITIVE_INFINITY;
    if (active) {
      this.performanceMonitor?.start();
      this.widget.scene.requestRender();
    } else {
      this.performanceMonitor?.dispose();
    }
  }

  setAutoRotation(enabled: boolean): void {
    const next = enabled && !this.reducedMotion;
    this.cameraController?.setAutoRotation(next);
    if (this.widget) {
      this.widget.scene.requestRenderMode = !next;
      this.widget.scene.maximumRenderTimeChange = next ? 0 : 1;
      this.widget.scene.requestRender();
    }
    this.update({ autoRotation: next });
  }

  setCloudsVisible(visible: boolean): void {
    this.cloudLayer?.setVisible(visible);
    this.update({ cloudsVisible: visible });
  }

  setLayerSlotVisible(slot: EarthLayerSlot, visible: boolean): void {
    this.layerRegistry?.setSlotVisible(slot, visible);
  }

  setNightLightsVisible(visible: boolean): void {
    this.surfaceCoordinator?.setNightLightsVisible(visible);
    this.update({ nightLightsVisible: visible });
  }

  setQualityCap(quality: GraphicsQuality): void {
    this.qualityCap = quality;
    const next = qualityAtMost(this.recommendedQuality, quality);
    this.adaptiveQuality = new AdaptiveQualityController(next, quality);
    this.applyQuality(next);
  }

  setReduceMotion(reduceMotion: boolean): void {
    this.reducedMotion = reduceMotion;
    this.cameraController?.setReducedMotion(reduceMotion);
    if (reduceMotion) {
      this.setAutoRotation(false);
    }
  }

  setTimeLensState(state: EarthTimeLensState | null): void {
    if (!this.widget || this.disposed) return;
    const { clock, scene } = this.widget;
    if (state === null) {
      this.timeLensState = null;
      clock.clockStep = ClockStep.SYSTEM_CLOCK;
      clock.multiplier = 1;
      clock.currentTime = JulianDate.fromDate(new Date());
      clock.shouldAnimate = this.active;
      this.update({
        timeLensActive: false,
        timeLensPlaying: false,
        timeLensRate: 60,
        utcIso: new Date().toISOString(),
      });
      scene.requestRender();
      return;
    }

    const normalized: EarthTimeLensState = {
      playing: Boolean(state.playing),
      rate: Number.isFinite(state.rate) ? Math.max(1, state.rate) : 60,
      timestampUnixMs: Number.isFinite(state.timestampUnixMs)
        ? state.timestampUnixMs
        : Date.now(),
    };
    this.timeLensState = normalized;
    clock.clockStep = ClockStep.SYSTEM_CLOCK_MULTIPLIER;
    clock.multiplier = normalized.playing ? normalized.rate : 0;
    clock.currentTime = JulianDate.fromDate(new Date(normalized.timestampUnixMs));
    clock.shouldAnimate = this.active && normalized.playing;
    this.update({
      timeLensActive: true,
      timeLensPlaying: normalized.playing,
      timeLensRate: normalized.rate,
      utcIso: new Date(normalized.timestampUnixMs).toISOString(),
    });
    scene.requestRender();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.releaseRuntime();
    this.snapshot = { ...this.snapshot, phase: "disposed" };
    for (const listener of this.listeners) {
      listener();
    }
    this.listeners.clear();
  }

  private releaseRuntime(): void {
    this.surfaceCoordinator?.dispose();
    this.performanceMonitor?.dispose();
    this.removePreRender?.();
    this.removeRenderError?.();
    this.removeTileProgress?.();
    this.widget?.canvas.removeEventListener(
      "webglcontextlost",
      this.handleContextLost,
    );
    this.widget?.canvas.removeEventListener(
      "pointerdown",
      this.handleInteractionStart,
    );
    this.widget?.canvas.removeEventListener(
      "wheel",
      this.handleTransientInteraction,
    );
    window.removeEventListener("pointerup", this.handleInteractionEnd);
    window.removeEventListener("pointercancel", this.handleInteractionEnd);
    if (this.interactionRestoreTimer !== null) {
      clearTimeout(this.interactionRestoreTimer);
      this.interactionRestoreTimer = null;
    }
    this.interactionResolutionActive = false;
    this.removePreRender = null;
    this.removeRenderError = null;
    this.removeTileProgress = null;
    this.cameraController?.dispose();
    this.layerRegistry?.dispose();

    if (this.widget && !this.widget.isDestroyed()) {
      this.widget.destroy();
    }
    this.widget = null;
    this.surfaceCoordinator = null;
    this.performanceMonitor = null;
    this.cameraController = null;
    this.layerRegistry = null;
    this.cloudLayer = null;
    this.starLayer = null;
  }

  private applyQuality(quality: GraphicsQuality): void {
    if (!this.widget || this.disposed) {
      return;
    }
    const profile = qualityProfiles[quality];
    const { scene } = this.widget;

    this.appliedQuality = quality;
    this.applyResolutionScale();
    this.widget.useBrowserRecommendedResolution =
      profile.useBrowserRecommendedResolution;
    this.widget.targetFrameRate = profile.targetFrameRate;
    scene.globe.maximumScreenSpaceError = profile.maximumScreenSpaceError;
    scene.globe.tileCacheSize = profile.terrainTileCacheSize;
    scene.fog.enabled = profile.fog;
    scene.fog.renderable = profile.fog;
    scene.msaaSamples = scene.msaaSupported
      ? Math.min(profile.msaaSamples, this.snapshot.gpu?.maxMsaaSamples ?? 4)
      : 1;
    scene.postProcessStages.fxaa.enabled =
      !scene.msaaSupported || scene.msaaSamples <= 1;
    this.layerRegistry?.setQuality(quality);
    scene.requestRender();
    this.update({
      cloudCount: this.cloudLayer?.getCount() ?? 0,
      quality,
    });
  }

  private installRenderLifecycle(): void {
    if (!this.widget) {
      return;
    }
    let previousFrameAt = performance.now();

    this.widget.canvas.addEventListener(
      "webglcontextlost",
      this.handleContextLost,
    );
    this.widget.canvas.addEventListener(
      "pointerdown",
      this.handleInteractionStart,
      { passive: true },
    );
    this.widget.canvas.addEventListener(
      "wheel",
      this.handleTransientInteraction,
      { passive: true },
    );
    window.addEventListener("pointerup", this.handleInteractionEnd, {
      passive: true,
    });
    window.addEventListener("pointercancel", this.handleInteractionEnd, {
      passive: true,
    });

    this.removePreRender = this.widget.scene.preRender.addEventListener(() => {
      if (!this.active) return;
      const now = performance.now();
      const deltaSeconds = Math.min(0.1, (now - previousFrameAt) / 1_000);
      previousFrameAt = now;
      this.cameraController?.tick(deltaSeconds);
      this.layerRegistry?.tick(deltaSeconds);
      if (this.timeLensState?.playing && this.widget) {
        const timestampUnixMs = JulianDate.toDate(
          this.widget.clock.currentTime,
        ).getTime();
        this.timeLensState = {
          ...this.timeLensState,
          timestampUnixMs,
        };
      }
    });
    this.removeRenderError = this.widget.scene.renderError.addEventListener(
      (_scene, error: unknown) => {
        this.update({
          errorDetail: error instanceof Error ? error.message : String(error),
          phase: "error",
        });
      },
    );
    this.removeTileProgress =
      this.widget.scene.globe.tileLoadProgressEvent.addEventListener(
        (pendingTiles: number) => {
          // A few background tiles are normal while the cinematic camera is
          // moving. Only suppress quality decisions during a material burst.
          this.surfaceBusy = pendingTiles > SURFACE_BUSY_TILE_THRESHOLD;
        },
      );
  }

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.update({ phase: "error" });
  };

  private readonly handleInteractionStart = (): void => {
    if (this.interactionRestoreTimer !== null) {
      clearTimeout(this.interactionRestoreTimer);
      this.interactionRestoreTimer = null;
    }
    if (this.interactionResolutionActive) return;
    this.interactionResolutionActive = true;
    this.applyResolutionScale();
  };

  private readonly handleInteractionEnd = (): void => {
    if (!this.interactionResolutionActive) return;
    if (this.interactionRestoreTimer !== null) {
      clearTimeout(this.interactionRestoreTimer);
    }
    this.interactionRestoreTimer = setTimeout(() => {
      this.interactionRestoreTimer = null;
      this.interactionResolutionActive = false;
      this.applyResolutionScale();
      this.widget?.scene.requestRender();
    }, INTERACTION_RESOLUTION_RESTORE_MS);
  };

  private readonly handleTransientInteraction = (): void => {
    this.handleInteractionStart();
    this.handleInteractionEnd();
  };

  private applyResolutionScale(): void {
    if (!this.widget) return;
    const profile = qualityProfiles[this.appliedQuality];
    const interactionFactor = this.interactionResolutionActive
      ? profile.interactionResolutionFactor
      : 1;
    this.widget.resolutionScale = profile.resolutionScale * interactionFactor;
  }

  private readonly handlePerformanceSample = (sample: {
    fps: number;
    frameTimeMs: number;
    memory: EarthEngineSnapshot["memory"];
  }): void => {
    if (this.disposed) {
      return;
    }

    const clockTime = this.widget
      ? JulianDate.toDate(this.widget.clock.currentTime).toISOString()
      : new Date().toISOString();
    this.update({
      fps: sample.fps,
      frameTimeMs: sample.frameTimeMs,
      memory: sample.memory,
      utcIso: clockTime,
    });

    if (performance.now() - this.readyAt < ADAPTATION_WARMUP_MS) {
      return;
    }
    const nextQuality = this.adaptiveQuality?.sample(
      sample.fps,
      this.surfaceBusy,
    );
    if (nextQuality) {
      this.applyQuality(nextQuality);
    }
  };

  private readonly handleSurfaceUpdate = (update: {
    imagery?: SurfaceProviderStatus;
    terrain?: SurfaceProviderStatus;
  }): void => {
    const nextImagery = update.imagery ?? this.snapshot.imagery;
    const nextTerrain = update.terrain ?? this.snapshot.terrain;
    const degraded =
      nextImagery === "fallback" || nextTerrain === "fallback";
    this.update({
      ...update,
      phase: degraded ? "degraded" : "ready",
    });
  };

  private update(patch: Partial<EarthEngineSnapshot>): void {
    if (this.disposed) {
      return;
    }
    const keys = Object.keys(patch) as Array<keyof EarthEngineSnapshot>;
    if (
      keys.length === 0 ||
      keys.every((key) => Object.is(this.snapshot[key], patch[key]))
    ) {
      return;
    }
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) {
      listener();
    }
  }
}
