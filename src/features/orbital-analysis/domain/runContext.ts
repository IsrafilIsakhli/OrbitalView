import type { AnalysisCatalogMetadata, AnalysisEnvelope, AnalysisRunContext, AnalysisSatelliteInput } from "./analysis";
import type { AnalysisWorkerRequest } from "../worker/messages";

export type CalculationRequest = Extract<AnalysisWorkerRequest, { requestId: string }> extends infer R
  ? Exclude<R, { type: "cancel" }> : never;

export function createRunContext(request: CalculationRequest, catalog: AnalysisCatalogMetadata, records: readonly AnalysisSatelliteInput[] = []): AnalysisRunContext {
  const parameters = { ...request } as Record<string, unknown>;
  delete parameters.requestId;
  delete parameters.type;
  const objectIds = "satelliteIds" in request ? [...request.satelliteIds]
    : "satelliteId" in request ? [request.satelliteId]
      : "primaryId" in request ? [request.primaryId] : [];
  return {
    kind: request.type, objectIds, parameters,
    sourceObjects: records.map((record) => record.sourceRecord),
    catalogVersion: `${catalog.source}:${catalog.fetchedAtUnixMs}`,
    catalogSource: catalog.source,
    startUnixMs: "startUnixMs" in request ? request.startUnixMs : null,
    endUnixMs: "endUnixMs" in request ? request.endUnixMs : null,
  };
}

export function resultMatchesSelection(envelope: AnalysisEnvelope<unknown> | null, satelliteId: string): boolean {
  if (!envelope) return false;
  return envelope.context.kind === "constellation" || envelope.context.kind === "coverage"
    || envelope.context.objectIds[0] === satelliteId;
}

export function analysisExportName(envelope: AnalysisEnvelope<unknown>): string {
  const objectLabel = envelope.context.objectIds.length === 1 ? envelope.context.objectIds[0] : "catalog";
  return `${objectLabel}-${envelope.context.kind}-${new Date(envelope.generatedAtUnixMs).toISOString().slice(0, 10)}`;
}
