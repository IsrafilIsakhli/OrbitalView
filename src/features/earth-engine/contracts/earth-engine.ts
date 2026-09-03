import type { GraphicsQuality } from "@/features/settings/model/preferences";

import type { EarthEngineLayer, EarthLayerSlot } from "./layers";

export const cameraPresetIds = ["earth", "leo", "iss", "moon", "sun"] as const;

export type CameraPresetId = (typeof cameraPresetIds)[number];
export type EnginePhase =
  | "idle"
  | "initializing"
  | "ready"
  | "degraded"
  | "error"
  | "disposed";
export type SurfaceProviderStatus =
  | "loading"
  | "high-resolution"
  | "adaptive"
  | "fallback";

export interface CameraCompositionInsets {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export interface GpuCapabilities {
  api: "WebGL 1" | "WebGL 2";
  antialias: boolean;
  maxMsaaSamples: number;
  maxTextureSize: number;
  renderer: string;
  vendor: string;
}

export interface MemorySnapshot {
  heapLimitMb: number;
  totalHeapMb: number;
  usedHeapMb: number;
}

export interface EarthTimeLensState {
  playing: boolean;
  rate: number;
  timestampUnixMs: number;
}

export interface EarthEngineSnapshot {
  activePreset: CameraPresetId;
  autoRotation: boolean;
  cloudCount: number;
  cloudsVisible: boolean;
  errorDetail: string | null;
  fps: number | null;
  frameTimeMs: number | null;
  gpu: GpuCapabilities | null;
  imagery: SurfaceProviderStatus;
  memory: MemorySnapshot | null;
  nightLightsVisible: boolean;
  phase: EnginePhase;
  quality: GraphicsQuality;
  terrain: SurfaceProviderStatus;
  timeLensActive: boolean;
  timeLensPlaying: boolean;
  timeLensRate: number;
  utcIso: string;
}

export interface EarthEngineOptions {
  canvasLabel: string;
  qualityCap: GraphicsQuality;
  reduceMotion: boolean;
}

export interface EarthEngine {
  dispose: () => void;
  flyTo: (preset: CameraPresetId) => void;
  getSnapshot: () => EarthEngineSnapshot;
  initialize: () => Promise<void>;
  registerLayer: (layer: EarthEngineLayer) => Promise<() => void>;
  returnToDefaultEarth: () => boolean;
  setActive: (active: boolean) => void;
  setCameraCompositionInsets: (insets: CameraCompositionInsets) => void;
  setDefaultCameraCompositionInsets: (insets: CameraCompositionInsets) => void;
  setAutoRotation: (enabled: boolean) => void;
  setCloudsVisible: (visible: boolean) => void;
  setLayerSlotVisible: (slot: EarthLayerSlot, visible: boolean) => void;
  setNightLightsVisible: (visible: boolean) => void;
  setQualityCap: (quality: GraphicsQuality) => void;
  setReduceMotion: (reduceMotion: boolean) => void;
  setTimeLensState: (state: EarthTimeLensState | null) => void;
  subscribe: (listener: () => void) => () => void;
}

export const initialEarthEngineSnapshot: EarthEngineSnapshot = {
  activePreset: "earth",
  autoRotation: true,
  cloudCount: 0,
  cloudsVisible: true,
  errorDetail: null,
  fps: null,
  frameTimeMs: null,
  gpu: null,
  imagery: "loading",
  memory: null,
  nightLightsVisible: true,
  phase: "idle",
  quality: "balanced",
  terrain: "loading",
  timeLensActive: false,
  timeLensPlaying: false,
  timeLensRate: 60,
  utcIso: new Date().toISOString(),
};
