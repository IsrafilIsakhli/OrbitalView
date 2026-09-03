import {
  Cartesian2,
  Cartesian3,
  Color,
  Ellipsoid,
  EllipsoidGeometry,
  EllipsoidSurfaceAppearance,
  GeometryInstance,
  ImageryLayer,
  Material,
  Primitive,
  Rectangle,
  SingleTileImageryProvider,
} from "cesium";

import type { GraphicsQuality } from "@/features/settings/model/preferences";

import type { EarthEngineLayer, EarthLayerContext } from "../contracts/layers";
import { qualityProfiles } from "../quality/qualityProfiles";

const NASA_GEOS5_CLOUDS_URL = "/assets/earth/nasa-geos5-clouds-0350.png";
const CLOUD_SHELL_SEPARATION_METERS = 7_500;

const CLOUD_ALPHA: Record<GraphicsQuality, { day: number; night: number }> = {
  eco: { day: 0.3, night: 0.08 },
  balanced: { day: 0.4, night: 0.12 },
  high: { day: 0.48, night: 0.15 },
};

export class ScientificCloudLayer implements EarthEngineLayer {
  readonly id = "system-clouds";
  readonly slot = "system" as const;

  private context: EarthLayerContext | null = null;
  private layer: ImageryLayer | null = null;
  private orderCheckElapsed = 1;
  private shell: Primitive | null = null;
  private shellMaterial: Material | null = null;
  private shellSupported = false;
  private quality: GraphicsQuality;
  private visible = true;

  constructor(initialQuality: GraphicsQuality) {
    this.quality = initialQuality;
  }

  async mount(context: EarthLayerContext): Promise<void> {
    if (this.layer) return;
    this.context = context;
    this.shellSupported = context.scene.canvas.getContext("webgl2") !== null;
    const provider = await SingleTileImageryProvider.fromUrl(
      NASA_GEOS5_CLOUDS_URL,
      {
        credit: "NASA/GSFC Scientific Visualization Studio — GEOS-5",
        rectangle: Rectangle.MAX_VALUE,
      },
    );
    if (this.context !== context) return;
    this.layer = new ImageryLayer(provider, {
      brightness: 1.02,
      contrast: 1.05,
      gamma: 0.94,
      saturation: 0.04,
    });
    context.scene.imageryLayers.add(this.layer);
    if (this.shellSupported) {
      try {
        const radii = Cartesian3.add(
          Ellipsoid.WGS84.radii,
          new Cartesian3(
            CLOUD_SHELL_SEPARATION_METERS,
            CLOUD_SHELL_SEPARATION_METERS,
            CLOUD_SHELL_SEPARATION_METERS,
          ),
          new Cartesian3(),
        );
        this.shellMaterial = new Material({
          fabric: {
            type: "Image",
            uniforms: {
              color: Color.WHITE.withAlpha(0.42),
              image: NASA_GEOS5_CLOUDS_URL,
              repeat: new Cartesian2(1, 1),
            },
          },
          translucent: true,
        });
        this.shell = new Primitive({
          allowPicking: false,
          appearance: new EllipsoidSurfaceAppearance({
            aboveGround: true,
            flat: true,
            material: this.shellMaterial,
            translucent: true,
          }),
          asynchronous: true,
          geometryInstances: new GeometryInstance({
            geometry: new EllipsoidGeometry({
              radii,
              slicePartitions: 128,
              stackPartitions: 64,
              vertexFormat: EllipsoidSurfaceAppearance.VERTEX_FORMAT,
            }),
          }),
          show: false,
        });
        context.scene.primitives.add(this.shell);
      } catch {
        this.shell = null;
        this.shellMaterial = null;
        this.shellSupported = false;
      }
    }
    this.applyVisualState();
  }

  setQuality(quality: GraphicsQuality): void {
    if (quality === this.quality) return;
    this.quality = quality;
    this.applyVisualState();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.applyVisualState();
  }

  tick(deltaSeconds: number): void {
    this.orderCheckElapsed += Math.max(0, deltaSeconds);
    if (this.orderCheckElapsed < 1) return;
    this.orderCheckElapsed = 0;
    const collection = this.context?.scene.imageryLayers;
    if (!collection || !this.layer || !collection.contains(this.layer)) return;
    if (collection.indexOf(this.layer) !== collection.length - 1) {
      collection.raiseToTop(this.layer);
      this.context?.requestRender();
    }
  }

  unmount(): void {
    const collection = this.context?.scene.imageryLayers;
    if (collection && this.layer && collection.contains(this.layer)) {
      collection.remove(this.layer, true);
    }
    if (this.context && this.shell) {
      this.context.scene.primitives.remove(this.shell);
    }
    this.layer = null;
    this.shell = null;
    this.shellMaterial = null;
    this.context = null;
  }

  getCount(): number {
    return this.layer ? 1 : 0;
  }

  private applyVisualState(): void {
    if (!this.layer) return;
    const alpha = CLOUD_ALPHA[this.quality];
    this.layer.dayAlpha = alpha.day;
    this.layer.nightAlpha = alpha.night;
    if (this.shellMaterial) {
      const uniforms = this.shellMaterial.uniforms as Record<string, unknown>;
      uniforms["color"] = Color.WHITE.withAlpha(alpha.day * 0.9);
    }
    const useShell = this.visible && this.shellSupported &&
      qualityProfiles[this.quality].cloudShell && this.shell !== null;
    this.layer.show = this.visible && !useShell;
    if (this.shell) this.shell.show = useShell;
    this.context?.requestRender();
  }
}
