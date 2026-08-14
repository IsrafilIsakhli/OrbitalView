import type {
  AnalysisEnvelope,
  ConstellationResult,
  DynamicsResult,
  GroundStationAccessResult,
  ProximityResult,
} from "./analysis";

type ExportableResult =
  | DynamicsResult
  | GroundStationAccessResult
  | ConstellationResult
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
  if ("samples" in result) {
    return rowsToCsv(result.samples as unknown as Array<Record<string, unknown>>);
  }
  if ("passes" in result) {
    return rowsToCsv(
      result.passes.map((pass) => ({
        aosAzimuthDegrees: pass.aosAzimuthDegrees,
        aosUnixMs: pass.aosUnixMs,
        continuous: pass.continuous,
        durationSeconds: pass.durationSeconds,
        losAzimuthDegrees: pass.losAzimuthDegrees,
        losUnixMs: pass.losUnixMs,
        maximumElevationDegrees: pass.maximumElevationDegrees,
        minimumRangeKm: pass.minimumRangeKm,
        tcaUnixMs: pass.tcaUnixMs,
      })),
    );
  }
  if ("events" in result) {
    return rowsToCsv(result.events as unknown as Array<Record<string, unknown>>);
  }
  return rowsToCsv(result.points as unknown as Array<Record<string, unknown>>);
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
  const serialized = value === null || value === undefined
    ? ""
    : typeof value === "object"
      ? JSON.stringify(value)
      : typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : JSON.stringify(value);
  return /[",\r\n]/.test(serialized)
    ? `"${serialized.replace(/"/g, '""')}"`
    : serialized;
}
