import { BulkPropagator } from "@satellite/bulk";
import { EciBaseCalculator } from "@satellite/eci-calculator";
import { json2satrec } from "@satellite/io";
import { gstime, propagate } from "@satellite/propagation";
import { createSingleThreadRuntimeFromModule } from "@satellite/runtime";
import {
  degreesToRadians,
  ecfToLookAngles,
  eciToEcf,
  eciToGeodetic,
} from "@satellite/transforms";
import createWasmModule from "@satellite/wasm-module";

import type {
  AnalysisCatalogMetadata,
  AnalysisEnvelope,
  AnalysisSatelliteInput,
  ConstellationFilter,
  ConstellationPoint,
  ConstellationResult,
  DynamicsResult,
  GroundStationAccessResult,
  GroundStationInput,
  GroundStationPass,
  PassSample,
  ProximityEvent,
  ProximityResult,
} from "../domain/analysis";
import {
  angularMomentumMagnitude,
  classicalDopplerShiftHz,
  derivedApsides,
  epochWarnings,
  normalizeLongitudeDegrees,
  projectRelativePositionToRtn,
  radialEnvelope,
  specificOrbitalEnergy,
  subtractVectors,
  vectorMagnitude,
  type Vector3,
} from "../domain/orbitalMath";
import type {
  AnalysisWorkerRequest,
  AnalysisWorkerResponse,
  AnalysisWorkerResult,
} from "./messages";

interface WorkerScope {
  onmessage: ((event: MessageEvent<AnalysisWorkerRequest>) => void) | null;
  postMessage: (message: AnalysisWorkerResponse) => void;
}

type Satrec = ReturnType<typeof json2satrec>;
type BulkRuntime = Awaited<ReturnType<typeof createBulkRuntime>>;

const scope = self as unknown as WorkerScope;
const MAX_DYNAMICS_SAMPLES = 1_440;
const MAX_PROXIMITY_HORIZON_MS = 24 * 60 * 60_000;
const MAX_PASS_HORIZON_MS = 7 * 24 * 60 * 60_000;
const MAX_PROXIMITY_RESULTS = 50;
const PROXIMITY_COARSE_STEP_MS = 120_000;
const PROXIMITY_GUARD_KM = 150;
const RADIAL_FILTER_MARGIN_KM = 500;

let records: AnalysisSatelliteInput[] = [];
let recordsById = new Map<string, AnalysisSatelliteInput>();
let satrecs: Satrec[] = [];
let indexById = new Map<string, number>();
let metadata: AnalysisCatalogMetadata | null = null;
let bulkRuntime: BulkRuntime | null = null;
const cancelled = new Set<string>();

scope.onmessage = (event) => {
  if (event.data.type === "cancel") {
    cancelled.add(event.data.requestId);
    return;
  }
  void handleRequest(event.data);
};

async function handleRequest(request: AnalysisWorkerRequest): Promise<void> {
  if (request.type === "cancel") return;
  const requestId = "requestId" in request ? request.requestId : null;
  try {
    if (request.type === "initialize") {
      disposeRuntime();
      metadata = request.metadata;
      records = request.records;
      recordsById = new Map(records.map((record) => [record.id, record]));
      indexById = new Map(records.map((record, index) => [record.id, index]));
      satrecs = records.map((record) => json2satrec(record.omm));
      bulkRuntime = await createBulkRuntime(satrecs);
      scope.postMessage({ count: records.length, type: "ready" });
      return;
    }
    if (request.type === "dispose") {
      disposeRuntime();
      close();
      return;
    }
    ensureReady();
    cancelled.delete(request.requestId);
    let analysis: AnalysisWorkerResult;
    let kind: "dynamics" | "groundStation" | "constellation" | "proximity";
    if (request.type === "dynamics") {
      analysis = calculateDynamics(request);
      kind = "dynamics";
    } else if (request.type === "ground-station") {
      analysis = await calculateGroundStationAccess(request);
      kind = "groundStation";
    } else if (request.type === "constellation") {
      analysis = calculateConstellation(request);
      kind = "constellation";
    } else if (request.type === "proximity") {
      analysis = await calculateProximity(request);
      kind = "proximity";
    } else {
      return;
    }
    if (cancelled.has(request.requestId)) {
      cancelled.delete(request.requestId);
      scope.postMessage({ requestId: request.requestId, type: "cancelled" });
      return;
    }
    scope.postMessage({ analysis, kind, requestId: request.requestId, type: "result" });
  } catch (error) {
    if (error instanceof AnalysisError && error.code === "cancelled" && requestId) {
      cancelled.delete(requestId);
      scope.postMessage({ requestId, type: "cancelled" });
      return;
    }
    scope.postMessage({
      code: error instanceof AnalysisError ? error.code : "analysis-failed",
      message: error instanceof Error ? error.message : String(error),
      requestId,
      type: "error",
    });
  }
}

