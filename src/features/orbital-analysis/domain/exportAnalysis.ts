import type {
  AnalysisEnvelope,
  ConstellationResult,
  CoverageResult,
  DynamicsResult,
  GroundStationAccessResult,
  GroundNetworkResult,
  ProximityResult,
} from "./analysis";

type ExportableResult =
  | DynamicsResult
  | GroundStationAccessResult
  | GroundNetworkResult
  | ConstellationResult
  | CoverageResult
  | ProximityResult;

export function analysisToJson(
  envelope: AnalysisEnvelope<ExportableResult>,
): string {
  return JSON.stringify(envelope, null, 2);
}

export function analysisToCsv(
  envelope: AnalysisEnvelope<ExportableResult>,
): string {
  const result = envelope.result;
  const writeRows = (rows: Array<Record<string, unknown>>) => rowsToCsv([{
    model: envelope.model, frame: envelope.frame, requestId: envelope.requestId,
    recordType: "analysis-metadata", resultCount: rows.length,
    catalogSource: envelope.context.catalogSource, catalogVersion: envelope.context.catalogVersion,
    catalogFetchedAtUnixMs: envelope.catalogFetchedAtUnixMs, generatedAtUnixMs: envelope.generatedAtUnixMs,
    objectIds: envelope.context.objectIds.join(";"), objectEpochs: envelope.objectEpochs,
    parameters: envelope.context.parameters, warnings: envelope.warnings,
  }, ...rows.map((row) => ({ ...row, recordType: "measurement", model: envelope.model, frame: envelope.frame, requestId: envelope.requestId }))]);
  if ("samples" in result) {
    return writeRows(result.samples as unknown as Array<Record<string, unknown>>);
  }
  if ("passes" in result) {
    return writeRows(
      result.passes.map((pass) => ({
        aosAzimuthDegrees: pass.aosAzimuthDegrees,
        aosUnixMs: pass.aosUnixMs,
        continuous: pass.continuous,
        durationSeconds: pass.durationSeconds,
        losAzimuthDegrees: pass.losAzimuthDegrees,
        losUnixMs: pass.losUnixMs,
        maximumElevationDegrees: pass.maximumElevationDegrees,
        minimumRangeKm: pass.minimumRangeKm,
        ...("satelliteId" in pass ? {
          lighting: pass.lighting,
          satelliteId: pass.satelliteId,
          satelliteName: pass.satelliteName,
          sunElevationDegrees: pass.sunElevationDegrees,
        } : {}),
        tcaUnixMs: pass.tcaUnixMs,
      })),
    );
  }
  if ("events" in result) {
    return writeRows(result.events as unknown as Array<Record<string, unknown>>);
  }
  if ("stationResults" in result) {
    return writeRows(result.stationResults.flatMap((stationResult) => stationResult.passes.map((pass) => ({
      aosUnixMs: pass.aosUnixMs,
      durationSeconds: pass.durationSeconds,
      losUnixMs: pass.losUnixMs,
      maximumElevationDegrees: pass.maximumElevationDegrees,
      minimumRangeKm: pass.minimumRangeKm,
      stationId: stationResult.station.id,
      stationName: stationResult.station.name,
      tcaUnixMs: pass.tcaUnixMs,
    }))));
  }
  return writeRows(result.points as unknown as Array<Record<string, unknown>>);
}

function rowsToCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return [
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
  ].join("\r\n");
}

function csvCell(value: unknown): string {
  const safeValue = typeof value === "string" && /^[=+@\-\t\r]/.test(value) ? `'${value}` : value;
  const serialized = safeValue === null || safeValue === undefined
    ? ""
    : typeof safeValue === "object"
      ? JSON.stringify(safeValue)
      : typeof safeValue === "string" || typeof safeValue === "number" || typeof safeValue === "boolean"
        ? String(safeValue)
        : JSON.stringify(value);
  return /[",\r\n]/.test(serialized)
    ? `"${serialized.replace(/"/g, '""')}"`
    : serialized;
}
