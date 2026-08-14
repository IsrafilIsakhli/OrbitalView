import type {
  AnalysisCatalogMetadata,
  AnalysisEnvelope,
  AnalysisSatelliteInput,
  ConstellationFilter,
  ConstellationResult,
  DynamicsResult,
  GroundStationAccessResult,
  GroundStationInput,
  ProximityResult,
} from "../domain/analysis";

export type AnalysisWorkerRequest =
  | {
      type: "initialize";
      metadata: AnalysisCatalogMetadata;
      records: AnalysisSatelliteInput[];
    }
  | {
      type: "dynamics";
      requestId: string;
      satelliteId: string;
      startUnixMs: number;
      endUnixMs: number;
      sampleCount: number;
    }
  | {
      type: "ground-station";
      requestId: string;
      satelliteId: string;
      startUnixMs: number;
      endUnixMs: number;
      station: GroundStationInput;
    }
  | {
      type: "constellation";
      requestId: string;
      filter: ConstellationFilter;
    }
  | {
      type: "proximity";
      requestId: string;
      primaryId: string;
      startUnixMs: number;
      endUnixMs: number;
      thresholdKm: number;
    }
  | { type: "cancel"; requestId: string }
  | { type: "dispose" };

export type AnalysisWorkerResult =
  | AnalysisEnvelope<DynamicsResult>
  | AnalysisEnvelope<GroundStationAccessResult>
  | AnalysisEnvelope<ConstellationResult>
  | AnalysisEnvelope<ProximityResult>;

export type AnalysisWorkerResponse =
  | { type: "ready"; count: number }
  | { type: "progress"; requestId: string; progress: number; stage: string }
  | {
      type: "result";
      requestId: string;
      kind: "dynamics" | "groundStation" | "constellation" | "proximity";
      analysis: AnalysisWorkerResult;
    }
  | { type: "cancelled"; requestId: string }
  | { type: "error"; requestId: string | null; code: string; message: string };
