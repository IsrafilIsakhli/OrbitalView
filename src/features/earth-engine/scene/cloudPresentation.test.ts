import { describe, expect, it } from "vitest";
import { resolveCloudPresentation } from "./cloudPresentation";

describe("cloud shell near-camera fallback", () => {
  it("uses imagery before entering the visual shell and has return hysteresis", () => {
    expect(resolveCloudPresentation("shell",true,true,34_000)).toBe("imagery");
    expect(resolveCloudPresentation("imagery",true,true,50_000)).toBe("imagery");
    expect(resolveCloudPresentation("imagery",true,true,61_000)).toBe("shell");
    expect(resolveCloudPresentation("shell",true,true,50_000)).toBe("shell");
  });
  it("does not hide the fallback while the optional shell prepares", () => {
    expect(resolveCloudPresentation("hidden",true,false,900_000)).toBe("imagery");
    expect(resolveCloudPresentation("shell",true,true,Number.NaN)).toBe("imagery");
    expect(resolveCloudPresentation("shell",false,true,900_000)).toBe("hidden");
  });
});
