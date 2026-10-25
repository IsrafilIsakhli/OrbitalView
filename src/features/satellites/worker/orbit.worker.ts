import { BulkPropagator } from "@satellite/bulk";
import { EcfPositionCalculator } from "@satellite/ecf-calculator";
import { EciBaseCalculator } from "@satellite/eci-calculator";
import { GeodeticPositionCalculator } from "@satellite/geodetic-calculator";
import { GmstCalculator } from "@satellite/gmst-calculator";
import { json2satrec } from "@satellite/io";
import { gstime, propagate } from "@satellite/propagation";
import { eciToEcf, eciToGeodetic } from "@satellite/transforms";
import { createSingleThreadRuntimeFromModule } from "@satellite/runtime";
import createWasmModule from "@satellite/wasm-module";

import type {
  OrbitWorkerRequest,
  OrbitWorkerResponse,
  OrbitWorkerTimeLensState,
} from "./messages";
import {
  createOrbitCoordinateFrames,
  type EciOrbitSample,
} from "./orbitCoordinateFrames";
import { resolveForecastTimestamp } from "./forecastClock";

interface WorkerScope {
  onmessage: ((event: MessageEvent<OrbitWorkerRequest>) => void) | null;
  postMessage: (message: OrbitWorkerResponse, transfer?: Transferable[]) => void;
}

const scope = self as unknown as WorkerScope;
const FRAME_INTERVAL_MS = 1_000;
const ORBIT_SAMPLE_COUNT = 181;
const PREVIEW_SAMPLE_COUNT = 61;
const PREVIEW_ORBIT_FRACTION = 0.34;
const MINIMUM_ORBIT_DURATION_MS = 80 * 60_000;
const MAXIMUM_ORBIT_DURATION_MS = 26 * 60 * 60_000;

type PropagationRuntime = Awaited<ReturnType<typeof createPropagationRuntime>>;

let runtime: PropagationRuntime | null = null;
let frameTimer: number | null = null;
let selectedTimer: number | null = null;
let lastSelectedTimestamp = Number.NEGATIVE_INFINITY;
let propagationRevision = 0;
let lastOrbitAt = 0;
let selectedIndex: number | null = null;
let selectedOrbitSampleCount = ORBIT_SAMPLE_COUNT;
let active = true;
let timeLensAnchorRealMs = 0;
let timeLensState: OrbitWorkerTimeLensState | null = null;
let pendingShowcase: Extract<OrbitWorkerRequest, { type: "showcase" }> | null = null;

scope.onmessage = (event) => {
  void handleRequest(event.data);
};

