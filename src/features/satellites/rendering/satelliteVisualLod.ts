import type { GraphicsQuality } from "@/features/settings/model/preferences";

import { qualityProfiles } from "@/features/earth-engine/quality/qualityProfiles";

import {
  satelliteCategories,
  type SatelliteCategory,
  type SatelliteRecord,
} from "../domain/satellite";

export type SatellitePresentationMode = "overview" | "category";
export type SatelliteVisualTier = "global" | "orbital" | "inspection";

const SEMANTIC_PRIORITY: Record<SatelliteCategory, number> = {
  station: 0,
  science: 1,
  weather: 2,
  navigation: 3,
  "rocket-body": 4,
  communications: 5,
  debris: 6,
  starlink: 7,
  other: 8,
};

export interface SatellitePresentationSelection {
  contextOrbitIndices: number[];
  semanticIndices: number[];
  signalIndices: number[];
}

export function selectSatellitePresentation(
  catalog: readonly SatelliteRecord[],
  quality: GraphicsQuality,
  visibility: Readonly<Record<SatelliteCategory, boolean>>,
  focusedCategory: SatelliteCategory | null,
): SatellitePresentationSelection {
  const visibleIndices = catalog
    .map((satellite, index) => ({ index, satellite }))
    .filter(({ satellite }) => visibility[satellite.category]);
  const signalIndices = selectSignals(
    visibleIndices,
    qualityProfiles[quality].catalogSignalLimit,
  );
  const semanticPool = focusedCategory
    ? visibleIndices.filter(({ satellite }) => satellite.category === focusedCategory)
    : visibleIndices;
  const semanticIndices = selectRepresentatives(
    semanticPool,
    qualityProfiles[quality].semanticMarkerLimit,
    focusedCategory,
  );
  const orbitPool = focusedCategory
    ? semanticPool
    : visibleIndices.filter(({ satellite }) =>
        satellite.category === "station" ||
        satellite.category === "navigation" ||
        satellite.category === "science" ||
        satellite.category === "weather"
      );
  const contextOrbitIndices = focusedCategory === "debris"
    ? []
    : selectRepresentatives(
        orbitPool,
        qualityProfiles[quality].contextOrbitLimit,
        focusedCategory,
      );
  return { contextOrbitIndices, semanticIndices, signalIndices };
}

export function resolveVisualTier(
  cameraMagnitudeMeters: number,
  previous: SatelliteVisualTier = "global",
): SatelliteVisualTier {
  const surfaceDistance = Math.max(0, cameraMagnitudeMeters - 6_371_000);
  if (previous === "global" && surfaceDistance > 4_800_000) return "global";
  if (previous === "inspection" && surfaceDistance < 1_450_000) return "inspection";
  if (surfaceDistance > 5_600_000) return "global";
  if (surfaceDistance < 1_100_000) return "inspection";
  return "orbital";
}

function selectSignals(
  candidates: Array<{ index: number; satellite: SatelliteRecord }>,
  limit: number,
): number[] {
  if (!Number.isFinite(limit) || candidates.length <= limit) {
    return candidates.map(({ index }) => index);
  }
  const byCategory = new Map<SatelliteCategory, number[]>();
  for (const category of satelliteCategories) byCategory.set(category, []);
  for (const { index, satellite } of candidates) {
    byCategory.get(satellite.category)?.push(index);
  }
  const result: number[] = [];
  const selected = new Set<number>();
  const minimumPerCategory = Math.max(1, Math.floor(limit * 0.015));
  for (const category of satelliteCategories) {
    const indices = byCategory.get(category) ?? [];
    appendEvenly(result, selected, indices, Math.min(indices.length, minimumPerCategory));
  }
  const remaining = Math.max(0, limit - result.length);
  appendEvenly(
    result,
    selected,
    candidates.map(({ index }) => index).filter((index) => !selected.has(index)),
    remaining,
  );
  return result.slice(0, limit);
}

function selectRepresentatives(
  candidates: Array<{ index: number; satellite: SatelliteRecord }>,
  limit: number,
  focusedCategory: SatelliteCategory | null,
): number[] {
  if (limit <= 0 || candidates.length === 0) return [];
  const sorted = [...candidates].sort((left, right) => {
    const focusDelta = focusedCategory
      ? Number(right.satellite.category === focusedCategory) -
        Number(left.satellite.category === focusedCategory)
      : 0;
    if (focusDelta !== 0) return focusDelta;
    const priorityDelta =
      SEMANTIC_PRIORITY[left.satellite.category] -
      SEMANTIC_PRIORITY[right.satellite.category];
    if (priorityDelta !== 0) return priorityDelta;
    return representativeKey(left.satellite) - representativeKey(right.satellite) ||
      left.index - right.index;
  });
  const buckets = new Map<string, typeof sorted>();
  for (const candidate of sorted) {
    const key = orbitBucket(candidate.satellite);
    const bucket = buckets.get(key) ?? [];
    bucket.push(candidate);
    buckets.set(key, bucket);
  }
  const result: number[] = [];
  const queues = [...buckets.entries()]
    .sort(([leftKey, left], [rightKey, right]) =>
      SEMANTIC_PRIORITY[left[0]?.satellite.category ?? "other"] -
        SEMANTIC_PRIORITY[right[0]?.satellite.category ?? "other"] ||
      leftKey.localeCompare(rightKey)
    )
    .map(([, entries]) => entries);
  while (result.length < limit && queues.some((queue) => queue.length > 0)) {
    for (const queue of queues) {
      const candidate = queue.shift();
      if (candidate) result.push(candidate.index);
      if (result.length >= limit) break;
    }
  }
  return result;
}

function orbitBucket(satellite: SatelliteRecord): string {
  const altitude = ((satellite.apogeeKm ?? satellite.perigeeKm ?? 0) +
    (satellite.perigeeKm ?? satellite.apogeeKm ?? 0)) / 2;
  const altitudeBucket = Math.floor(altitude / 750);
  const inclinationBucket = Math.floor(satellite.inclinationDegrees / 15);
  const raanBucket = Math.floor(normalizeDegrees(satellite.rightAscensionDegrees) / 30);
  return `${satellite.category}:${altitudeBucket}:${inclinationBucket}:${raanBucket}`;
}

function representativeKey(satellite: SatelliteRecord): number {
  return normalizeDegrees(satellite.rightAscensionDegrees) * 1_000_000 +
    normalizeDegrees(satellite.meanAnomalyDegrees) * 1_000 +
    Number(satellite.noradId.replace(/\D/g, "").slice(-6));
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function appendEvenly(
  target: number[],
  selected: Set<number>,
  source: readonly number[],
  count: number,
): void {
  if (count <= 0 || source.length === 0) return;
  const step = source.length / count;
  for (let index = 0; index < count; index += 1) {
    const value = source[Math.min(source.length - 1, Math.floor(index * step))];
    if (value !== undefined && !selected.has(value)) {
      selected.add(value);
      target.push(value);
    }
  }
}
