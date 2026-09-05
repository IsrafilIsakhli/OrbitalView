import type { EarthFrameRateMode, GraphicsQuality } from "@/features/settings/model/preferences";
import type { EarthRenderMode } from "../core/renderPolicy";

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
  p95FrameTimeMs: number | null;
  lateFrameRatio: number | null;
  cpuRenderMs: number | null;
  gpuTimeMs: number | null;
  presentedFrames: number;
  renderMode: EarthRenderMode;
  renderWidth: number;
  renderHeight: number;
  effectiveFrameRateTarget: number;
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
  frameRateMode?: EarthFrameRateMode;
  active?: boolean;
}

export interface EarthEngine {
  dispose: () => void;
  flyTo: (preset: CameraPresetId) => void;
  getSnapshot: () => EarthEngineSnapshot;
  initialize: () => Promise<void>;
  registerLayer: (layer: EarthEngineLayer) => Promise<() => void>;
  returnToDefaultEarth: () => boolean;
  setActive: (active: boolean) => void;
  setUpdatePaused: (paused: boolean) => void;
  setWindowVisible: (visible: boolean) => void;
  setFollowActive: (active: boolean) => void;
  setFrameRateMode: (mode: EarthFrameRateMode) => void;
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
  p95FrameTimeMs: null,
  lateFrameRatio: null,
  cpuRenderMs: null,
  gpuTimeMs: null,
  presentedFrames: 0,
  renderMode: "on-demand",
  renderWidth: 0,
  renderHeight: 0,
  effectiveFrameRateTarget: 60,
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
