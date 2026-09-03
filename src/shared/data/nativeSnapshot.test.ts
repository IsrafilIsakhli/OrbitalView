import { beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { nativeSnapshot } from "./nativeSnapshot";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
beforeEach(() => vi.mocked(invoke).mockReset());

it("reconciles the scheduler snapshot without an upstream command", async () => {
  vi.mocked(invoke).mockResolvedValue({ count: 42 });
  expect(await nativeSnapshot("celestrak", "active_satellite_catalog")).toEqual({ count: 42 });
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(invoke).toHaveBeenCalledWith("provider_cached_snapshot", { provider: "celestrak" });
});

it("allows one initial provider load when no native snapshot exists", async () => {
  vi.mocked(invoke).mockResolvedValueOnce(null).mockResolvedValueOnce({ count: 42 });
  await nativeSnapshot("celestrak", "active_satellite_catalog");
  expect(invoke).toHaveBeenLastCalledWith("active_satellite_catalog");
});
