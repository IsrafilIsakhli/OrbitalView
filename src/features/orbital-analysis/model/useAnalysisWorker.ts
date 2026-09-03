import { useCallback, useEffect, useRef, useState } from "react";

import { registerUpdatePause } from "@/features/updater/domain/updateBarrier";

import type { SatelliteCatalog } from "@/features/satellites/domain/satellite";

import type {
  AnalysisEnvelope,
  ConstellationFilter,
  ConstellationResult,
  CoverageResult,
  CoverageTarget,
  DynamicsResult,
  GroundStationAccessResult,
  GroundStationInput,
  GroundNetworkResult,
  ProximityResult,
} from "../domain/analysis";
import { toAnalysisSatelliteInput } from "../domain/analysis";
import type { AnalysisWorkerRequest, AnalysisWorkerResponse } from "../worker/messages";
import type { AnalysisTab } from "../domain/analysis";

interface WorkerResults {
  constellation: AnalysisEnvelope<ConstellationResult> | null;
  coverage: AnalysisEnvelope<CoverageResult> | null;
  dynamics: AnalysisEnvelope<DynamicsResult> | null;
  groundStation: AnalysisEnvelope<GroundStationAccessResult> | null;
  groundNetwork: AnalysisEnvelope<GroundNetworkResult> | null;
  proximity: AnalysisEnvelope<ProximityResult> | null;
}

const emptyResults: WorkerResults = {
  constellation: null,
  coverage: null,
  dynamics: null,
  groundStation: null,
  groundNetwork: null,
  proximity: null,
};

export function useAnalysisWorker(catalog: SatelliteCatalog | undefined, active: boolean) {
  const [updatePaused, setUpdatePaused] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const runningRequestRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<WorkerResults>(emptyResults);
  const [runningRequestId, setRunningRequestId] = useState<string | null>(null);

  useEffect(() => registerUpdatePause(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    runningRequestRef.current = null;
    setRunningRequestId(null);
    setReady(false);
    setUpdatePaused(true);
    return () => setUpdatePaused(false);
  }), []);

  const finishRequest = useCallback(() => {
    runningRequestRef.current = null;
    setRunningRequestId(null);
    setProgress(0);
    setStage(null);
  }, []);

  useEffect(() => {
    if (!active || !catalog || updatePaused) return;
    const worker = new Worker(
      new URL("../worker/analysis.worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<AnalysisWorkerResponse>) => {
      if (workerRef.current !== worker) return;
      const message = event.data;
      if (message.type === "ready") {
        setError(null);
        setReady(true);
        return;
      }
      if (message.type === "progress") {
        if (runningRequestRef.current !== message.requestId) return;
        setProgress(message.progress);
        setStage(message.stage);
        return;
      }
      if (message.type === "cancelled") {
        if (runningRequestRef.current === message.requestId) finishRequest();
        return;
      }
      if (message.type === "error") {
        if (message.requestId === null || runningRequestRef.current === message.requestId) {
          setError(message.code);
          finishRequest();
        }
        return;
      }
      if (runningRequestRef.current !== message.requestId) return;
      setResults((current) => ({
        ...current,
        ...(message.kind === "groundNetwork" ? { groundStation: null } : {}),
        ...(message.kind === "groundStation" ? { groundNetwork: null } : {}),
        [message.kind]: message.analysis,
      }));
      setError(null);
      finishRequest();
    };
    worker.onerror = () => {
      if (workerRef.current !== worker) return;
      setError("worker-failed");
      finishRequest();
    };
    worker.postMessage({
      metadata: {
        fetchedAtUnixMs: Date.parse(catalog.fetchedAt),
        source: catalog.source,
        stale: catalog.stale,
      },
      records: catalog.satellites.map(toAnalysisSatelliteInput),
      type: "initialize",
    } satisfies AnalysisWorkerRequest);
    return () => {
      worker.postMessage({ type: "dispose" } satisfies AnalysisWorkerRequest);
      worker.terminate();
      workerRef.current = null;
      runningRequestRef.current = null;
      setReady(false);
      setRunningRequestId(null);
    };
  }, [active, catalog, finishRequest, updatePaused]);

  const cancel = useCallback(() => {
    const requestId = runningRequestRef.current;
    if (!requestId) return;
    workerRef.current?.postMessage({ requestId, type: "cancel" } satisfies AnalysisWorkerRequest);
    // Reject any result already in flight, even before the worker acknowledges cancellation.
    finishRequest();
  }, [finishRequest]);

  const invalidate = useCallback((tab?: AnalysisTab) => {
    const requestId = runningRequestRef.current;
    if (requestId) workerRef.current?.postMessage({ requestId, type: "cancel" } satisfies AnalysisWorkerRequest);
    finishRequest();
    setResults((current) => !tab ? emptyResults : ({ ...current,
      ...(tab === "groundStation" ? { groundStation: null, groundNetwork: null } : { [tab]: null }),
    }));
  }, [finishRequest]);

  const post = useCallback((request: AnalysisWorkerRequest & { requestId: string }) => {
    if (!workerRef.current || !ready) return null;
    const previous = runningRequestRef.current;
    if (previous) {
      workerRef.current.postMessage({ requestId: previous, type: "cancel" } satisfies AnalysisWorkerRequest);
    }
    runningRequestRef.current = request.requestId;
    setRunningRequestId(request.requestId);
    setProgress(0);
    setStage(null);
    setError(null);
    workerRef.current.postMessage(request);
    return request.requestId;
  }, [ready]);

  const runDynamics = useCallback((input: {
    endUnixMs: number;
    sampleCount: number;
    satelliteId: string;
    startUnixMs: number;
  }) => post({ ...input, requestId: createRequestId(), type: "dynamics" }), [post]);

  const runGroundStation = useCallback((input: {
    endUnixMs: number;
    satelliteId: string;
    startUnixMs: number;
    station: GroundStationInput;
  }) => post({ ...input, requestId: createRequestId(), type: "ground-station" }), [post]);

  const runGroundNetwork = useCallback((input: {
    endUnixMs: number;
    satelliteId: string;
    startUnixMs: number;
    stations: GroundStationInput[];
  }) => post({ ...input, requestId: createRequestId(), type: "ground-network" }), [post]);

  const runConstellation = useCallback((filter: ConstellationFilter) =>
    post({ filter, requestId: createRequestId(), type: "constellation" }), [post]);

  const runProximity = useCallback((input: {
    endUnixMs: number;
    primaryId: string;
    startUnixMs: number;
    thresholdKm: number;
  }) => post({ ...input, requestId: createRequestId(), type: "proximity" }), [post]);

  const runCoverage = useCallback((input: {
    endUnixMs: number;
    satelliteIds: string[];
    startUnixMs: number;
    target: CoverageTarget;
  }) => post({ ...input, requestId: createRequestId(), type: "coverage" }), [post]);

  return {
    cancel,
    error,
    invalidate,
    progress,
    ready,
    results,
    runConstellation,
    runCoverage,
    runDynamics,
    runGroundStation,
    runGroundNetwork,
    running: runningRequestId !== null,
    runningRequestId,
    runProximity,
    stage,
  };
}

function createRequestId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `analysis:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}
