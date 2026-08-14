import {
  CesiumWidget,
  Clock,
  ClockStep,
  EllipsoidTerrainProvider,
  ImageryLayer,
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
      brightness: 0.9,
      contrast: 1.08,
      saturation: 0.84,
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
      brightness: 0.9,
      contrast: 1.05,
      saturation: 0.84,
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
  private cameraController: CesiumCameraController | null = null;
  private cloudLayer: ScientificCloudLayer | null = null;
  private disposed = false;
  private initialized = false;
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
  private widget: CesiumWidget | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly options: EarthEngineOptions,
  ) {
    this.qualityCap = options.qualityCap;
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
        orderIndependentTranslucency: true,
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
    this.widget.clock.shouldAnimate = active;
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

    this.widget.resolutionScale = profile.resolutionScale;
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

    this.removePreRender = this.widget.scene.preRender.addEventListener(() => {
      if (!this.active) return;
      const now = performance.now();
      const deltaSeconds = Math.min(0.1, (now - previousFrameAt) / 1_000);
      previousFrameAt = now;
      this.cameraController?.tick(deltaSeconds);
      this.layerRegistry?.tick(deltaSeconds);
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
          this.surfaceBusy = pendingTiles > 0;
        },
      );
  }

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.update({ phase: "error" });
  };

  private readonly handlePerformanceSample = (sample: {
    fps: number;
    frameTimeMs: number;
    memory: EarthEngineSnapshot["memory"];
  }): void => {
    if (this.disposed) {
      return;
    }

    this.update({
      fps: sample.fps,
      frameTimeMs: sample.frameTimeMs,
      memory: sample.memory,
      utcIso: new Date().toISOString(),
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
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) {
      listener();
    }
  }
}
