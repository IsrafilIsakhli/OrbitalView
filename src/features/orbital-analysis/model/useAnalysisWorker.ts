import { useCallback, useEffect, useRef, useState } from "react";

import type { SatelliteCatalog } from "@/features/satellites/domain/satellite";

import type {
  AnalysisEnvelope,
  ConstellationFilter,
  ConstellationResult,
  DynamicsResult,
  GroundStationAccessResult,
  GroundStationInput,
  ProximityResult,
} from "../domain/analysis";
import { toAnalysisSatelliteInput } from "../domain/analysis";
import type { AnalysisWorkerRequest, AnalysisWorkerResponse } from "../worker/messages";

interface WorkerResults {
  constellation: AnalysisEnvelope<ConstellationResult> | null;
  dynamics: AnalysisEnvelope<DynamicsResult> | null;
  groundStation: AnalysisEnvelope<GroundStationAccessResult> | null;
  proximity: AnalysisEnvelope<ProximityResult> | null;
}

const emptyResults: WorkerResults = {
  constellation: null,
  dynamics: null,
  groundStation: null,
  proximity: null,
};

export function useAnalysisWorker(catalog: SatelliteCatalog | undefined, active: boolean) {
  const workerRef = useRef<Worker | null>(null);
  const runningRequestRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<WorkerResults>(emptyResults);
  const [runningRequestId, setRunningRequestId] = useState<string | null>(null);

  const finishRequest = useCallback(() => {
    runningRequestRef.current = null;
    setRunningRequestId(null);
    setProgress(0);
    setStage(null);
  }, []);

  useEffect(() => {
    if (!active || !catalog) return;
    const worker = new Worker(
      new URL("../worker/analysis.worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<AnalysisWorkerResponse>) => {
      const message = event.data;
      if (message.type === "ready") {
        setError(null);
        setReady(true);
        setResults(emptyResults);
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
        [message.kind]: message.analysis,
      }));
      setError(null);
      finishRequest();
    };
    worker.onerror = () => {
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
  }, [active, catalog, finishRequest]);

  const cancel = useCallback(() => {
    const requestId = runningRequestRef.current;
    if (!requestId) return;
    workerRef.current?.postMessage({ requestId, type: "cancel" } satisfies AnalysisWorkerRequest);
  }, []);

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

  const runConstellation = useCallback((filter: ConstellationFilter) =>
    post({ filter, requestId: createRequestId(), type: "constellation" }), [post]);

  const runProximity = useCallback((input: {
    endUnixMs: number;
    primaryId: string;
    startUnixMs: number;
    thresholdKm: number;
  }) => post({ ...input, requestId: createRequestId(), type: "proximity" }), [post]);

  return {
    cancel,
    error,
    progress,
    ready,
    results: ready ? results : emptyResults,
    runConstellation,
    runDynamics,
    runGroundStation,
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