async function createBulkRuntime(currentSatrecs: Satrec[]) {
  const wasmRuntime = await createSingleThreadRuntimeFromModule(await createWasmModule());
  const calculators = [new EciBaseCalculator()] as const;
  const propagator = new BulkPropagator({
    calculators,
    datesCount: 1,
    runtime: wasmRuntime,
    satRecsCount: currentSatrecs.length,
  });
  propagator.setSatRecs(currentSatrecs);
  return { propagator, wasmRuntime };
}

function calculateDynamics(request: Extract<AnalysisWorkerRequest, { type: "dynamics" }>): AnalysisEnvelope<DynamicsResult> {
  const { record, satrec } = selectedRecord(request.satelliteId);
  const start = finiteTime(request.startUnixMs, "invalid-start");
  const end = finiteTime(request.endUnixMs, "invalid-end");
  if (end <= start) throw new AnalysisError("invalid-interval", "Analysis interval is invalid");
  const count = Math.min(MAX_DYNAMICS_SAMPLES, Math.max(2, Math.round(request.sampleCount)));
  const samples: DynamicsResult["samples"] = [];
  let invalidSampleCount = 0;
  for (let index = 0; index < count; index += 1) {
    checkCancelled(request.requestId);
    const timestampUnixMs = start + (end - start) * index / (count - 1);
    const state = propagateState(satrec, timestampUnixMs);
    if (!state) {
      invalidSampleCount += 1;
      continue;
    }
    samples.push({
      altitudeKm: state.geodetic.height,
      angularMomentumKm2PerSecond: angularMomentumMagnitude(state.position, state.velocity),
      latitudeDegrees: radiansToDegrees(state.geodetic.latitude),
      longitudeDegrees: normalizeLongitudeDegrees(radiansToDegrees(state.geodetic.longitude)),
      radiusKm: vectorMagnitude(state.position),
      specificEnergyKm2PerSecond2: specificOrbitalEnergy(state.position, state.velocity),
      timestampUnixMs,
      velocityKmPerSecond: vectorMagnitude(state.velocity),
    });
  }
  const apsides = derivedApsides(record);
  const warnings = warningsFor([record], invalidSampleCount > 0);
  return envelope(request.requestId, "SGP4-ECI", [record], warnings, {
    derivedApogeeKm: apsides.apogeeKm,
    derivedPerigeeKm: apsides.perigeeKm,
    invalidSampleCount,
    samples,
    satelliteId: record.id,
  });
}

