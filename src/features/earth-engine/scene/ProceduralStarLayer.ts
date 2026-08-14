import {
  Cartesian3,
  Color,
  PointPrimitiveCollection,
  type PrimitiveCollection,
} from "cesium";

import type { GraphicsQuality } from "@/features/settings/model/preferences";

import type {
  EarthEngineLayer,
  EarthLayerContext,
} from "../contracts/layers";
import { qualityProfiles } from "../quality/qualityProfiles";

const STAR_SPHERE_RADIUS_METERS = 1_200_000_000;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const MAX_STARS = qualityProfiles.high.starCount;

interface StarDefinition {
  color: Color;
  pixelSize: number;
  position: Cartesian3;
}

function createStarDefinitions(): StarDefinition[] {
  return Array.from({ length: MAX_STARS }, (_, index) => {
    const normalizedY = 1 - (2 * (index + 0.5)) / MAX_STARS;
    const horizontalRadius = Math.sqrt(1 - normalizedY * normalizedY);
    const angle = index * GOLDEN_ANGLE + Math.sin(index * 12.9898) * 0.18;
    const intensity = 0.34 + ((index * 47) % 100) / 260;
    const cool = index % 13 === 0;

    return {
      color: cool
        ? new Color(0.68, 0.82, 1, intensity)
        : new Color(0.98, 0.95, 0.87, intensity),
      pixelSize: index % 41 === 0 ? 1.1 : index % 13 === 0 ? 0.72 : 0.44,
      position: new Cartesian3(
        Math.cos(angle) * horizontalRadius * STAR_SPHERE_RADIUS_METERS,
        normalizedY * STAR_SPHERE_RADIUS_METERS,
        Math.sin(angle) * horizontalRadius * STAR_SPHERE_RADIUS_METERS,
      ),
    };
  });
}

const starDefinitions = createStarDefinitions();

export class ProceduralStarLayer implements EarthEngineLayer {
  readonly id = "system-stars";
  readonly slot = "system" as const;

  private collection: PointPrimitiveCollection | null = null;
  private context: EarthLayerContext | null = null;
  private quality: GraphicsQuality;
  private visible = true;

  constructor(initialQuality: GraphicsQuality) {
    this.quality = initialQuality;
  }

  mount(context: EarthLayerContext): void {
    if (this.collection) return;
    this.context = context;
    this.collection = context.scene.primitives.add(
      new PointPrimitiveCollection(),
    ) as PointPrimitiveCollection;
    this.populate();
  }

  setQuality(quality: GraphicsQuality): void {
    if (quality === this.quality) return;
    this.quality = quality;
    this.populate();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (this.collection) this.collection.show = visible;
    this.context?.requestRender();
  }

  unmount(): void {
    if (this.collection && this.context) {
      const primitives: PrimitiveCollection = this.context.scene.primitives;
      if (primitives.contains(this.collection)) {
        primitives.remove(this.collection);
      }
    }
    this.collection = null;
    this.context = null;
  }

  private populate(): void {
    if (!this.collection) return;
    this.collection.removeAll();
    const count = qualityProfiles[this.quality].starCount;
    for (const star of starDefinitions.slice(0, count)) {
      this.collection.add(star);
    }
    this.collection.show = this.visible;
    this.context?.requestRender();
  }
}
