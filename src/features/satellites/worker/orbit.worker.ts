import { BulkPropagator } from "@satellite/bulk";
import { EcfPositionCalculator } from "@satellite/ecf-calculator";
import { EciBaseCalculator } from "@satellite/eci-calculator";
import { GeodeticPositionCalculator } from "@satellite/geodetic-calculator";
import { GmstCalculator } from "@satellite/gmst-calculator";
import { json2satrec } from "@satellite/io";
import { propagate } from "@satellite/propagation";
import { createSingleThreadRuntimeFromModule } from "@satellite/runtime";
import createWasmModule from "@satellite/wasm-module";

import type { OrbitWorkerRequest, OrbitWorkerResponse } from "./messages";
import {
  createOrbitCoordinateFrames,
  type EciOrbitSample,
} from "./orbitCoordinateFrames";

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
let lastOrbitAt = 0;
let selectedIndex: number | null = null;
let selectedOrbitSampleCount = ORBIT_SAMPLE_COUNT;
let active = true;

scope.onmessage = (event) => {
  void handleRequest(event.data);
};

async function handleRequest(request: OrbitWorkerRequest): Promise<void> {
  try {
    if (request.type === "initialize") {
      disposeRuntime();
      runtime = await createPropagationRuntime(request.records);
      scope.postMessage({ type: "ready", count: request.records.length });
      if (active) runFrame();
      return;
    }
    if (request.type === "set-active") {
      active = request.active;
      if (!active && frameTimer !== null) {
        self.clearTimeout(frameTimer);
        frameTimer = null;
      } else if (active && runtime && frameTimer === null) {
        runFrame();
      }
      return;
    }
    if (request.type === "select") {
      selectedIndex = request.index;
      selectedOrbitSampleCount = normalizeSampleCount(request.sampleCount);
      lastOrbitAt = 0;
      if (runtime && request.index !== null) {
        calculateOrbit(runtime, request.index, selectedOrbitSampleCount);
        lastOrbitAt = Date.now();
      }
      return;
    }
    if (request.type === "preview") {
      if (runtime && request.index !== null) {
        calculatePreviewOrbit(runtime, request.index);
      }
      return;
    }
    if (request.type === "showcase") {
      if (runtime) {
        calculateShowcaseOrbits(
          runtime,
          request.indices,
          normalizeSampleCount(request.sampleCount),
        );
      }
      return;
    }
    disposeRuntime();
    close();
  } catch (error) {
    scope.postMessage({
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

function runFrame(): void {
  frameTimer = null;
  if (!runtime || !active) {
    return;
  }
  const timestampUnixMs = Date.now();
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

  scope.postMessage(
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

  if (selectedIndex !== null && timestampUnixMs - lastOrbitAt >= 30_000) {
    calculateOrbit(runtime, selectedIndex, selectedOrbitSampleCount);
    lastOrbitAt = timestampUnixMs;
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
  scope.postMessage(
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
  scope.postMessage(
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
  scope.postMessage(
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
  const center = Date.now();
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

function disposeRuntime(): void {
  if (frameTimer !== null) {
    self.clearTimeout(frameTimer);
    frameTimer = null;
  }
  runtime?.propagator.dispose();
  runtime?.wasmRuntime.dispose();
  runtime = null;
}