async function calculateGroundStationAccess(
  request: Extract<AnalysisWorkerRequest, { type: "ground-station" }>,
): Promise<AnalysisEnvelope<GroundStationAccessResult>> {
  const { record, satrec } = selectedRecord(request.satelliteId);
  const start = finiteTime(request.startUnixMs, "invalid-start");
  const requestedEnd = finiteTime(request.endUnixMs, "invalid-end");
  const end = Math.min(requestedEnd, start + MAX_PASS_HORIZON_MS);
  if (end <= start) throw new AnalysisError("invalid-interval", "Pass interval is invalid");
  validateStation(request.station);
  const threshold = request.station.minimumElevationDegrees;
  const periodSeconds = Math.max(1, record.periodMinutes * 60);
  const stepMs = Math.max(5_000, Math.min(30_000, periodSeconds * 1_000 / 240));
  const passes: GroundStationPass[] = [];
  let invalidSampleCount = 0;
  let previousTime = start;
  let previous = lookSample(satrec, request.station, start);
  if (!previous) invalidSampleCount += 1;
  let passStart: number | null = previous && previous.elevationDegrees >= threshold ? start : null;
  let startedAbove = passStart !== null;

  let iteration = 0;
  const estimatedSteps = Math.max(1, Math.ceil((end - start) / stepMs));
  for (let timestamp = start + stepMs; timestamp <= end + stepMs; timestamp += stepMs) {
    checkCancelled(request.requestId);
    const currentTime = Math.min(timestamp, end);
    const current = lookSample(satrec, request.station, currentTime);
    if (!current) invalidSampleCount += 1;
    if (previous && current) {
      const wasAbove = previous.elevationDegrees >= threshold;
      const isAbove = current.elevationDegrees >= threshold;
      if (!wasAbove && isAbove) {
        passStart = refineElevationCrossing(
          satrec,
          request.station,
          threshold,
          previousTime,
          currentTime,
          true,
        );
        startedAbove = false;
      } else if (wasAbove && !isAbove && passStart !== null) {
        const passEnd = refineElevationCrossing(
          satrec,
          request.station,
          threshold,
          previousTime,
          currentTime,
          false,
        );
        passes.push(buildPass(satrec, request.station, passStart, passEnd, false));
        passStart = null;
        startedAbove = false;
      }
    }
    previous = current;
    previousTime = currentTime;
    iteration += 1;
    if (iteration % 256 === 0) {
      scope.postMessage({
        progress: Math.min(0.95, iteration / estimatedSteps),
        requestId: request.requestId,
        stage: "pass-detection",
        type: "progress",
      });
      await yieldToMessages();
    }
    if (currentTime === end) break;
  }
  if (passStart !== null) {
    passes.push(buildPass(satrec, request.station, passStart, end, startedAbove));
  }

  return envelope(request.requestId, "ECF", [record], warningsFor([record], invalidSampleCount > 0), {
    invalidSampleCount,
    passes,
    satelliteId: record.id,
    station: request.station,
  });
}

function calculateConstellation(
  request: Extract<AnalysisWorkerRequest, { type: "constellation" }>,
): AnalysisEnvelope<ConstellationResult> {
  const points: ConstellationPoint[] = [];
  const categoryCounts: ConstellationResult["categoryCounts"] = {};
  const ownerCountMap = new Map<string, number>();
  for (const record of records) {
    checkCancelled(request.requestId);
    const envelopeValues = radialEnvelope(record);
    const altitudeKm = (envelopeValues.perigeeKm + envelopeValues.apogeeKm) / 2;
    if (!matchesConstellationFilter(record, altitudeKm, request.filter)) continue;
    points.push({
      altitudeKm,
      apogeeKm: envelopeValues.apogeeKm,
      category: record.category,
      eccentricity: record.eccentricity,
      id: record.id,
      inclinationDegrees: record.inclinationDegrees,
      name: record.name,
      noradId: record.noradId,
      objectType: record.objectType,
      operationalStatusCode: record.operationalStatusCode,
      ownerCode: record.ownerCode,
      perigeeKm: envelopeValues.perigeeKm,
      periodMinutes: record.periodMinutes,
      rightAscensionDegrees: record.rightAscensionDegrees,
    });
    categoryCounts[record.category] = (categoryCounts[record.category] ?? 0) + 1;
    const owner = record.ownerCode ?? "—";
    ownerCountMap.set(owner, (ownerCountMap.get(owner) ?? 0) + 1);
  }
  const ownerCounts = [...ownerCountMap.entries()]
    .map(([ownerCode, count]) => ({ count, ownerCode }))
    .sort((left, right) => right.count - left.count || left.ownerCode.localeCompare(right.ownerCode))
    .slice(0, 20);
  return envelope(request.requestId, "SGP4-ECI", [], warningsFor([], false), {
    categoryCounts,
    ownerCounts,
    points,
    totalCatalogCount: records.length,
  });
}

