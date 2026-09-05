import {
  ArcGisMapServerImageryProvider,
  ArcGISTiledElevationTerrainProvider,
  EllipsoidTerrainProvider,
  ImageryLayer,
  Math as CesiumMath,
  Rectangle,
  SingleTileImageryProvider,
  type CesiumWidget,
  type TerrainProvider,
} from "cesium";

import type { SurfaceProviderStatus } from "../contracts/earth-engine";
import { retryTile, shouldUseDetailedTerrain } from "./surfacePolicy";

const WORLD_IMAGERY_URL =
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer";
const WORLD_TERRAIN_URL =
  "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer";
const NIGHT_LIGHTS_URL = "/assets/earth/nasa-black-marble-2012.jpg";

interface SurfaceProviderUpdate {
  imagery?: SurfaceProviderStatus;
  terrain?: SurfaceProviderStatus;
}

export class SurfaceProviderCoordinator {
  private currentImageryStatus: SurfaceProviderStatus | null = null;
  private currentTerrainStatus: SurfaceProviderStatus | null = null;
  private disposed = false;
  private readonly fallbackTerrain = new EllipsoidTerrainProvider();
  private highResolutionImageryLayer: ImageryLayer | null = null;
  private highResolutionTerrain: TerrainProvider | null = null;
  private removeCameraListener: (() => void) | null = null;
  private removeImageryErrorListener: (() => void) | null = null;
  private removeTerrainErrorListener: (() => void) | null = null;
  private nightLightsLayer: ImageryLayer | null = null;
  private nightLightsVisible = true;
  private imageryAttempts = 0;
  private imageryRetry: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly widget: CesiumWidget,
    private readonly onUpdate: (update: SurfaceProviderUpdate) => void,
    private readonly fallbackImageryLayer: ImageryLayer,
  ) {}

  start(): void {
    void this.loadImagery();
    void this.loadNightLights();
    void this.loadTerrain();
  }

  setNightLightsVisible(visible: boolean): void {
    this.nightLightsVisible = visible;
    if (this.nightLightsLayer) {
      this.nightLightsLayer.show = visible;
      this.widget.scene.requestRender();
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.imageryRetry !== null) clearTimeout(this.imageryRetry);
    this.removeImageryErrorListener?.();
    this.removeTerrainErrorListener?.();
    this.removeCameraListener?.();
    this.removeImageryErrorListener = null;
    this.removeTerrainErrorListener = null;
    this.removeCameraListener = null;
    this.highResolutionTerrain = null;
    this.fallbackImageryLayer.show = true;
    if (
      this.highResolutionImageryLayer &&
      this.widget.imageryLayers.contains(this.highResolutionImageryLayer)
    ) {
      this.widget.imageryLayers.remove(this.highResolutionImageryLayer, true);
    }
    this.highResolutionImageryLayer = null;
    if (
      this.nightLightsLayer &&
      this.widget.imageryLayers.contains(this.nightLightsLayer)
    ) {
      this.widget.imageryLayers.remove(this.nightLightsLayer, true);
    }
    this.nightLightsLayer = null;
  }

  private async loadImagery(): Promise<void> {
    this.imageryAttempts += 1;
    try {
      const provider = await ArcGisMapServerImageryProvider.fromUrl(
        WORLD_IMAGERY_URL,
        { enablePickFeatures: false },
      );
      if (this.disposed) {
        return;
      }

      const layer = new ImageryLayer(provider, {
        brightness: 0.97,
        contrast: 1.08,
        gamma: 0.99,
        rectangle: Rectangle.fromDegrees(-180, -84.5, 180, 84.5),
        saturation: 0.92,
      });
      this.highResolutionImageryLayer = layer;
      this.widget.imageryLayers.add(layer, this.widget.imageryLayers.indexOf(this.fallbackImageryLayer) + 1);
      this.removeImageryErrorListener = provider.errorEvent.addEventListener(
        (error: { retry: boolean; timesRetried: number }) => {
          if (this.disposed) return;
          error.retry = retryTile(error.timesRetried);
          // One failed tile never hides all successfully loaded tiles.
          this.fallbackImageryLayer.show = true;
          this.publishImageryStatus("adaptive");
          this.widget.scene.requestRender();
        },
      );
      this.fallbackImageryLayer.show = true;
      this.publishImageryStatus("high-resolution");
      this.widget.scene.requestRender();
    } catch {
      if (!this.disposed) {
        this.fallbackImageryLayer.show = true;
        this.publishImageryStatus("fallback");
        if (this.imageryAttempts < 3) {
          this.imageryRetry = setTimeout(() => {
            this.imageryRetry = null;
            if (!this.disposed) void this.loadImagery();
          }, 5_000 * this.imageryAttempts);
        }
      }
    }
  }

  private async loadNightLights(): Promise<void> {
    try {
      const provider = await SingleTileImageryProvider.fromUrl(
        NIGHT_LIGHTS_URL,
        { rectangle: Rectangle.MAX_VALUE },
      );
      if (this.disposed) {
        return;
      }

      this.nightLightsLayer = new ImageryLayer(provider, {
        brightness: 1.02,
        contrast: 1.2,
        dayAlpha: 0,
        gamma: 1,
        nightAlpha: 0.55,
        saturation: 0.66,
      });
      this.nightLightsLayer.show = this.nightLightsVisible;
      this.widget.imageryLayers.add(this.nightLightsLayer);
      this.widget.scene.requestRender();
    } catch {
      // Night lights are an enhancement; daytime imagery remains usable.
    }
  }

  private async loadTerrain(): Promise<void> {
    try {
      const provider = await ArcGISTiledElevationTerrainProvider.fromUrl(
        WORLD_TERRAIN_URL,
      );
      if (this.disposed) {
        return;
      }

      this.highResolutionTerrain = provider;
      this.removeTerrainErrorListener = provider.errorEvent.addEventListener(
        (error: { retry: boolean; timesRetried: number }) => {
          if (this.disposed) return;
          error.retry = retryTile(error.timesRetried);
          if (error.retry) return;
          this.highResolutionTerrain = null;
          this.removeCameraListener?.();
          this.removeCameraListener = null;
          this.widget.terrainProvider = this.fallbackTerrain;
          this.publishTerrainStatus("fallback");
        },
      );
      this.removeCameraListener = this.widget.camera.changed.addEventListener(
        this.updateTerrainForCamera,
      );
      this.updateTerrainForCamera();
      this.widget.scene.requestRender();
    } catch {
      if (!this.disposed) {
        this.publishTerrainStatus("fallback");
      }
    }
  }

  private readonly updateTerrainForCamera = (): void => {
    const terrain = this.highResolutionTerrain;
    if (!terrain || this.disposed) return;
    const cameraPosition = this.widget.camera.positionCartographic;
    const useHighResolution = shouldUseDetailedTerrain(
      this.widget.terrainProvider === terrain,
      cameraPosition.height,
      CesiumMath.toDegrees(cameraPosition.latitude),
    );
    const nextTerrain = useHighResolution ? terrain : this.fallbackTerrain;
    if (this.widget.terrainProvider !== nextTerrain) {
      this.widget.terrainProvider = nextTerrain;
    }
    this.widget.scene.globe.showWaterEffect = nextTerrain.hasWaterMask;
    this.publishTerrainStatus(
      useHighResolution ? "high-resolution" : "adaptive",
    );
  };

  private publishImageryStatus(status: SurfaceProviderStatus): void {
    if (status === this.currentImageryStatus) return;
    this.currentImageryStatus = status;
    this.onUpdate({ imagery: status });
  }

  private publishTerrainStatus(status: SurfaceProviderStatus): void {
    if (status === this.currentTerrainStatus) return;
    this.currentTerrainStatus = status;
    this.onUpdate({ terrain: status });
  }
}
