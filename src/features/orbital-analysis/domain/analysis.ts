import type { OMMJsonObject } from "satellite.js";

import type { SatelliteCategory, SatelliteRecord } from "@/features/satellites/domain/satellite";

export const analysisTabs = [
  "dynamics",
  "groundStation",
  "constellation",
  "proximity",
  "changeWatch",
  "coverage",
  "missionDesign",
] as const;

export type AnalysisTab = (typeof analysisTabs)[number];
export type AnalysisFrame = "SGP4-ECI" | "ECF";
export type AnalysisWarningCode =
  | "catalog-stale"
  | "element-aged"
  | "element-old"
  | "partial-propagation"
  | "no-covariance"
  | "bounded-result";

export interface AnalysisWarning {
  code: AnalysisWarningCode;
  objectId?: string;
}

export interface AnalysisEnvelope<Result> {
  context: AnalysisRunContext;
  catalogFetchedAtUnixMs: number;
  frame: AnalysisFrame;
  generatedAtUnixMs: number;
  model: "SGP4";
  objectEpochs: Record<string, number>;
  requestId: string;
  result: Result;
  stale: boolean;
  warnings: AnalysisWarning[];
}

export interface AnalysisRunContext {
  kind: string;
  objectIds: string[];
  catalogVersion: string;
  catalogSource: string;
  parameters: Record<string, unknown>;
  sourceObjects: SatelliteRecord[];
  startUnixMs: number | null;
  endUnixMs: number | null;
}

export interface AnalysisSatelliteInput {
  sourceRecord: SatelliteRecord;
  apogeeKm: number | null;
  category: SatelliteCategory;
  eccentricity: number;
  epoch: string;
  id: string;
  inclinationDegrees: number;
  meanMotionRevolutionsPerDay: number;
  name: string;
  noradId: string;
  objectType: string | null;
  omm: OMMJsonObject;
  operationalStatusCode: string | null;
  ownerCode: string | null;
  perigeeKm: number | null;
  periodMinutes: number;
  rightAscensionDegrees: number;
}

export function toAnalysisSatelliteInput(record: SatelliteRecord): AnalysisSatelliteInput {
  return {
    sourceRecord: record,
    apogeeKm: record.apogeeKm,
    category: record.category,
    eccentricity: record.eccentricity,
    epoch: record.epoch,
    id: record.id,
    inclinationDegrees: record.inclinationDegrees,
    meanMotionRevolutionsPerDay: record.meanMotionRevolutionsPerDay,
    name: record.name,
    noradId: record.noradId,
    objectType: record.objectType,
    omm: record.omm,
    operationalStatusCode: record.operationalStatusCode,
    ownerCode: record.ownerCode,
    perigeeKm: record.perigeeKm,
    periodMinutes: record.periodMinutes,
    rightAscensionDegrees: record.rightAscensionDegrees,
  };
}

export interface DynamicsSample {
  altitudeKm: number;
  angularMomentumKm2PerSecond: number;
  latitudeDegrees: number;
  longitudeDegrees: number;
  radiusKm: number;
  specificEnergyKm2PerSecond2: number;
  timestampUnixMs: number;
  velocityKmPerSecond: number;
}

export interface DynamicsResult {
  derivedApogeeKm: number;
  derivedPerigeeKm: number;
  invalidSampleCount: number;
  samples: DynamicsSample[];
  satelliteId: string;
}

export interface GroundStationProfile {
  altitudeMeters: number;
  createdAt: string;
  downlinkFrequencyHz: number | null;
  id: string;
  latitudeDegrees: number;
  longitudeDegrees: number;
  minimumElevationDegrees: number;
  name: string;
  updatedAt: string;
}

export interface GroundStationInput {
  altitudeMeters: number;
  downlinkFrequencyHz: number | null;
  id: string;
  latitudeDegrees: number;
  longitudeDegrees: number;
  minimumElevationDegrees: number;
  name: string;
}

export interface PassSample {
  azimuthDegrees: number;
  dopplerShiftHz: number | null;
  elevationDegrees: number;
  radialVelocityKmPerSecond: number | null;
  rangeKm: number;
  timestampUnixMs: number;
}

export interface GroundStationPass {
  aosAzimuthDegrees: number;
  aosUnixMs: number;
  continuous: boolean;
  durationSeconds: number;
  losAzimuthDegrees: number;
  losUnixMs: number;
  maximumElevationDegrees: number;
  minimumRangeKm: number;
  samples: PassSample[];
  tcaUnixMs: number;
}