async function calculateProximity(
  request: Extract<AnalysisWorkerRequest, { type: "proximity" }>,
): Promise<AnalysisEnvelope<ProximityResult>> {
  if (!bulkRuntime) throw new AnalysisError("not-ready", "Analysis runtime is not ready");
  const primary = selectedRecord(request.primaryId);
  const start = finiteTime(request.startUnixMs, "invalid-start");
  const end = Math.min(finiteTime(request.endUnixMs, "invalid-end"), start + MAX_PROXIMITY_HORIZON_MS);
  if (end <= start) throw new AnalysisError("invalid-interval", "Screening interval is invalid");
  const thresholdKm = Math.min(250, Math.max(1, request.thresholdKm));
  const primaryEnvelope = radialEnvelope(primary.record);
  const candidateIndices = records.flatMap((record, index) => {
    if (record.id === primary.record.id) return [];
    const candidateEnvelope = radialEnvelope(record);
    const overlaps = candidateEnvelope.perigeeKm <= primaryEnvelope.apogeeKm + RADIAL_FILTER_MARGIN_KM
      && candidateEnvelope.apogeeKm >= primaryEnvelope.perigeeKm - RADIAL_FILTER_MARGIN_KM;
    return overlaps ? [index] : [];
  });
  const potentialByIndex = new Map<number, { distanceKm: number; estimatedTcaUnixMs: number }>();
  const stepCount = Math.max(1, Math.ceil((end - start) / PROXIMITY_COARSE_STEP_MS));
  for (let step = 0; step <= stepCount; step += 1) {
    checkCancelled(request.requestId);
    const timestampUnixMs = Math.min(end, start + step * PROXIMITY_COARSE_STEP_MS);
    bulkRuntime.propagator.setDates([new Date(timestampUnixMs)]);
    bulkRuntime.propagator.run({ eci: { communityDecayCheckEnabled: true } });
    const raw = bulkRuntime.propagator.getRawOutput().eci;
    const primaryIndex = indexById.get(primary.record.id)!;
    if (raw.error[primaryIndex] !== 0) continue;
    const primaryPosition = vectorFromArray(raw.position, primaryIndex * 3);
    const primaryVelocity = vectorFromArray(raw.velocity, primaryIndex * 3);
    const remainingSeconds = Math.min(PROXIMITY_COARSE_STEP_MS, end - timestampUnixMs) / 1_000;
    for (const candidateIndex of candidateIndices) {
      if (raw.error[candidateIndex] !== 0) continue;
      const relativePosition = subtractVectors(
        vectorFromArray(raw.position, candidateIndex * 3),
        primaryPosition,
      );
      const relativeVelocity = subtractVectors(
        vectorFromArray(raw.velocity, candidateIndex * 3),
        primaryVelocity,
      );
      const velocitySquared = relativeVelocity.x ** 2 + relativeVelocity.y ** 2 + relativeVelocity.z ** 2;
      const closestSeconds = velocitySquared > 0
        ? clamp(-dot(relativePosition, relativeVelocity) / velocitySquared, 0, remainingSeconds)
        : 0;
      const estimated = {
        x: relativePosition.x + relativeVelocity.x * closestSeconds,
        y: relativePosition.y + relativeVelocity.y * closestSeconds,
        z: relativePosition.z + relativeVelocity.z * closestSeconds,
      };
      const estimatedDistance = vectorMagnitude(estimated);
      if (estimatedDistance > thresholdKm + PROXIMITY_GUARD_KM) continue;
      const previous = potentialByIndex.get(candidateIndex);
      if (!previous || estimatedDistance < previous.distanceKm) {
        potentialByIndex.set(candidateIndex, {
          distanceKm: estimatedDistance,
          estimatedTcaUnixMs: timestampUnixMs + closestSeconds * 1_000,
        });
      }
    }
    if (step % 6 === 0 || step === stepCount) {
      scope.postMessage({
        progress: step / Math.max(1, stepCount) * 0.78,
        requestId: request.requestId,
        stage: "coarse-screening",
        type: "progress",
      });
      await yieldToMessages();
    }
  }

  const events: ProximityEvent[] = [];
  const potentials = [...potentialByIndex.entries()];
  for (let index = 0; index < potentials.length; index += 1) {
    checkCancelled(request.requestId);
    const [candidateIndex, potential] = potentials[index]!;
    const secondary = records[candidateIndex]!;
    const refined = refineClosestApproach(
      primary.satrec,
      satrecs[candidateIndex]!,
      Math.max(start, potential.estimatedTcaUnixMs - PROXIMITY_COARSE_STEP_MS),
      Math.min(end, potential.estimatedTcaUnixMs + PROXIMITY_COARSE_STEP_MS),
    );
    if (refined && refined.missDistanceKm <= thresholdKm) {
      const rtn = projectRelativePositionToRtn(
        refined.primaryPosition,
        refined.primaryVelocity,
        refined.relativePosition,
      );
      if (rtn) {
        events.push({
          ...rtn,
          missDistanceKm: refined.missDistanceKm,
          primaryEpochUnixMs: epochMs(primary.record),
          primaryId: primary.record.id,
          relativeVelocityKmPerSecond: vectorMagnitude(refined.relativeVelocity),
          secondaryEpochUnixMs: epochMs(secondary),
          secondaryId: secondary.id,
          tcaUnixMs: refined.tcaUnixMs,
        });
      }
    }
    if (index % 4 === 0 || index === potentials.length - 1) {
      scope.postMessage({
        progress: 0.78 + (index + 1) / Math.max(1, potentials.length) * 0.22,
        requestId: request.requestId,
        stage: "refinement",
        type: "progress",
      });
      await yieldToMessages();
    }
  }
  events.sort((left, right) => left.missDistanceKm - right.missDistanceKm || left.tcaUnixMs - right.tcaUnixMs);
  const bounded = events.length > MAX_PROXIMITY_RESULTS;
  const resultEvents = events.slice(0, MAX_PROXIMITY_RESULTS);
  const relatedRecords = [primary.record, ...resultEvents.flatMap((event) => {
    const record = recordsById.get(event.secondaryId);
    return record ? [record] : [];
  })];
  const warnings = warningsFor(relatedRecords, false);
  warnings.push({ code: "no-covariance" });
  if (bounded) warnings.push({ code: "bounded-result" });
  return envelope(request.requestId, "SGP4-ECI", relatedRecords, warnings, {
    candidateCount: candidateIndices.length,
    events: resultEvents,
    primaryId: primary.record.id,
    screenedObjectCount: Math.max(0, records.length - 1),
  });
}

