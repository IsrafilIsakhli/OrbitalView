import type { GraphicsQuality } from "@/features/settings/model/preferences";

import type { GpuCapabilities } from "../contracts/earth-engine";

export interface QualityProfile {
  catalogSignalLimit: number;
  cloudShell: boolean;
  contextOrbitLimit: number;
  fog: boolean;
  interactionResolutionFactor: number;
  labelLimit: number;
  maximumScreenSpaceError: number;
  msaaSamples: number;
  orbitSampleCount: number;
  resolutionScale: number;
  semanticMarkerLimit: number;
  targetFrameRate: number;
  terrainTileCacheSize: number;
  useBrowserRecommendedResolution: boolean;
  starCount: number;
}

export const qualityProfiles: Record<GraphicsQuality, QualityProfile> = {
  eco: {
    catalogSignalLimit: 4_500,
    cloudShell: false,
    contextOrbitLimit: 1,
    fog: false,
    interactionResolutionFactor: 0.92,
    labelLimit: 12,
    maximumScreenSpaceError: 4.5,
    msaaSamples: 1,
    orbitSampleCount: 121,
    resolutionScale: 0.76,
    semanticMarkerLimit: 90,
    targetFrameRate: 45,
    terrainTileCacheSize: 80,
    useBrowserRecommendedResolution: true,
    starCount: 0,
  },
  balanced: {
    catalogSignalLimit: 8_500,
    cloudShell: false,
    contextOrbitLimit: 2,
    fog: true,
    interactionResolutionFactor: 0.86,
    labelLimit: 24,
    maximumScreenSpaceError: 2.4,
    msaaSamples: 2,
    orbitSampleCount: 161,
    resolutionScale: 0.92,
    semanticMarkerLimit: 160,
    targetFrameRate: 60,
    terrainTileCacheSize: 140,
    useBrowserRecommendedResolution: true,
    starCount: 72,
  },
  high: {
    catalogSignalLimit: 11_000,
    cloudShell: true,
    contextOrbitLimit: 3,
    fog: true,
    interactionResolutionFactor: 0.84,
    labelLimit: 28,
    maximumScreenSpaceError: 1.45,
    msaaSamples: 2,
    orbitSampleCount: 181,
    resolutionScale: 1,
    semanticMarkerLimit: 180,
    targetFrameRate: 60,
    terrainTileCacheSize: 180,
    useBrowserRecommendedResolution: true,
    starCount: 128,
  },
};

const qualityOrder: GraphicsQuality[] = ["eco", "balanced", "high"];

export function qualityAtMost(
  preferred: GraphicsQuality,
  maximum: GraphicsQuality,
): GraphicsQuality {
  return qualityOrder[
    Math.min(qualityOrder.indexOf(preferred), qualityOrder.indexOf(maximum))
  ] as GraphicsQuality;
}

export function qualityBelow(quality: GraphicsQuality): GraphicsQuality {
  const index = qualityOrder.indexOf(quality);
  return qualityOrder[Math.max(0, index - 1)] as GraphicsQuality;
}

export function qualityAbove(
  quality: GraphicsQuality,
  maximum: GraphicsQuality,
): GraphicsQuality {
  const index = Math.min(
    qualityOrder.indexOf(maximum),
    qualityOrder.indexOf(quality) + 1,
  );
  return qualityOrder[index] as GraphicsQuality;
}

export function recommendGpuQuality(
  gpu: GpuCapabilities,
  hardwareConcurrency: number,
  deviceMemoryGb?: number,
): GraphicsQuality {
  const renderer = gpu.renderer.toLocaleLowerCase();
  const isSoftwareRenderer = /swiftshader|llvmpipe|software|basic render/.test(
    renderer,
  );
  const isDiscreteGpu = /nvidia|geforce|radeon rx|arc\(tm\)|apple m[1-9]/.test(
    renderer,
  );

  if (
    isSoftwareRenderer ||
    gpu.api === "WebGL 1" ||
    gpu.maxTextureSize < 8_192 ||
    hardwareConcurrency <= 4 ||
    (deviceMemoryGb !== undefined && deviceMemoryGb <= 4)
  ) {
    return "eco";
  }

  if (
    isDiscreteGpu &&
    gpu.maxTextureSize >= 16_384 &&
    gpu.maxMsaaSamples >= 4 &&
    hardwareConcurrency >= 8 &&
    (deviceMemoryGb === undefined || deviceMemoryGb >= 8)
  ) {
    return "high";
  }

  return "balanced";
}
