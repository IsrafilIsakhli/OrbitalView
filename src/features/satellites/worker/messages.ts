import type { OMMJsonObject } from "satellite.js";

export interface OrbitWorkerTimeLensState {
  playing: boolean;
  rate: number;
  timestampUnixMs: number;
}

export type OrbitWorkerRequest =
  | { type: "initialize"; records: OMMJsonObject[] }
  | { type: "select"; index: number | null; sampleCount?: number }
  | { type: "preview"; index: number | null }
  | { type: "showcase"; indices: number[]; sampleCount?: number }
  | { type: "set-active"; active: boolean }
  | { type: "set-time-lens"; state: OrbitWorkerTimeLensState | null; revision?: number }
  | { type: "dispose" };

export type OrbitWorkerResponse = { revision?: number } & (
  | { type: "ready"; count: number }
  | {
      type: "selected-frame";
      index: number;
      positionMeters: [number, number, number] | null;
      altitudeKm: number;
      velocityKmPerSecond: number;
      timestampUnixMs: number;
    }
  | {
      type: "frame";
      errors: Int8Array;
      positionsMeters: Float64Array;
      telemetry: Float64Array;
      timestampUnixMs: number;
      validCount: number;
    }
  | {
      type: "orbit";
      index: number;
      groundTrackPositionsMeters: Float64Array;
      orbitPositionsMeters: Float64Array;
      referenceTimestampUnixMs: number;
    }
  | {
      type: "preview-orbit";
      index: number;
      orbitPositionsMeters: Float64Array;
      referenceTimestampUnixMs: number;
    }
  | {
      type: "showcase-orbits";
      orbits: Array<{
        index: number;
        orbitPositionsMeters: Float64Array;
        referenceTimestampUnixMs: number;
      }>;
    }
  | { type: "error"; message: string });