function buildPass(
  satrec: Satrec,
  station: GroundStationInput,
  aosUnixMs: number,
  losUnixMs: number,
  continuous: boolean,
): GroundStationPass {
  const tcaUnixMs = maximizeElevation(satrec, station, aosUnixMs, losUnixMs);
  const aos = lookSample(satrec, station, aosUnixMs);
  const los = lookSample(satrec, station, losUnixMs);
  const tca = lookSample(satrec, station, tcaUnixMs);
  if (!aos || !los || !tca) throw new AnalysisError("propagation-failed", "Pass refinement failed");
  const duration = Math.max(0, losUnixMs - aosUnixMs);
  const sampleCount = Math.min(180, Math.max(24, Math.ceil(duration / 15_000)));
  const samples: PassSample[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const timestamp = aosUnixMs + duration * index / Math.max(1, sampleCount - 1);
    const sample = lookSample(satrec, station, timestamp);
    if (sample) samples.push(sample);
  }
  return {
    aosAzimuthDegrees: aos.azimuthDegrees,
    aosUnixMs,
    continuous,
    durationSeconds: duration / 1_000,
    losAzimuthDegrees: los.azimuthDegrees,
    losUnixMs,
    maximumElevationDegrees: tca.elevationDegrees,
    minimumRangeKm: tca.rangeKm,
    samples,
    tcaUnixMs,
  };
}

function lookSample(satrec: Satrec, station: GroundStationInput, timestampUnixMs: number): PassSample | null {
  const state = propagateState(satrec, timestampUnixMs);
  if (!state) return null;
  const observer = {
    height: station.altitudeMeters / 1_000,
    latitude: degreesToRadians(station.latitudeDegrees),
    longitude: degreesToRadians(station.longitudeDegrees),
  };
  const look = ecfToLookAngles(observer, state.ecf);
  const halfSecond = 500;
  const before = propagateState(satrec, timestampUnixMs - halfSecond);
  const after = propagateState(satrec, timestampUnixMs + halfSecond);
  let radialVelocityKmPerSecond = 0;
  if (before && after) {
    const beforeRange = ecfToLookAngles(observer, before.ecf).rangeSat;
    const afterRange = ecfToLookAngles(observer, after.ecf).rangeSat;
    radialVelocityKmPerSecond = afterRange - beforeRange;
  }
  return {
    azimuthDegrees: normalizeAzimuthDegrees(radiansToDegrees(look.azimuth)),
    dopplerShiftHz: station.downlinkFrequencyHz === null
      ? null
      : classicalDopplerShiftHz(radialVelocityKmPerSecond, station.downlinkFrequencyHz),
    elevationDegrees: radiansToDegrees(look.elevation),
    radialVelocityKmPerSecond,
    rangeKm: look.rangeSat,
    timestampUnixMs,
  };
}

