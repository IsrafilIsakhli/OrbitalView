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

import type { EarthFrameRateMode, GraphicsQuality } from "@/features/settings/model/preferences";

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
import { resumeEarthClock } from "../time/resumeEarthClock";
import { ScientificCloudLayer } from "../scene/ScientificCloudLayer";
import { SurfaceProviderCoordinator } from "../scene/SurfaceProviderCoordinator";
import {
  inspectGpuCapabilities,
  readDeviceMemoryGb,
  webGlContextAttributes,
} from "../telemetry/gpuCapabilities";
import { PerformanceMonitor, type PerformanceSample } from "../telemetry/PerformanceMonitor";
import { boundedResolutionScale, resolveRenderMode } from "./renderPolicy";
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
  private workspaceActive = true;
  private updatePaused = false;
  private windowVisible = true;
  private followActive = false;
  private cameraMoving = false;
  private frameRateMode: EarthFrameRateMode;
  private displayCadence = 60;
  private cadenceFrame: number | null = null;
  private recoveryFrame: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private removeCameraMotion: (() => void)[] = [];
  private enhancementLevel = 0;
  private weakWindows = 0;
  private strongWindows = 0;
  private enhancementsBlockedUntil = 0;
  private adaptiveQuality: AdaptiveQualityController | null = null;
  private appliedQuality: GraphicsQuality;
  private cameraController: CesiumCameraController | null = null;
  private cloudLayer: ScientificCloudLayer | null = null;
  private disposed = false;
  private initialized = false;
  private compositionInitialized = false;
  private contextLost = false;
  private renderFailed = false;
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
  private surfaceBusy = true;
  private surfaceCoordinator: SurfaceProviderCoordinator | null = null;
  private timeLensState: EarthTimeLensState | null = null;
  private widget: CesiumWidget | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly options: EarthEngineOptions,
  ) {
    this.qualityCap = options.qualityCap;
    this.workspaceActive = options.active ?? true;
    this.frameRateMode = options.frameRateMode ?? "60";
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
      this.widget.canvas.setAttribute("data-earth-focus-target", "");
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
      this.layerRegistry = new EarthLayerRegistry({
        cameraController: this.cameraController,
        clock: this.widget.clock,
        requestRender: () => this.widget?.scene.requestRender(),
        scene: this.widget.scene,
      });
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
      this.syncRenderPolicy();
      this.measureDisplayCadence();

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
    if (this.cameraController && !this.compositionInitialized) {
      this.compositionInitialized = true;
      if (this.snapshot.activePreset === "earth") this.cameraController.flyTo("earth", true);
    }
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
    this.workspaceActive = active;
    this.syncRenderPolicy();
  }

  setUpdatePaused(paused: boolean): void {
    this.updatePaused = paused;
    this.syncRenderPolicy();
  }

  setWindowVisible(visible: boolean): void {
    this.windowVisible = visible;
    this.syncRenderPolicy();
  }

  setFollowActive(active: boolean): void {
    this.followActive = active;
    this.syncRenderPolicy();
  }

  setFrameRateMode(mode: EarthFrameRateMode): void {
    this.frameRateMode = mode;
    this.measureDisplayCadence();
    this.syncRenderPolicy();
  }

  setAutoRotation(enabled: boolean): void {
    const next = enabled && !this.reducedMotion;
    this.cameraController?.setAutoRotation(next);
    this.update({ autoRotation: next });
    this.syncRenderPolicy();
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
    this.enhancementLevel = 0;
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
      this.syncRenderPolicy();
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
    this.syncRenderPolicy();
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
    this.removeCameraMotion.forEach((remove) => remove());
    this.removeCameraMotion = [];
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    document.removeEventListener("visibilitychange", this.handleVisibility);
    if (this.cadenceFrame !== null) cancelAnimationFrame(this.cadenceFrame);
    this.cadenceFrame = null;
    if (this.recoveryFrame !== null) cancelAnimationFrame(this.recoveryFrame);
    this.recoveryFrame = null;
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
    scene.globe.maximumScreenSpaceError = profile.maximumScreenSpaceError;
    scene.globe.tileCacheSize = profile.terrainTileCacheSize;
    scene.fog.enabled = profile.fog;
    scene.fog.renderable = profile.fog;
    scene.msaaSamples = scene.msaaSupported
      ? Math.min(this.enhancementLevel >= 2 ? 1 : profile.msaaSamples, this.snapshot.gpu?.maxMsaaSamples ?? 4)
      : 1;
    scene.postProcessStages.fxaa.enabled =
      !scene.msaaSupported || scene.msaaSamples <= 1;
    // Enhancements are shed before changing the existing scientific LOD profile.
    const bloom = scene.postProcessStages.bloom;
    // Disabled for the release profile: real-cache visual QA showed broad
    // yellow/red halos on night imagery. Re-enable only after a separate A/B gate.
    bloom.enabled = false;
    // Sun bloom is a separate, lightweight glow around the solar disc (not the
    // full post-process bloom above). Only the high profile pays for it.
    scene.sunBloom = profile.sunBloom;
    this.layerRegistry?.setQuality(quality);
    scene.requestRender();
    this.update({
      cloudCount: this.cloudLayer?.getCount() ?? 0,
      quality,
    });
    this.syncRenderPolicy();
  }

  private installRenderLifecycle(): void {
    if (!this.widget) {
      return;
    }
    let previousFrameAt = performance.now();
    document.addEventListener("visibilitychange", this.handleVisibility);
    this.resizeObserver = new ResizeObserver(() => {
      if (!this.active) return;
      this.applyResolutionScale();
      this.widget?.resize();
      this.widget?.scene.requestRender();
    });
    this.resizeObserver.observe(this.container);
    this.removeCameraMotion = [
      this.widget.camera.moveStart.addEventListener(() => {
        this.cameraMoving = true;
        this.syncRenderPolicy();
      }),
      this.widget.camera.moveEnd.addEventListener(() => {
        this.cameraMoving = false;
        this.syncRenderPolicy();
      }),
    ];

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

    // Camera frames must be updated before Cesium samples matrices/picking and
    // decides whether the view changed, not after that in preRender.
    this.removePreRender = this.widget.scene.preUpdate.addEventListener(() => {
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
        if (this.cloudLayer?.fallbackFromShell()) {
          this.recoveryFrame = requestAnimationFrame(() => {
            this.recoveryFrame = null;
            this.syncRenderPolicy();
            this.widget?.scene.requestRender();
          });
          return;
        }
        this.renderFailed = true;
        this.syncRenderPolicy();
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
    // Context loss is not an updater veto; workspace resume must not restart a broken scene.
    this.contextLost = true;
    this.syncRenderPolicy();
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
    this.syncRenderPolicy();
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
      this.syncRenderPolicy();
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
    const desired = this.appliedQuality === "high" && this.enhancementLevel < 2
      ? Math.max(1, Math.min(1.5, window.devicePixelRatio || 1))
      : profile.resolutionScale;
    this.widget.resolutionScale = boundedResolutionScale(
      this.container.clientWidth, this.container.clientHeight, desired * interactionFactor,
    );
  }

  private readonly handlePerformanceSample = (sample: PerformanceSample): void => {
    if (this.disposed) {
      return;
    }

    const clockTime = this.widget
      ? JulianDate.toDate(this.widget.clock.currentTime).toISOString()
      : new Date().toISOString();
    this.update({
      fps: sample.statistics?.fps ?? null,
      frameTimeMs: sample.statistics?.medianFrameTimeMs ?? null,
      p95FrameTimeMs: sample.statistics?.p95FrameTimeMs ?? null,
      lateFrameRatio: sample.statistics?.lateFrameRatio ?? null,
      cpuRenderMs: sample.cpuRenderMs,
      gpuTimeMs: sample.gpuTimeMs,
      presentedFrames: sample.presentedFrames,
      renderWidth: this.widget?.canvas.width ?? 0,
      renderHeight: this.widget?.canvas.height ?? 0,
      memory: sample.memory,
      utcIso: clockTime,
    });
    this.syncRenderPolicy();

    if (performance.now() - this.readyAt < ADAPTATION_WARMUP_MS) {
      return;
    }
    // In requestRenderMode the scene renders only on demand (idle cadence of
    // roughly one frame per second), so raw FPS no longer measures GPU load.
    // Feeding those samples to the adaptive controller would wrongly degrade
    // quality while the user is simply idle, so adaptation is paused until
    // continuous rendering resumes.
    const statistics = sample.statistics;
    if (!statistics || this.snapshot.renderMode !== "continuous" || this.surfaceBusy) {
      this.weakWindows = 0;
      this.strongWindows = 0;
      return;
    }
    const target = this.snapshot.effectiveFrameRateTarget;
    this.weakWindows = statistics.fps < target * 0.9 ? this.weakWindows + 1 : 0;
    this.strongWindows = statistics.fps >= target * (59 / 60) ? this.strongWindows + 1 : 0;
    if (this.weakWindows >= 3 && this.enhancementLevel < 2) {
      this.enhancementLevel += 1;
      this.enhancementsBlockedUntil = performance.now() + 30_000;
      this.weakWindows = 0;
      this.applyQuality(this.appliedQuality);
      return;
    }
    if (this.strongWindows >= 20 && this.enhancementLevel > 0 && performance.now() >= this.enhancementsBlockedUntil) {
      this.enhancementLevel -= 1;
      this.strongWindows = 0;
      this.applyQuality(this.appliedQuality);
      return;
    }
    // Recovery must remain possible after optional effects have recovered too.
    const nextQuality = this.adaptiveQuality?.sample(
      statistics.fps, false, target, performance.now(), this.enhancementLevel >= 2,
    );
    if (nextQuality) {
      this.applyQuality(nextQuality);
    }
  };

  private readonly handleVisibility = (): void => {
    this.syncRenderPolicy();
    if (this.active) this.measureDisplayCadence();
  };

  private syncRenderPolicy(): void {
    if (!this.widget || this.disposed) return;
    const mode = resolveRenderMode({
      workspace: this.workspaceActive,
      document: !document.hidden && this.windowVisible,
      update: this.updatePaused || this.contextLost || this.renderFailed,
      motion: this.cameraMoving || this.interactionResolutionActive || this.followActive ||
        Boolean(this.timeLensState?.playing) || Boolean(this.cameraController?.isAutoRotating()),
    });
    const active = mode !== "suspended";
    const resumed = active && !this.active;
    if (this.active !== active) this.layerRegistry?.setActive(active);
    this.active = active;
    this.widget.useDefaultRenderLoop = active;
    if (resumed) resumeEarthClock(this.widget.clock, this.timeLensState === null);
    this.widget.clock.shouldAnimate = active && (this.timeLensState === null || this.timeLensState.playing);
    this.widget.scene.requestRenderMode = mode !== "continuous";
    this.widget.scene.maximumRenderTimeChange = Number.POSITIVE_INFINITY;
    const target = Math.min(this.appliedQuality === "eco" ? 45 : Number(this.frameRateMode), this.displayCadence);
    this.widget.targetFrameRate = target;
    this.performanceMonitor?.setMode(mode === "continuous", target);
    if (active) {
      this.performanceMonitor?.start();
      if (resumed) {
        this.widget.resize();
        this.measureDisplayCadence();
      }
      if (resumed || mode !== this.snapshot.renderMode) this.widget.scene.requestRender();
    } else {
      this.performanceMonitor?.dispose();
      if (this.cadenceFrame !== null) cancelAnimationFrame(this.cadenceFrame);
      this.cadenceFrame = null;
    }
    this.update({ renderMode: mode, effectiveFrameRateTarget: target });
  }

  /** Browser presentation cadence, not GPU throughput. Never infer 120 Hz from a 60 Hz screen. */
  private measureDisplayCadence(): void {
    if (this.cadenceFrame !== null) cancelAnimationFrame(this.cadenceFrame);
    this.cadenceFrame = null;
    if (!this.active || this.frameRateMode !== "120") return;
    const intervals: number[] = [];
    let previous: number | null = null;
    const sample = (now: number) => {
      if (!this.active || this.disposed) return;
      if (previous !== null) intervals.push(now - previous);
      previous = now;
      if (intervals.length < 90) {
        this.cadenceFrame = requestAnimationFrame(sample);
      } else {
        this.cadenceFrame = null;
        intervals.sort((a, b) => a - b);
        // Fastest stable quartile tolerates occasional work without calling it display limitation.
        const cadence = 1_000 / intervals[Math.floor(intervals.length / 4)]!;
        this.displayCadence = Math.max(30, Math.min(120, Math.round(cadence)));
        this.syncRenderPolicy();
      }
    };
    this.cadenceFrame = requestAnimationFrame(sample);
  }

  private readonly handleSurfaceUpdate = (update: {
    imagery?: SurfaceProviderStatus;
    terrain?: SurfaceProviderStatus;
  }): void => {
    if (this.contextLost || this.renderFailed) return;
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
