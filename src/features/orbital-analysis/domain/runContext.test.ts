import { describe, expect, it } from "vitest";
import { analysisExportName, createRunContext, resultMatchesSelection } from "./runContext";
import type { AnalysisEnvelope } from "./analysis";

describe("analysis run identity", () => {
  const context = createRunContext({ type: "dynamics", requestId: "a", satelliteId: "norad:25544", sampleCount: 300, startUnixMs: 1000, endUnixMs: 2000 }, { fetchedAtUnixMs: 50, source: "CelesTrak", stale: false });
  const result: AnalysisEnvelope<unknown> = { context, catalogFetchedAtUnixMs: 50, frame: "SGP4-ECI", generatedAtUnixMs: 2000, model: "SGP4", objectEpochs: {}, requestId: "a", result: {}, stale: false, warnings: [] };
  it("never presents an old result as another satellite", () => {
    expect(resultMatchesSelection(result, "norad:25544")).toBe(true);
    expect(resultMatchesSelection(result, "norad:12345")).toBe(false);
  });
  it("exports identity and dates from the completed run", () => {
    expect(analysisExportName(result)).toBe("norad:25544-dynamics-1970-01-01");
    expect(context.parameters.sampleCount).toBe(300);
    expect(context.catalogVersion).toBe("CelesTrak:50");
  });
});