function refineElevationCrossing(
  satrec: Satrec,
  station: GroundStationInput,
  threshold: number,
  lowerUnixMs: number,
  upperUnixMs: number,
  rising: boolean,
): number {
  let lower = lowerUnixMs;
  let upper = upperUnixMs;
  while (upper - lower > 1_000) {
    const middle = (lower + upper) / 2;
    const sample = lookSample(satrec, station, middle);
    if (!sample) break;
    const above = sample.elevationDegrees >= threshold;
    if (rising ? above : !above) upper = middle;
    else lower = middle;
  }
  return Math.round((lower + upper) / 2);
}

function maximizeElevation(
  satrec: Satrec,
  station: GroundStationInput,
  startUnixMs: number,
  endUnixMs: number,
): number {
  let left = startUnixMs;
  let right = endUnixMs;
  for (let iteration = 0; iteration < 28 && right - left > 500; iteration += 1) {
    const first = left + (right - left) / 3;
    const second = right - (right - left) / 3;
    const firstElevation = lookSample(satrec, station, first)?.elevationDegrees ?? -90;
    const secondElevation = lookSample(satrec, station, second)?.elevationDegrees ?? -90;
    if (firstElevation < secondElevation) left = first;
    else right = second;
  }
  return Math.round((left + right) / 2);
}

function refineClosestApproach(
  primary: Satrec,
  secondary: Satrec,
  startUnixMs: number,
  endUnixMs: number,
) {
  let left = startUnixMs;
  let right = endUnixMs;
  for (let iteration = 0; iteration < 30 && right - left > 500; iteration += 1) {
    const first = left + (right - left) / 3;
    const second = right - (right - left) / 3;
    if (separationAt(primary, secondary, first) > separationAt(primary, secondary, second)) left = first;
    else right = second;
  }
  const tcaUnixMs = Math.round((left + right) / 2);
  const primaryState = propagateState(primary, tcaUnixMs);
  const secondaryState = propagateState(secondary, tcaUnixMs);
  if (!primaryState || !secondaryState) return null;
  const relativePosition = subtractVectors(secondaryState.position, primaryState.position);
  const relativeVelocity = subtractVectors(secondaryState.velocity, primaryState.velocity);
  return {
    missDistanceKm: vectorMagnitude(relativePosition),
    primaryPosition: primaryState.position,
    primaryVelocity: primaryState.velocity,
    relativePosition,
    relativeVelocity,
    tcaUnixMs,
  };
}

function separationAt(primary: Satrec, secondary: Satrec, timestampUnixMs: number): number {
  const primaryState = propagateState(primary, timestampUnixMs);
  const secondaryState = propagateState(secondary, timestampUnixMs);
  return primaryState && secondaryState
    ? vectorMagnitude(subtractVectors(secondaryState.position, primaryState.position))
    : Number.POSITIVE_INFINITY;
}

function propagateState(satrec: Satrec, timestampUnixMs: number) {
  const date = new Date(timestampUnixMs);
  const propagated = propagate(satrec, date, { communityDecayCheckEnabled: true });
  if (!propagated?.position || !propagated.velocity) return null;
  const gmst = gstime(date);
  return {
    ecf: eciToEcf(propagated.position, gmst),
    geodetic: eciToGeodetic(propagated.position, gmst),
    position: propagated.position as Vector3,
    velocity: propagated.velocity as Vector3,
  };
}