export interface GroundStationAccessResult {
  invalidSampleCount: number;
  passes: GroundStationPass[];
  satelliteId: string;
  station: GroundStationInput;
}

export interface GroundNetworkStationResult {
  invalidSampleCount: number;
  passes: GroundStationPass[];
  station: GroundStationInput;
}

export interface GroundNetworkContactWindow {
  endUnixMs: number;
  startUnixMs: number;
  stationIds: string[];
}

export interface GroundNetworkGap {
  durationSeconds: number;
  endUnixMs: number;
  startUnixMs: number;
}

export interface GroundNetworkResult {
  availabilityPercent: number;
  contactWindows: GroundNetworkContactWindow[];
  endUnixMs: number;
  gaps: GroundNetworkGap[];
  longestGapSeconds: number;
  satelliteId: string;
  startUnixMs: number;
  stationResults: GroundNetworkStationResult[];
  totalContactSeconds: number;
}

export interface ConstellationFilter {
  altitudeMaximumKm: number | null;
  altitudeMinimumKm: number | null;
  categories: SatelliteCategory[];
  inclinationMaximumDegrees: number | null;
  inclinationMinimumDegrees: number | null;
  objectTypes: string[];
  operationalStatuses: string[];
  ownerCodes: string[];
}

export interface ConstellationPoint {
  altitudeKm: number;
  apogeeKm: number;
  category: SatelliteCategory;
  eccentricity: number;
  id: string;
  inclinationDegrees: number;
  name: string;
  noradId: string;
  objectType: string | null;
  operationalStatusCode: string | null;
  ownerCode: string | null;
  perigeeKm: number;
  periodMinutes: number;
  rightAscensionDegrees: number;
}

export interface ConstellationResult {
  categoryCounts: Partial<Record<SatelliteCategory, number>>;
  ownerCounts: Array<{ count: number; ownerCode: string }>;
  points: ConstellationPoint[];
  totalCatalogCount: number;
}

export interface ProximityEvent {
  alongTrackSeparationKm: number;
  crossTrackSeparationKm: number;
  missDistanceKm: number;
  primaryEpochUnixMs: number;
  primaryId: string;
  radialSeparationKm: number;
  relativeVelocityKmPerSecond: number;
  secondaryEpochUnixMs: number;
  secondaryId: string;
  tcaUnixMs: number;
}

export interface ProximityResult {
  invalidSampleCount: number;
  candidateCount: number;
  endUnixMs: number;
  events: ProximityEvent[];
  primaryId: string;
  screenedObjectCount: number;
  startUnixMs: number;
  thresholdKm: number;
}

export interface AnalysisCatalogMetadata {
  fetchedAtUnixMs: number;
  source: string;
  stale: boolean;
}

export interface OrbitalElementSnapshot {
  apogeeKm: number | null;
  argumentPerigeeDegrees: number;
  bstar: number | null;
  capturedAtUnixMs: number;
  eccentricity: number;
  inclinationDegrees: number;
  meanAnomalyDegrees: number;
  meanMotion: number;
  noradId: string;
  perigeeKm: number | null;
  raanDegrees: number;
  sourceEpochUnixMs: number;
}

export interface CoverageTarget {
  altitudeMeters: number;
  latitudeDegrees: number;
  longitudeDegrees: number;
  minimumElevationDegrees: number;
  name: string;
}

export interface CoveragePass extends GroundStationPass {
  lighting: "day" | "twilight" | "night";
  satelliteId: string;
  satelliteName: string;
  sunElevationDegrees: number;
}

export interface CoverageWindow {
  endUnixMs: number;
  satelliteIds: string[];
  startUnixMs: number;
}

export interface CoverageRevisitGap {
  kind: "leading" | "between-passes" | "trailing" | "no-access";
  durationSeconds: number;
  endUnixMs: number;
  startUnixMs: number;
}

export interface CoverageResult {
  availabilityPercent: number;
  endUnixMs: number;
  invalidSampleCount: number;
  longestRevisitSeconds: number | null;
  passes: CoveragePass[];
  revisitGaps: CoverageRevisitGap[];
  satelliteIds: string[];
  startUnixMs: number;
  target: CoverageTarget;
  windows: CoverageWindow[];
}
