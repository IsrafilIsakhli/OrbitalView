import { beforeEach, describe, expect, it } from "vitest";

import { useEarthTimeLensSelectionStore } from "./timeLensSelection";

describe("Earth time-lens handoff", () => {
  beforeEach(() => useEarthTimeLensSelectionStore.setState({ request: null, requestSerial: 0 }));

  it("keeps the real analysis timestamp and origin", () => {
    useEarthTimeLensSelectionStore.getState().requestTimeLens(1_800_000_000_000, "conjunction");
    expect(useEarthTimeLensSelectionStore.getState().request).toMatchObject({
      origin: "conjunction",
      timestampUnixMs: 1_800_000_000_000,
    });
  });

  it("ignores invalid timestamps and only clears the matching request", () => {
    useEarthTimeLensSelectionStore.getState().requestTimeLens(Number.NaN, "analysis");
    expect(useEarthTimeLensSelectionStore.getState().request).toBeNull();
    useEarthTimeLensSelectionStore.getState().requestTimeLens(1_800_000_000_000, "analysis");
    const request = useEarthTimeLensSelectionStore.getState().request!;
    useEarthTimeLensSelectionStore.getState().clearRequest(request.id + 1);
    expect(useEarthTimeLensSelectionStore.getState().request).not.toBeNull();
    useEarthTimeLensSelectionStore.getState().clearRequest(request.id);
    expect(useEarthTimeLensSelectionStore.getState().request).toBeNull();
  });

  it("assigns a new identity after a request is consumed", () => {
    useEarthTimeLensSelectionStore.getState().requestTimeLens(1_800_000_000_000, "analysis");
    const first = useEarthTimeLensSelectionStore.getState().request!;
    useEarthTimeLensSelectionStore.getState().clearRequest(first.id);
    useEarthTimeLensSelectionStore.getState().requestTimeLens(1_800_000_000_100, "ground-station");
    expect(useEarthTimeLensSelectionStore.getState().request?.id).toBe(first.id + 1);
  });
});
