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
import { parseUtcEpoch } from "@/shared/data/utcEpoch";
import { createRunContext, type CalculationRequest } from "../domain/runContext";
import { deduplicateProximityEvents } from "../domain/proximityEvents";
import { minimizeBounded, refineCrossing } from "../domain/numerics";

import type {
  AnalysisCatalogMetadata,
  AnalysisEnvelope,
  AnalysisSatelliteInput,
  ConstellationFilter,
  ConstellationPoint,
  ConstellationResult,
  CoveragePass,
  CoverageResult,
  DynamicsResult,
  GroundStationAccessResult,
  GroundStationInput,
  GroundStationPass,
  GroundNetworkResult,
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
import { calculateGroundNetworkGaps, mergeGroundNetworkWindows } from "../domain/groundNetwork";
import { calculateCoverageGaps, mergeCoverageWindows, solarElevationDegrees } from "../domain/coverage";
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
let pending: AnalysisWorkerRequest | null = null;
let processing = false;
let activeRequest: CalculationRequest | null = null;

scope.onmessage = (event) => {
  if (event.data.type === "cancel") {
    if (activeRequest?.requestId === event.data.requestId
      || (pending && "requestId" in pending && pending.requestId === event.data.requestId)) cancelled.add(event.data.requestId);
    return;
  }
  if (activeRequest) cancelled.add(activeRequest.requestId);
  if (pending && "requestId" in pending) {
    scope.postMessage({ requestId: pending.requestId, type: "cancelled" });
  }
  pending = event.data;
  void drainRequests();
};

async function drainRequests() {
  if (processing) return;
  processing = true;
  try {
    while (pending) {
      const request = pending;
      pending = null;
      activeRequest = "requestId" in request && request.type !== "cancel" ? request : null;
      await handleRequest(request);
      if (activeRequest) cancelled.delete(activeRequest.requestId);
      activeRequest = null;
    }
  } finally { processing = false; }
}

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
      scope.postMessage({ count: records.length, type: "ready" });
      return;
    }
    if (request.type === "dispose") {
      disposeRuntime();
      close();
      return;
    }
    ensureReady();
    checkCancelled(request.requestId);
    let analysis: AnalysisWorkerResult;
    let kind: "dynamics" | "groundStation" | "groundNetwork" | "constellation" | "proximity" | "coverage";
    if (request.type === "dynamics") {
      analysis = await calculateDynamics(request);
      kind = "dynamics";
    } else if (request.type === "ground-station") {
      analysis = await calculateGroundStationAccess(request);
      kind = "groundStation";
    } else if (request.type === "ground-network") {
      analysis = await calculateGroundNetwork(request);
      kind = "groundNetwork";
    } else if (request.type === "constellation") {
      analysis = await calculateConstellation(request);
      kind = "constellation";
    } else if (request.type === "proximity") {
      analysis = await calculateProximity(request);
      kind = "proximity";
    } else if (request.type === "coverage") {
      analysis = await calculateCoverage(request);
      kind = "coverage";
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

async function calculateDynamics(request: Extract<AnalysisWorkerRequest, { type: "dynamics" }>): Promise<AnalysisEnvelope<DynamicsResult>> {
  const { record, satrec } = selectedRecord(request.satelliteId);
  const start = finiteTime(request.startUnixMs, "invalid-start");
  const end = finiteTime(request.endUnixMs, "invalid-end");
  if (end <= start || end - start > MAX_PASS_HORIZON_MS || !Number.isInteger(request.sampleCount)
    || request.sampleCount < 2 || request.sampleCount > MAX_DYNAMICS_SAMPLES) throw new AnalysisError("invalid-interval", "Analysis interval is invalid");
  const count = request.sampleCount;
  const samples: DynamicsResult["samples"] = [];
  let invalidSampleCount = 0;
  for (let index = 0; index < count; index += 1) {
    if (index % 64 === 0) await yieldToMessages();
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
  const end = finiteTime(request.endUnixMs, "invalid-end");
  if (end <= start || end - start > MAX_PASS_HORIZON_MS) throw new AnalysisError("invalid-interval", "Pass interval is invalid");
  validateStation(request.station);
  const { invalidSampleCount, passes } = await detectPasses(
    request.requestId,
    record,
    satrec,
    request.station,
    start,
    end,
    0,
    1,
  );

  return envelope(request.requestId, "ECF", [record], warningsFor([record], invalidSampleCount > 0), {
    invalidSampleCount,
    passes,
    satelliteId: record.id,
    station: request.station,
  });
}

async function calculateGroundNetwork(
  request: Extract<AnalysisWorkerRequest, { type: "ground-network" }>,
): Promise<AnalysisEnvelope<GroundNetworkResult>> {
  const { record, satrec } = selectedRecord(request.satelliteId);
  const start = finiteTime(request.startUnixMs, "invalid-start");
  const end = finiteTime(request.endUnixMs, "invalid-end");
  if (end <= start || end - start > MAX_PASS_HORIZON_MS) throw new AnalysisError("invalid-interval", "Network interval is invalid");
  if (request.stations.length < 1 || request.stations.length > 12) {
    throw new AnalysisError("invalid-network", "Select between 1 and 12 ground stations");
  }
  const stationIds = new Set<string>();
  for (const station of request.stations) {
    validateStation(station);
    if (stationIds.has(station.id)) throw new AnalysisError("invalid-network", "Ground station IDs must be unique");
    stationIds.add(station.id);
  }

  const stationResults: GroundNetworkResult["stationResults"] = [];
  for (let index = 0; index < request.stations.length; index += 1) {
    checkCancelled(request.requestId);
    const station = request.stations[index]!;
    const result = await detectPasses(
      request.requestId,
      record,
      satrec,
      station,
      start,
      end,
      index / request.stations.length,
      1 / request.stations.length,
    );
    stationResults.push({ ...result, station });
  }

  const contactWindows = mergeGroundNetworkWindows(stationResults);
  const gaps = calculateGroundNetworkGaps(start, end, contactWindows);
  const totalContactSeconds = contactWindows.reduce(
    (total, window) => total + (window.endUnixMs - window.startUnixMs) / 1_000,
    0,
  );
  const intervalSeconds = (end - start) / 1_000;
  const invalidSampleCount = stationResults.reduce((total, result) => total + result.invalidSampleCount, 0);
  return envelope(request.requestId, "ECF", [record], warningsFor([record], invalidSampleCount > 0), {
    availabilityPercent: intervalSeconds > 0 ? totalContactSeconds / intervalSeconds * 100 : 0,
    contactWindows,
    endUnixMs: end,
    gaps,
    longestGapSeconds: gaps.reduce((longest, gap) => Math.max(longest, gap.durationSeconds), 0),
    satelliteId: record.id,
    startUnixMs: start,
    stationResults,
    totalContactSeconds,
  });
}

async function calculateCoverage(
  request: Extract<AnalysisWorkerRequest, { type: "coverage" }>,
): Promise<AnalysisEnvelope<CoverageResult>> {
  const start = finiteTime(request.startUnixMs, "invalid-start");
  const end = finiteTime(request.endUnixMs, "invalid-end");
  if (end <= start || end - start > MAX_PASS_HORIZON_MS) throw new AnalysisError("invalid-interval", "Coverage interval is invalid");
  if (request.satelliteIds.length < 1 || request.satelliteIds.length > 24) {
    throw new AnalysisError("invalid-coverage", "Select between 1 and 24 catalog objects");
  }
  const satelliteIds = [...new Set(request.satelliteIds)];
  if (satelliteIds.length !== request.satelliteIds.length) {
    throw new AnalysisError("invalid-coverage", "Coverage object IDs must be unique");
  }
  const station: GroundStationInput = {
    altitudeMeters: request.target.altitudeMeters,
    downlinkFrequencyHz: null,
    id: "coverage-target",
    latitudeDegrees: request.target.latitudeDegrees,
    longitudeDegrees: request.target.longitudeDegrees,
    minimumElevationDegrees: request.target.minimumElevationDegrees,
    name: request.target.name,
  };
  validateStation(station);
  const related = satelliteIds.map((id) => selectedRecord(id));
  const passes: CoveragePass[] = [];
  let invalidSampleCount = 0;
  for (let index = 0; index < related.length; index += 1) {
    checkCancelled(request.requestId);
    const { record, satrec } = related[index]!;
    const detected = await detectPasses(
      request.requestId,
      record,
      satrec,
      station,
      start,
      end,
      index / related.length,
      1 / related.length,
    );
    invalidSampleCount += detected.invalidSampleCount;
    for (const pass of detected.passes) {
      const sunElevationDegrees = solarElevationDegrees(
        request.target.latitudeDegrees,
        request.target.longitudeDegrees,
        pass.tcaUnixMs,
      );
      passes.push({
        ...pass,
        lighting: sunElevationDegrees >= 0 ? "day" : sunElevationDegrees >= -6 ? "twilight" : "night",
        satelliteId: record.id,
        satelliteName: record.name,
        sunElevationDegrees,
      });
    }
  }
  passes.sort((left, right) => left.aosUnixMs - right.aosUnixMs);
  const windows = mergeCoverageWindows(passes);
  const revisitGaps = calculateCoverageGaps(start, end, windows);
  const coveredMilliseconds = windows.reduce(
    (total, window) => total + window.endUnixMs - window.startUnixMs,
    0,
  );
  return envelope(
    request.requestId,
    "ECF",
    related.map(({ record }) => record),
    warningsFor(related.map(({ record }) => record), invalidSampleCount > 0),
    {
      availabilityPercent: coveredMilliseconds / (end - start) * 100,
      endUnixMs: end,
      invalidSampleCount,
      longestRevisitSeconds: revisitGaps.some((gap) => gap.kind === "between-passes") ? revisitGaps.filter((gap) => gap.kind === "between-passes").reduce(
        (longest, gap) => Math.max(longest, gap.durationSeconds),
        0,
      ) : null,
      passes,
      revisitGaps,
      satelliteIds,
      startUnixMs: start,
      target: request.target,
      windows,
    },
  );
}

async function detectPasses(
  requestId: string,
  record: AnalysisSatelliteInput,
  satrec: Satrec,
  station: GroundStationInput,
  start: number,
  end: number,
  progressOffset: number,
  progressScale: number,
): Promise<{ invalidSampleCount: number; passes: GroundStationPass[] }> {
  const threshold = station.minimumElevationDegrees;
  const periodSeconds = Math.max(1, record.periodMinutes * 60);
  const stepMs = Math.max(5_000, Math.min(30_000, periodSeconds * 1_000 / 240));
  const passes: GroundStationPass[] = [];
  let invalidSampleCount = 0;
  let previousTime = start;
  let previous = lookSample(satrec, station, start);
  if (!previous) invalidSampleCount += 1;
  let passStart: number | null = previous && previous.elevationDegrees >= threshold ? start : null;
  let startedAbove = passStart !== null;
  let iteration = 0;
  const estimatedSteps = Math.max(1, Math.ceil((end - start) / stepMs));
  for (let timestamp = start + stepMs; timestamp <= end + stepMs; timestamp += stepMs) {
    checkCancelled(requestId);
    const currentTime = Math.min(timestamp, end);
    const current = lookSample(satrec, station, currentTime);
    if (!current) { invalidSampleCount += 1; passStart = null; startedAbove = false; }
    if (previous && current) {
      const wasAbove = previous.elevationDegrees >= threshold;
      const isAbove = current.elevationDegrees >= threshold;
      if (!wasAbove && !isAbove && Math.max(previous.elevationDegrees, current.elevationDegrees) > threshold - 5) {
        const peakTime = maximizeElevation(satrec, station, previousTime, currentTime);
        const peak = lookSample(satrec, station, peakTime, false);
        if (peak && peak.elevationDegrees >= threshold) {
          const aos = refineElevationCrossing(satrec, station, threshold, previousTime, peakTime, true);
          const los = refineElevationCrossing(satrec, station, threshold, peakTime, currentTime, false);
          passes.push(buildPass(satrec, station, aos, los, false));
        }
      }
      if (!wasAbove && isAbove) {
        passStart = refineElevationCrossing(satrec, station, threshold, previousTime, currentTime, true);
        startedAbove = false;
      } else if (wasAbove && !isAbove && passStart !== null) {
        const passEnd = refineElevationCrossing(satrec, station, threshold, previousTime, currentTime, false);
        passes.push(buildPass(satrec, station, passStart, passEnd, false));
        passStart = null;
        startedAbove = false;
      }
    }
    previous = current;
    previousTime = currentTime;
    iteration += 1;
    if (iteration % 256 === 0) {
      scope.postMessage({
        progress: Math.min(0.99, progressOffset + iteration / estimatedSteps * progressScale),
        requestId,
        stage: progressScale < 1 ? "network-planning" : "pass-detection",
        type: "progress",
      });
      await yieldToMessages();
    }
    if (currentTime === end) break;
  }
  if (passStart !== null) passes.push(buildPass(satrec, station, passStart, end, startedAbove));
  return { invalidSampleCount, passes };
}

async function calculateConstellation(
  request: Extract<AnalysisWorkerRequest, { type: "constellation" }>,
): Promise<AnalysisEnvelope<ConstellationResult>> {
  const points: ConstellationPoint[] = [];
  const categoryCounts: ConstellationResult["categoryCounts"] = {};
  const ownerCountMap = new Map<string, number>();
  let iteration = 0;
  for (const record of records) {
    if (iteration++ % 256 === 0) await yieldToMessages();
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
  const included = points.map((point) => recordsById.get(point.id)!);
  return envelope(request.requestId, "SGP4-ECI", included, warningsFor(included, false), {
    categoryCounts,
    ownerCounts,
    points,
    totalCatalogCount: records.length,
  });
}

async function calculateProximity(
  request: Extract<AnalysisWorkerRequest, { type: "proximity" }>,
): Promise<AnalysisEnvelope<ProximityResult>> {
  if (!bulkRuntime) bulkRuntime = await createBulkRuntime(satrecs);
  checkCancelled(request.requestId);
  const primary = selectedRecord(request.primaryId);
  const start = finiteTime(request.startUnixMs, "invalid-start");
  const end = finiteTime(request.endUnixMs, "invalid-end");
  if (end <= start || end - start > MAX_PROXIMITY_HORIZON_MS) throw new AnalysisError("invalid-interval", "Screening interval is invalid");
  if (!inRange(request.thresholdKm, 1, 250)) throw new AnalysisError("invalid-interval", "Invalid screening threshold");
  const thresholdKm = request.thresholdKm;
  const primaryEnvelope = radialEnvelope(primary.record);
  const candidateIndices = records.flatMap((record, index) => {
    if (record.id === primary.record.id) return [];
    const candidateEnvelope = radialEnvelope(record);
    const overlaps = candidateEnvelope.perigeeKm <= primaryEnvelope.apogeeKm + RADIAL_FILTER_MARGIN_KM
      && candidateEnvelope.apogeeKm >= primaryEnvelope.perigeeKm - RADIAL_FILTER_MARGIN_KM;
    return overlaps ? [index] : [];
  });
  let invalidSampleCount = 0;
  const potentials: Array<[number, { estimatedTcaUnixMs: number }]> = [];
  const recent = new Map<number, { distance: number; time: number; previousDistance: number }>();
  const stepCount = Math.max(1, Math.ceil((end - start) / PROXIMITY_COARSE_STEP_MS));
  for (let step = 0; step <= stepCount; step += 1) {
    checkCancelled(request.requestId);
    const timestampUnixMs = Math.min(end, start + step * PROXIMITY_COARSE_STEP_MS);
    bulkRuntime.propagator.setDates([new Date(timestampUnixMs)]);
    bulkRuntime.propagator.run({ eci: { communityDecayCheckEnabled: true } });
    const raw = bulkRuntime.propagator.getRawOutput().eci;
    const primaryIndex = indexById.get(primary.record.id)!;
    if (raw.error[primaryIndex] !== 0) {
      invalidSampleCount += candidateIndices.length;
      recent.clear();
      await yieldToMessages();
      continue;
    }
    const primaryPosition = vectorFromArray(raw.position, primaryIndex * 3);
    const primaryVelocity = vectorFromArray(raw.velocity, primaryIndex * 3);
    const remainingSeconds = Math.min(PROXIMITY_COARSE_STEP_MS, end - timestampUnixMs) / 1_000;
    for (const candidateIndex of candidateIndices) {
      if (raw.error[candidateIndex] !== 0) { invalidSampleCount++; recent.delete(candidateIndex); continue; }
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
      if (!Number.isFinite(estimatedDistance) || estimatedDistance > thresholdKm + PROXIMITY_GUARD_KM) {
        const last = recent.get(candidateIndex);
        if (last && last.distance <= last.previousDistance) potentials.push([candidateIndex, { estimatedTcaUnixMs: last.time }]);
        recent.delete(candidateIndex);
        continue;
      }
      const prior = recent.get(candidateIndex);
      const estimateTime = timestampUnixMs + closestSeconds * 1_000;
      if (prior && prior.distance <= prior.previousDistance && prior.distance < estimatedDistance) {
        potentials.push([candidateIndex, { estimatedTcaUnixMs: prior.time }]);
      }
      recent.set(candidateIndex, { distance: estimatedDistance, time: estimateTime, previousDistance: prior?.distance ?? Infinity });
    }
    if (potentials.length > 100_000) throw new AnalysisError("screening-too-dense", "Narrow the screening interval");
    {
      scope.postMessage({
        progress: step / Math.max(1, stepCount) * 0.78,
        requestId: request.requestId,
        stage: "coarse-screening",
        type: "progress",
      });
      await yieldToMessages();
    }
  }

  for (const [index, last] of recent) {
    if (last.distance <= last.previousDistance) potentials.push([index, { estimatedTcaUnixMs: last.time }]);
  }
  const events: ProximityEvent[] = [];
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
    if (!refined) invalidSampleCount++;
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
  const uniqueEvents = deduplicateProximityEvents(events, primary.record.id);
  const bounded = uniqueEvents.length > MAX_PROXIMITY_RESULTS;
  const resultEvents = uniqueEvents.slice(0, MAX_PROXIMITY_RESULTS);
  const relatedRecords = [primary.record, ...resultEvents.flatMap((event) => {
    const record = recordsById.get(event.secondaryId);
    return record ? [record] : [];
  })];
  const warnings = warningsFor(relatedRecords, invalidSampleCount > 0);
  warnings.push({ code: "no-covariance" });
  if (bounded) warnings.push({ code: "bounded-result" });
  return envelope(request.requestId, "SGP4-ECI", relatedRecords, warnings, {
    candidateCount: candidateIndices.length,
    invalidSampleCount,
    endUnixMs: end,
    events: resultEvents,
    primaryId: primary.record.id,
    screenedObjectCount: Math.max(0, records.length - 1),
    startUnixMs: start,
    thresholdKm,
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
  const minimumRangeTime = minimizeBounded((time) => lookSample(satrec, station, time, false)?.rangeKm ?? null, aosUnixMs, losUnixMs);
  const minimumRange = lookSample(satrec, station, minimumRangeTime, false);
  const aos = lookSample(satrec, station, aosUnixMs);
  const los = lookSample(satrec, station, losUnixMs);
  const tca = lookSample(satrec, station, tcaUnixMs);
  if (!aos || !los || !tca || !minimumRange) throw new AnalysisError("propagation-failed", "Pass refinement failed");
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
    minimumRangeKm: minimumRange.rangeKm,
    samples,
    tcaUnixMs,
  };
}

function lookSample(satrec: Satrec, station: GroundStationInput, timestampUnixMs: number, includeRate = true): PassSample | null {
  const state = propagateState(satrec, timestampUnixMs);
  if (!state) return null;
  const observer = {
    height: station.altitudeMeters / 1_000,
    latitude: degreesToRadians(station.latitudeDegrees),
    longitude: degreesToRadians(station.longitudeDegrees),
  };
  const look = ecfToLookAngles(observer, state.ecf);
  const halfSecond = 500;
  const before = includeRate ? propagateState(satrec, timestampUnixMs - halfSecond) : null;
  const after = includeRate ? propagateState(satrec, timestampUnixMs + halfSecond) : null;
  let radialVelocityKmPerSecond: number | null = null;
  if (before && after) {
    const beforeRange = ecfToLookAngles(observer, before.ecf).rangeSat;
    const afterRange = ecfToLookAngles(observer, after.ecf).rangeSat;
    radialVelocityKmPerSecond = afterRange - beforeRange;
  }
  return {
    azimuthDegrees: normalizeAzimuthDegrees(radiansToDegrees(look.azimuth)),
    dopplerShiftHz: station.downlinkFrequencyHz === null || radialVelocityKmPerSecond === null
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
  return refineCrossing((time) => lookSample(satrec, station, time, false)?.elevationDegrees ?? null, threshold, lowerUnixMs, upperUnixMs, rising);
}

function maximizeElevation(
  satrec: Satrec,
  station: GroundStationInput,
  startUnixMs: number,
  endUnixMs: number,
): number {
  return minimizeBounded((time) => {
    const sample = lookSample(satrec, station, time, false);
    return sample ? -sample.elevationDegrees : null;
  }, startUnixMs, endUnixMs);
}

function refineClosestApproach(
  primary: Satrec,
  secondary: Satrec,
  startUnixMs: number,
  endUnixMs: number,
) {
  let tcaUnixMs: number;
  try {
    tcaUnixMs = minimizeBounded((time) => separationAt(primary, secondary, time), startUnixMs, endUnixMs);
  } catch { return null; }
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
  if (!propagated?.position || !propagated.velocity
    || !Number.isFinite(vectorMagnitude(propagated.position))
    || !Number.isFinite(vectorMagnitude(propagated.velocity))) return null;
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
  if (!metadata || !activeRequest) throw new AnalysisError("not-ready", "Analysis metadata is unavailable");
  const context = createRunContext(activeRequest, metadata, activeRequest.type === "constellation" ? [] : relatedRecords);
  if (activeRequest.type === "constellation") context.objectIds = relatedRecords.map((record) => record.id);
  return {
    context,
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
  const value = parseUtcEpoch(record.epoch);
  if (!Number.isFinite(value)) throw new AnalysisError("invalid-epoch", "Invalid source epoch");
  return value;
}

function finiteTime(value: number, code: string): number {
  if (!Number.isFinite(value) || value < 0) throw new AnalysisError(code, "Timestamp is invalid");
  return value;
}

function ensureReady(): void {
  if (!metadata || records.length === 0) {
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