function matchesConstellationFilter(
  record: AnalysisSatelliteInput,
  altitudeKm: number,
  filter: ConstellationFilter,
): boolean {
  const normalizedOwner = record.ownerCode?.toLocaleUpperCase() ?? null;
  const normalizedType = record.objectType?.toLocaleUpperCase() ?? null;
  const normalizedStatus = record.operationalStatusCode?.toLocaleUpperCase() ?? null;
  return (filter.categories.length === 0 || filter.categories.includes(record.category))
    && (filter.ownerCodes.length === 0 || (normalizedOwner !== null && filter.ownerCodes.some((value) => value.toLocaleUpperCase() === normalizedOwner)))
    && (filter.objectTypes.length === 0 || (normalizedType !== null && filter.objectTypes.some((value) => value.toLocaleUpperCase() === normalizedType)))
    && (filter.operationalStatuses.length === 0
      || (normalizedStatus !== null && filter.operationalStatuses.some((value) => value.toLocaleUpperCase() === normalizedStatus)))
    && (filter.altitudeMinimumKm === null || altitudeKm >= filter.altitudeMinimumKm)
    && (filter.altitudeMaximumKm === null || altitudeKm <= filter.altitudeMaximumKm)
    && (filter.inclinationMinimumDegrees === null || record.inclinationDegrees >= filter.inclinationMinimumDegrees)
    && (filter.inclinationMaximumDegrees === null || record.inclinationDegrees <= filter.inclinationMaximumDegrees);
}

function envelope<Result>(
  requestId: string,
  frame: AnalysisEnvelope<Result>["frame"],
  relatedRecords: readonly AnalysisSatelliteInput[],
  warnings: AnalysisEnvelope<Result>["warnings"],
  result: Result,
): AnalysisEnvelope<Result> {
  if (!metadata) throw new AnalysisError("not-ready", "Analysis metadata is unavailable");
  return {
    catalogFetchedAtUnixMs: metadata.fetchedAtUnixMs,
    frame,
    generatedAtUnixMs: Date.now(),
    model: "SGP4",
    objectEpochs: Object.fromEntries(relatedRecords.map((record) => [record.id, epochMs(record)])),
    requestId,
    result,
    stale: metadata.stale,
    warnings,
  };
}

function warningsFor(relatedRecords: readonly AnalysisSatelliteInput[], partial: boolean) {
  if (!metadata) return [];
  const warnings = epochWarnings(relatedRecords, Date.now(), metadata.stale);
  if (partial) warnings.push({ code: "partial-propagation" });
  return warnings;
}

function selectedRecord(id: string): { record: AnalysisSatelliteInput; satrec: Satrec } {
  const index = indexById.get(id);
  if (index === undefined) throw new AnalysisError("object-not-found", "Satellite is not in the current catalog");
  return { record: records[index]!, satrec: satrecs[index]! };
}

function validateStation(station: GroundStationInput): void {
  if (!station.name.trim() || station.name.length > 80
    || !inRange(station.latitudeDegrees, -90, 90)
    || !inRange(station.longitudeDegrees, -180, 180)
    || !inRange(station.altitudeMeters, -500, 10_000)
    || !inRange(station.minimumElevationDegrees, 0, 90)
    || (station.downlinkFrequencyHz !== null && !inRange(station.downlinkFrequencyHz, 1, 1e12))) {
    throw new AnalysisError("invalid-station", "Ground station profile is invalid");
  }
}

function vectorFromArray(values: Float64Array, offset: number): Vector3 {
  return { x: values[offset]!, y: values[offset + 1]!, z: values[offset + 2]! };
}

function epochMs(record: Pick<AnalysisSatelliteInput, "epoch">): number {
  const value = Date.parse(record.epoch);
  return Number.isFinite(value) ? value : 0;
}

function finiteTime(value: number, code: string): number {
  if (!Number.isFinite(value) || value < 0) throw new AnalysisError(code, "Timestamp is invalid");
  return value;
}

function ensureReady(): void {
  if (!metadata || records.length === 0 || !bulkRuntime) {
    throw new AnalysisError("not-ready", "Analysis worker is not initialized");
  }
}

function checkCancelled(requestId: string): void {
  if (cancelled.has(requestId)) throw new AnalysisError("cancelled", "Analysis was cancelled");
}

function disposeRuntime(): void {
  bulkRuntime?.propagator.dispose();
  bulkRuntime?.wasmRuntime.dispose();
  bulkRuntime = null;
  records = [];
  recordsById.clear();
  satrecs = [];
  indexById.clear();
  metadata = null;
  cancelled.clear();
}

function radiansToDegrees(value: number): number {
  return value * 180 / Math.PI;
}

function normalizeAzimuthDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function inRange(value: number, minimum: number, maximum: number): boolean {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function dot(left: Vector3, right: Vector3): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function yieldToMessages(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

class AnalysisError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}
