import { describe, expect, it } from "vitest";

import type { GpuCapabilities } from "../contracts/earth-engine";
import { AdaptiveQualityController } from "./AdaptiveQualityController";
import { qualityAtMost, recommendGpuQuality } from "./qualityProfiles";

const capableGpu: GpuCapabilities = {
  antialias: true,
  api: "WebGL 2",
  maxMsaaSamples: 8,
  maxTextureSize: 16_384,
  renderer: "NVIDIA GeForce RTX",
  vendor: "NVIDIA",
};

describe("Earth engine quality selection", () => {
  it("selects high quality only when the GPU and device budget support it", () => {
    expect(recommendGpuQuality(capableGpu, 12, 16)).toBe("high");
    expect(
      recommendGpuQuality(
        { ...capableGpu, renderer: "Google SwiftShader" },
        12,
        16,
      ),
    ).toBe("eco");
  });

  it("never exceeds the user's quality ceiling", () => {
    expect(qualityAtMost("high", "balanced")).toBe("balanced");
    expect(qualityAtMost("eco", "high")).toBe("eco");
  });

  it("degrades only after sustained low frame rate", () => {
    const controller = new AdaptiveQualityController("high", "high");

    expect(controller.sample(52, false)).toBeNull();
    expect(controller.sample(56, false)).toBeNull();
    expect(controller.sample(52, false)).toBeNull();
    expect(controller.sample(51, false)).toBeNull();
    expect(controller.sample(50, false)).toBe("balanced");
  });
});
