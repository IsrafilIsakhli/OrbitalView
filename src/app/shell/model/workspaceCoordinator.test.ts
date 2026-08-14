import { describe, expect, it } from "vitest";

import { pushWorkspace } from "./workspaceCoordinator";

describe("workspace coordinator", () => {
  it("preserves the origin location when moving to another workspace", () => {
    const result = pushWorkspace(
      { destination: "launches", origin: "search" },
      [],
      "satellites",
      "relation",
    );
    expect(result.current).toEqual({ destination: "satellites", origin: "relation" });
    expect(result.history).toEqual([{ destination: "launches", origin: "search" }]);
    expect(result.canGoBack).toBe(true);
  });

  it("does not duplicate history for same-workspace navigation", () => {
    const current = { destination: "spaceNews", origin: "navigation" } as const;
    expect(pushWorkspace(current, [], "spaceNews", "search").history).toEqual([]);
  });
});
