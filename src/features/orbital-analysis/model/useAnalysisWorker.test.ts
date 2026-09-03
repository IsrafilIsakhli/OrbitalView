import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SatelliteCatalog } from "@/features/satellites/domain/satellite";
import type { AnalysisEnvelope, DynamicsResult } from "../domain/analysis";
import type { AnalysisWorkerRequest, AnalysisWorkerResponse } from "../worker/messages";
import { createRunContext } from "../domain/runContext";
import { useAnalysisWorker } from "./useAnalysisWorker";

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<AnalysisWorkerResponse>) => void) | null = null;
  onerror: (() => void) | null = null;
  messages: AnalysisWorkerRequest[] = [];
  terminate = vi.fn();
  constructor() { FakeWorker.instances.push(this); }
  postMessage(message: AnalysisWorkerRequest) { this.messages.push(message); }
  emit(message: AnalysisWorkerResponse) { this.onmessage?.({ data: message } as MessageEvent<AnalysisWorkerResponse>); }
}
const catalog: SatelliteCatalog = { satellites: [], catalogObjectCount: 0, rejectedObjectCount: 0,
  fetchedAt: "2026-09-04T00:00:00Z", expiresAt: "2026-09-04T01:00:00Z", source: "CelesTrak", stale: false };
const input = { satelliteId: "norad:25544", startUnixMs: 1000, endUnixMs: 2000, sampleCount: 10 };
function result(requestId: string): AnalysisEnvelope<DynamicsResult> {
  return { requestId, catalogFetchedAtUnixMs: Date.parse(catalog.fetchedAt), generatedAtUnixMs: 2000,
    model: "SGP4", frame: "SGP4-ECI", stale: false, warnings: [], objectEpochs: { "norad:25544": 1000 },
    context: createRunContext({ ...input, type: "dynamics", requestId }, { fetchedAtUnixMs: Date.parse(catalog.fetchedAt), source: "CelesTrak", stale: false }),
    result: { satelliteId: input.satelliteId, samples: [], invalidSampleCount: 0, derivedPerigeeKm: 400, derivedApogeeKm: 420 } };
}
describe("analysis worker lifecycle", () => {
  beforeEach(() => { FakeWorker.instances = []; vi.stubGlobal("Worker", FakeWorker); });
  afterEach(() => vi.unstubAllGlobals());

  it("replaces the running request and rejects its late output", () => {
    const hook = renderHook(() => useAnalysisWorker(catalog, true));
    const worker = FakeWorker.instances[0]!; act(() => worker.emit({ type: "ready", count: 0 }));
    let first = "", second = "";
    act(() => { first = hook.result.current.runDynamics(input)!; });
    act(() => { second = hook.result.current.runDynamics({ ...input, satelliteId: "norad:12345" })!; });
    expect(worker.messages).toContainEqual({ type: "cancel", requestId: first });
    act(() => worker.emit({ type: "result", kind: "dynamics", requestId: first, analysis: result(first) }));
    expect(hook.result.current.results.dynamics).toBeNull();
    expect(hook.result.current.runningRequestId).toBe(second);
  });
  it("cancellation immediately rejects already-posted results", () => {
    const hook = renderHook(() => useAnalysisWorker(catalog, true)); const worker = FakeWorker.instances[0]!;
    act(() => worker.emit({ type: "ready", count: 0 })); let id = "";
    act(() => { id = hook.result.current.runDynamics(input)!; });
    act(() => hook.result.current.cancel());
    act(() => worker.emit({ type: "result", kind: "dynamics", requestId: id, analysis: result(id) }));
    expect(hook.result.current.running).toBe(false); expect(hook.result.current.results.dynamics).toBeNull();
  });
  it("retains completed provenance through a catalog refresh, and terminates on exit", () => {
    const hook = renderHook(({ source, active }) => useAnalysisWorker(source, active), { initialProps: { source: catalog, active: true } });
    const worker = FakeWorker.instances[0]!; act(() => worker.emit({ type: "ready", count: 0 })); let id = "";
    act(() => { id = hook.result.current.runDynamics(input)!; }); const completed = result(id);
    act(() => worker.emit({ type: "result", kind: "dynamics", requestId: id, analysis: completed }));
    hook.rerender({ source: { ...catalog, fetchedAt: "2026-09-04T02:00:00Z" }, active: true });
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(hook.result.current.results.dynamics).toBe(completed);
    act(() => worker.emit({ type: "ready", count: 999 })); expect(hook.result.current.ready).toBe(false);
    hook.rerender({ source: catalog, active: false }); expect(FakeWorker.instances[1]!.terminate).toHaveBeenCalledOnce();
    expect(FakeWorker.instances).toHaveLength(2);
  });
  it("clears completed output when parameters or selection invalidate the run", () => {
    const hook = renderHook(() => useAnalysisWorker(catalog, true)); const worker = FakeWorker.instances[0]!;
    act(() => worker.emit({ type: "ready", count: 0 })); let id = "";
    act(() => { id = hook.result.current.runDynamics(input)!; });
    act(() => worker.emit({ type: "result", kind: "dynamics", requestId: id, analysis: result(id) }));
    act(() => hook.result.current.invalidate("dynamics")); expect(hook.result.current.results.dynamics).toBeNull();
  });
});
