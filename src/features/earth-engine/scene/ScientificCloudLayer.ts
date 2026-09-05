import {
  Cartesian3,
  BlendingState,
  CullFace,
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
import { resolveCloudPresentation, type CloudPresentation } from "./cloudPresentation";

const NASA_GEOS5_CLOUDS_URL = "/assets/earth/nasa-geos5-clouds-0350.png";
const CLOUD_SHELL_SEPARATION_METERS = 7_500;

const CLOUD_ALPHA: Record<GraphicsQuality, { day: number; night: number }> = {
  eco: { day: 0.3, night: 0.08 },
  balanced: { day: 0.4, night: 0.12 },
  high: { day: 0.6, night: 0.18 },
};

export class ScientificCloudLayer implements EarthEngineLayer {
  readonly id = "system-clouds";
  readonly slot = "system" as const;

  private context: EarthLayerContext | null = null;
  private layer: ImageryLayer | null = null;
  private removeLayerAddedListener: (() => void) | null = null;
  private removeLayerMovedListener: (() => void) | null = null;
  private shell: Primitive | null = null;
  private shellMaterial: Material | null = null;
  private shellSupported = false;
  private shellLoading = false;
  private shellWasReady = false;
  private generation = 0;
  private presentation: CloudPresentation = "hidden";
  private quality: GraphicsQuality;
  private visible = true;

  constructor(initialQuality: GraphicsQuality) {
    this.quality = initialQuality;
  }

  async mount(context: EarthLayerContext): Promise<void> {
    if (this.context) return;
    this.context = context;
    this.generation += 1;
    this.shellSupported = context.scene.canvas.getContext("webgl2") !== null;
    const provider = await SingleTileImageryProvider.fromUrl(
      NASA_GEOS5_CLOUDS_URL,
      {
        credit: "NASA/GSFC Scientific Visualization Studio — GEOS-5",
        rectangle: Rectangle.MAX_VALUE,
      },
    ).catch(() => null);
    if (!provider) return; // Optional imagery must never prevent Earth startup.
    if (this.context !== context) return;
    this.layer = new ImageryLayer(provider, {
      brightness: 1.02,
      contrast: 1.05,
      gamma: 0.94,
      saturation: 0.04,
    });
    context.scene.imageryLayers.add(this.layer);
    this.removeLayerAddedListener = context.scene.imageryLayers.layerAdded.addEventListener(this.ensureLayerOrder);
    this.removeLayerMovedListener = context.scene.imageryLayers.layerMoved.addEventListener(this.ensureLayerOrder);
    this.applyVisualState();
  }

  private async createShell(): Promise<void> {
    const context = this.context;
    if (!context || !this.shellSupported || this.shell || this.shellLoading) return;
    const generation = this.generation;
    this.shellLoading = true;
    try {
        const image = new Image();
        image.src = NASA_GEOS5_CLOUDS_URL;
        await image.decode();
        if (this.context !== context || this.generation !== generation) return;
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
            type: "OrbitalVisionSunlitClouds",
            uniforms: {
              image,
              opacity: CLOUD_ALPHA.high.day,
            },
            source: `
              czm_material czm_getMaterial(czm_materialInput inputMaterial) {
                czm_material material = czm_getDefaultMaterial(inputMaterial);
                vec4 cloud = texture(image, inputMaterial.st);
                float sun = dot(normalize(inputMaterial.normalEC), normalize(czm_sunDirectionEC));
                float daylight = smoothstep(-0.10, 0.18, sun);
                float illumination = mix(0.025, 0.55 + 0.45 * max(sun, 0.0), daylight);
                material.diffuse = vec3(0.0);
                // GEOS-5 supplies coverage, while neutral luminance avoids
                // compression chroma flecks becoming coloured cloud highlights.
                float luminance = dot(cloud.rgb, vec3(0.2126, 0.7152, 0.0722));
                material.emission = vec3(luminance) * illumination;
                material.alpha = cloud.a * opacity * mix(0.12, 1.0, daylight);
                return material;
              }
            `,
          },
          translucent: true,
        });
        this.shell = new Primitive({
          allowPicking: false,
          appearance: new EllipsoidSurfaceAppearance({
            aboveGround: true,
            flat: false,
            faceForward: false,
            renderState: {
              cull: { enabled: true, face: CullFace.BACK },
              depthTest: { enabled: true },
              depthMask: false,
              blending: BlendingState.ALPHA_BLEND as object,
            },
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
      if (this.generation === generation) {
        this.destroyShell();
        this.shellSupported = false;
      }
    } finally {
      if (this.generation === generation) this.shellLoading = false;
    }
    if (this.context === context && this.generation === generation) this.applyVisualState();
  }

  /** A single optional-shell fallback; a repeated scene failure is not hidden. */
  fallbackFromShell(): boolean {
    if (!this.shell?.show || !this.context) return false;
    this.destroyShell();
    this.shellSupported = false;
    this.applyVisualState();
    return true;
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

  tick(): void {
    if (!this.context || !this.layer) return;
    const ready = this.shell?.ready === true;
    const next = this.nextPresentation(ready);
    if (ready !== this.shellWasReady || next !== this.presentation) {
      this.applyVisualState();
    }
  }

  unmount(): void {
    this.generation += 1;
    this.removeLayerAddedListener?.();
    this.removeLayerMovedListener?.();
    this.removeLayerAddedListener = null;
    this.removeLayerMovedListener = null;
    const collection = this.context?.scene.imageryLayers;
    if (collection && this.layer && collection.contains(this.layer)) {
      collection.remove(this.layer, true);
    }
    this.destroyShell();
    this.layer = null;
    this.shellLoading = false;
    this.presentation = "hidden";
    this.context = null;
  }

  getCount(): number {
    return this.layer ? 1 : 0;
  }

  private applyVisualState(): void {
    if (!this.layer) return;
    if (this.visible && qualityProfiles[this.quality].cloudShell) void this.createShell();
    const alpha = CLOUD_ALPHA[this.quality];
    this.layer.dayAlpha = alpha.day;
    this.layer.nightAlpha = alpha.night;
    if (this.shellMaterial) {
      const uniforms = this.shellMaterial.uniforms as Record<string, unknown>;
      uniforms["opacity"] = alpha.day;
    }
    this.shellWasReady = this.shell?.ready === true;
    this.presentation = this.nextPresentation(this.shellWasReady);
    this.layer.show = this.presentation === "imagery";
    if (this.shell) this.shell.show = this.presentation === "shell";
    this.context?.requestRender();
  }

  private nextPresentation(shellReady: boolean): CloudPresentation {
    return resolveCloudPresentation(
      this.presentation,
      this.visible,
      shellReady && this.shellSupported && qualityProfiles[this.quality].cloudShell,
      this.context?.scene.camera.positionCartographic.height ?? Number.NaN,
    );
  }

  private readonly ensureLayerOrder = (): void => {
    const collection = this.context?.scene.imageryLayers;
    if (!collection || !this.layer || !collection.contains(this.layer)) return;
    if (collection.indexOf(this.layer) !== collection.length - 1) {
      collection.raiseToTop(this.layer);
      this.context?.requestRender();
    }
  };

  private destroyShell(): void {
    if (this.context && this.shell) this.context.scene.primitives.remove(this.shell);
    // Primitive owns its geometry/shaders, but does not destroy the appearance's
    // Material. Release its GPU texture explicitly on fallback and teardown.
    if (this.shellMaterial && !this.shellMaterial.isDestroyed()) this.shellMaterial.destroy();
    this.shell = null;
    this.shellMaterial = null;
    this.shellWasReady = false;
  }
}