async function handleRequest(request: OrbitWorkerRequest): Promise<void> {
  try {
    if (request.type === "initialize") {
      disposeRuntime();
      runtime = await createPropagationRuntime(request.records);
      publish({ type: "ready", count: request.records.length });
      if (active) scheduleFrame();
      return;
    }
    if (request.type === "set-active") {
      if (!request.active && active && timeLensState?.playing) {
        timeLensState = {
          ...timeLensState,
          timestampUnixMs: currentPropagationTime(),
        };
        timeLensAnchorRealMs = Date.now();
      } else if (request.active && !active && timeLensState?.playing) {
        timeLensAnchorRealMs = Date.now();
      }
      active = request.active;
      if (!active) cancelSelectedFrame();
      else scheduleSelectedFrame();
      if (!active && frameTimer !== null) {
        self.clearTimeout(frameTimer);
        frameTimer = null;
      } else if (active && runtime && frameTimer === null) {
        scheduleFrame();
      }
      return;
    }
    if (request.type === "set-time-lens") {
      propagationRevision = request.revision ?? propagationRevision + 1;
      cancelSelectedFrame();
      lastSelectedTimestamp = Number.NEGATIVE_INFINITY;
      lastOrbitAt = 0;
      timeLensState = normalizeTimeLensState(request.state);
      timeLensAnchorRealMs = Date.now();
      if (frameTimer !== null) {
        self.clearTimeout(frameTimer);
        frameTimer = null;
      }
      if (active && runtime && selectedIndex !== null) {
        calculateOrbit(runtime, selectedIndex, selectedOrbitSampleCount);
        lastOrbitAt = Date.now();
      }
      if (runtime && active) scheduleFrame();
      scheduleSelectedFrame();
      return;
    }
    if (request.type === "select") {
      cancelSelectedFrame();
      lastSelectedTimestamp = Number.NEGATIVE_INFINITY;
      selectedIndex = request.index;
      selectedOrbitSampleCount = normalizeSampleCount(request.sampleCount);
      lastOrbitAt = 0;
      if (active && runtime && request.index !== null) {
        calculateOrbit(runtime, request.index, selectedOrbitSampleCount);
        lastOrbitAt = Date.now();
      }
      scheduleSelectedFrame();
      return;
    }
    if (request.type === "preview") {
      if (active && runtime && request.index !== null) {
        calculatePreviewOrbit(runtime, request.index);
      }
      return;
    }
    if (request.type === "showcase") {
      pendingShowcase = request;
      if (active && runtime) {
        calculateShowcaseOrbits(
          runtime,
          request.indices,
          normalizeSampleCount(request.sampleCount),
        );
        pendingShowcase = null;
      }
      return;
    }
    disposeRuntime();
    close();
  } catch (error) {
    publish({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function createPropagationRuntime(records: Parameters<typeof json2satrec>[0][]) {
  const wasmRuntime = await createSingleThreadRuntimeFromModule(
    await createWasmModule(),
  );
  const calculators = [
    new EciBaseCalculator(),
    new GmstCalculator(),
    new EcfPositionCalculator(),
    new GeodeticPositionCalculator(),
  ] as const;
  const propagator = new BulkPropagator({
    calculators,
    datesCount: 1,
    runtime: wasmRuntime,
    satRecsCount: records.length,
  });
  const satRecs = records.map((record) => json2satrec(record));
  propagator.setSatRecs(satRecs);
  return { propagator, satRecs, wasmRuntime };
}

function scheduleFrame(): void {
  // Yield to pending pause/time/selection messages instead of propagating once per resume.
  if (frameTimer === null) frameTimer = self.setTimeout(runFrame, 16);
}

function cancelSelectedFrame(): void {
  if (selectedTimer !== null) self.clearTimeout(selectedTimer);
  selectedTimer = null;
}

function scheduleSelectedFrame(): void {
  if (active && runtime && selectedIndex !== null && selectedTimer === null) {
    selectedTimer = self.setTimeout(runSelectedFrame, 200);
  }
}

/** Track one object at 5 Hz without propagating/re-uploading the whole catalog. */
function runSelectedFrame(): void {
  selectedTimer = null;
  const satrec = selectedIndex === null ? null : runtime?.satRecs[selectedIndex];
  if (!active || !satrec || selectedIndex === null) return;
  const timestampUnixMs = currentPropagationTime();
  if (timestampUnixMs !== lastSelectedTimestamp) {
    lastSelectedTimestamp = timestampUnixMs;
    const date = new Date(timestampUnixMs);
    const state = propagate(satrec, date, { communityDecayCheckEnabled: true });
    const gmst = gstime(date);
    const fixed = state ? eciToEcf(state.position, gmst) : null;
    publish({
      type: "selected-frame", index: selectedIndex, timestampUnixMs,
      positionMeters: fixed ? [fixed.x * 1_000, fixed.y * 1_000, fixed.z * 1_000] : null,
      altitudeKm: state ? eciToGeodetic(state.position, gmst).height : Number.NaN,
      velocityKmPerSecond: state ? Math.hypot(state.velocity.x, state.velocity.y, state.velocity.z) : Number.NaN,
    });
  }
  scheduleSelectedFrame();
}

function runFrame(): void {
  frameTimer = null;
  if (!runtime || !active) {
    return;
  }
  if (pendingShowcase) {
    calculateShowcaseOrbits(runtime, pendingShowcase.indices, normalizeSampleCount(pendingShowcase.sampleCount));
    pendingShowcase = null;
  }
  const timestampUnixMs = currentPropagationTime();
  runtime.propagator.setDates([new Date(timestampUnixMs)]);
  runtime.propagator.run({ eci: { communityDecayCheckEnabled: true } });
  const raw = runtime.propagator.getRawOutput();
  const positionsMeters = Float64Array.from(
    raw.ecfPosition,
    (coordinate) => coordinate * 1_000,
  );
  const errors = Int8Array.from(raw.eci.error);
  const telemetry = new Float64Array(errors.length * 2);
  let validCount = 0;

  for (let index = 0; index < errors.length; index += 1) {
    const valid = errors[index] === 0;
    if (valid) {
      validCount += 1;
    }
    const vectorOffset = index * 3;
    const telemetryOffset = index * 2;
    const velocityX = raw.eci.velocity[vectorOffset] ?? 0;
    const velocityY = raw.eci.velocity[vectorOffset + 1] ?? 0;
    const velocityZ = raw.eci.velocity[vectorOffset + 2] ?? 0;
    telemetry[telemetryOffset] =
      raw.geodeticPosition[vectorOffset + 2] ?? Number.NaN;
    telemetry[telemetryOffset + 1] = Math.hypot(
      velocityX,
      velocityY,
      velocityZ,
    );
  }

  publish(
    {
      errors,
      positionsMeters,
      telemetry,
      timestampUnixMs,
      type: "frame",
      validCount,
    },
    [errors.buffer, positionsMeters.buffer, telemetry.buffer],
  );

  if (selectedIndex !== null && Date.now() - lastOrbitAt >= 30_000) {
    calculateOrbit(runtime, selectedIndex, selectedOrbitSampleCount);
    lastOrbitAt = Date.now();
  }
  if (active) frameTimer = self.setTimeout(runFrame, FRAME_INTERVAL_MS);
}

function calculateOrbit(
  current: PropagationRuntime,
  index: number,
  sampleCount: number,
): void {
  const geometry = propagateOrbit(current, index, sampleCount);
  if (!geometry) return;
  publish(
    {
      groundTrackPositionsMeters: geometry.groundTrackPositionsMeters,
      index,
      orbitPositionsMeters: geometry.orbitPositionsMeters,
      referenceTimestampUnixMs: geometry.referenceTimestampUnixMs,
      type: "orbit",
    },
    [
      geometry.groundTrackPositionsMeters.buffer,
      geometry.orbitPositionsMeters.buffer,
    ],
  );
}

function calculateShowcaseOrbits(
  current: PropagationRuntime,
  indices: number[],
  sampleCount: number,
): void {
  const orbits = indices.slice(0, 16).flatMap((index) => {
    const geometry = propagateOrbit(current, index, sampleCount);
    return geometry
      ? [{
          index,
          orbitPositionsMeters: geometry.orbitPositionsMeters,
          referenceTimestampUnixMs: geometry.referenceTimestampUnixMs,
        }]
      : [];
  });
  publish(
    { orbits, type: "showcase-orbits" },
    orbits.map((orbit) => orbit.orbitPositionsMeters.buffer),
  );
}

function calculatePreviewOrbit(current: PropagationRuntime, index: number): void {
  const geometry = propagateOrbit(
    current,
    index,
    PREVIEW_SAMPLE_COUNT,
    PREVIEW_ORBIT_FRACTION,
  );
  if (!geometry) return;
  publish(
    {
      index,
      orbitPositionsMeters: geometry.orbitPositionsMeters,
      referenceTimestampUnixMs: geometry.referenceTimestampUnixMs,
      type: "preview-orbit",
    },
    [geometry.orbitPositionsMeters.buffer],
  );
}

function propagateOrbit(
  current: PropagationRuntime,
  index: number,
  sampleCount = ORBIT_SAMPLE_COUNT,
  orbitFraction = 1,
): ReturnType<typeof createOrbitCoordinateFrames> | null {
  const center = currentPropagationTime();
  const half = Math.floor(sampleCount / 2);
  const samples: EciOrbitSample[] = [];
  const satrec = current.satRecs[index];
  if (!satrec) {
    return null;
  }
  const calculatedPeriodMs = Number.isFinite(satrec.no) && satrec.no > 0
    ? ((Math.PI * 2) / satrec.no) * 60_000
    : 90 * 60_000;
  const orbitDurationMs = Math.min(
    MAXIMUM_ORBIT_DURATION_MS,
    Math.max(MINIMUM_ORBIT_DURATION_MS, calculatedPeriodMs),
  );
  const orbitStepMs = (orbitDurationMs * orbitFraction) / (sampleCount - 1);
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const date = new Date(center + (sample - half) * orbitStepMs);
    const propagated = propagate(satrec, date, {
      communityDecayCheckEnabled: true,
    });
    samples.push({
      positionKilometers: propagated?.position ?? null,
      timestampUnixMs: date.getTime(),
    });
  }
  return createOrbitCoordinateFrames(samples, center);
}

function normalizeSampleCount(sampleCount: number | undefined): number {
  if (!Number.isFinite(sampleCount)) return ORBIT_SAMPLE_COUNT;
  const rounded = Math.round(sampleCount ?? ORBIT_SAMPLE_COUNT);
  return Math.min(ORBIT_SAMPLE_COUNT, Math.max(61, rounded));
}

function normalizeTimeLensState(
  state: OrbitWorkerTimeLensState | null,
): OrbitWorkerTimeLensState | null {
  if (!state || !Number.isFinite(state.timestampUnixMs)) return null;
  return {
    playing: Boolean(state.playing),
    rate: Number.isFinite(state.rate) ? Math.max(1, state.rate) : 60,
    timestampUnixMs: state.timestampUnixMs,
  };
}

function currentPropagationTime(): number {
  return resolveForecastTimestamp(
    timeLensState,
    timeLensAnchorRealMs,
    Date.now(),
  );
}

function disposeRuntime(): void {
  cancelSelectedFrame();
  pendingShowcase = null;
  if (frameTimer !== null) {
    self.clearTimeout(frameTimer);
    frameTimer = null;
  }
  runtime?.propagator.dispose();
  runtime?.wasmRuntime.dispose();
  runtime = null;
}

function publish(message: OrbitWorkerResponse, transfer?: Transferable[]): void {
  scope.postMessage({ ...message, revision: propagationRevision }, transfer);
}
