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

const WORLD_IMAGERY_URL =
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer";
const WORLD_TERRAIN_URL =
  "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer";
const NIGHT_LIGHTS_URL = "/assets/earth/nasa-black-marble-2012.jpg";
const MAX_ARCGIS_TERRAIN_HEIGHT_METERS = 5_000_000;
const MAX_ARCGIS_TERRAIN_LATITUDE = CesiumMath.toRadians(70);

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

  constructor(
    private readonly widget: CesiumWidget,
    private readonly onUpdate: (update: SurfaceProviderUpdate) => void,
    private readonly fallbackImageryLayer: ImageryLayer,
  ) {}

  start(): void {
    void this.loadImageryStack();
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

  private async loadImageryStack(): Promise<void> {
    await this.loadImagery();
    await this.loadNightLights();
  }

  private async loadImagery(): Promise<void> {
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
      this.widget.imageryLayers.add(layer);
      this.removeImageryErrorListener = provider.errorEvent.addEventListener(
        () => {
          if (this.disposed) return;
          layer.show = false;
          this.fallbackImageryLayer.show = true;
          this.publishImageryStatus("fallback");
          this.widget.scene.requestRender();
        },
      );
      this.fallbackImageryLayer.show = false;
      this.publishImageryStatus("high-resolution");
      this.widget.scene.requestRender();
    } catch {
      if (!this.disposed) {
        this.fallbackImageryLayer.show = true;
        this.publishImageryStatus("fallback");
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
        nightAlpha: 0.5,
        saturation: 0.62,
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
        () => {
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
    const useHighResolution =
      cameraPosition.height < MAX_ARCGIS_TERRAIN_HEIGHT_METERS &&
      Math.abs(cameraPosition.latitude) < MAX_ARCGIS_TERRAIN_LATITUDE;
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
