import { beforeEach, describe, expect, it } from "vitest";

import { useAnalysisSelectionStore } from "./analysisSelection";

describe("analysis selection handoff", () => {
  beforeEach(() => {
    useAnalysisSelectionStore.setState({
      requestedSatelliteId: null,
      requestedTab: null,
    });
  });

  it("preserves the exact satellite and requested analysis tab", () => {
    useAnalysisSelectionStore.getState().requestAnalysis("25544", "proximity");

    expect(useAnalysisSelectionStore.getState()).toMatchObject({
      requestedSatelliteId: "25544",
      requestedTab: "proximity",
    });
  });

  it("clears consumed handoff state without inventing a selection", () => {
    useAnalysisSelectionStore.getState().requestAnalysis("25544", "dynamics");
    useAnalysisSelectionStore.getState().clearRequest();

    expect(useAnalysisSelectionStore.getState()).toMatchObject({
      requestedSatelliteId: null,
      requestedTab: null,
    });
  });
});
