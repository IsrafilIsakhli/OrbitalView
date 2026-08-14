import type { OMMJsonObject } from "satellite.js";

export type OrbitWorkerRequest =
  | { type: "initialize"; records: OMMJsonObject[] }
  | { type: "select"; index: number | null; sampleCount?: number }
  | { type: "preview"; index: number | null }
  | { type: "showcase"; indices: number[]; sampleCount?: number }
  | { type: "set-active"; active: boolean }
  | { type: "dispose" };

export type OrbitWorkerResponse =
  | { type: "ready"; count: number }
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
  | { type: "error"; message: string };
