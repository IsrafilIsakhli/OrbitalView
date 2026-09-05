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

interface StarTint {
  red: number;
  green: number;
  blue: number;
}

// Deterministic spectral variety modeled on main-sequence classes so the
// backdrop reads as a real field rather than a uniform dot grid.
const STAR_TINTS: StarTint[] = [
  { red: 0.66, green: 0.77, blue: 1 }, // B — hot blue-white
  { red: 0.88, green: 0.92, blue: 1 }, // A — cool white
  { red: 1, green: 0.97, blue: 0.88 }, // G — solar white
  { red: 1, green: 0.86, blue: 0.66 }, // K — amber giant
];

function createStarDefinitions(): StarDefinition[] {
  return Array.from({ length: MAX_STARS }, (_, index) => {
    const normalizedY = 1 - (2 * (index + 0.5)) / MAX_STARS;
    const horizontalRadius = Math.sqrt(1 - normalizedY * normalizedY);
    const angle = index * GOLDEN_ANGLE + Math.sin(index * 12.9898) * 0.18;
    const hash = (index * 47) % 100;
    const tint = STAR_TINTS[index % STAR_TINTS.length]!;
    const bright = index % 21 === 0;
    const intensity = 0.3 + hash / 250 + (bright ? 0.22 : 0);

    return {
      color: new Color(tint.red, tint.green, tint.blue, intensity),
      pixelSize: bright
        ? 1.9
        : index % 13 === 0
          ? 0.78
          : index % 7 === 0
            ? 0.56
            : 0.4,
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
