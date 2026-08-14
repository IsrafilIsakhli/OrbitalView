import type { Clock, Scene } from "cesium";

import type { GraphicsQuality } from "@/features/settings/model/preferences";

import type { CesiumCameraController } from "../camera/CesiumCameraController";

export const earthLayerSlots = [
  "system",
  "satellite",
  "launch",
  "weather",
  "mission",
] as const;

export type EarthLayerSlot = (typeof earthLayerSlots)[number];

export interface EarthLayerContext {
  cameraController: CesiumCameraController;
  clock: Clock;
  requestRender: () => void;
  scene: Scene;
}

export interface EarthEngineLayer {
  id: string;
  slot: EarthLayerSlot;
  mount: (context: EarthLayerContext) => void | Promise<void>;
  setActive?: (active: boolean) => void;
  setQuality?: (quality: GraphicsQuality) => void;
  setVisible: (visible: boolean) => void;
  tick?: (deltaSeconds: number) => void;
  unmount: () => void;
}
