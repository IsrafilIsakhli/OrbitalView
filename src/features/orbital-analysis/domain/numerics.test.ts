import { describe, expect, it } from "vitest";
import { minimizeBounded, refineCrossing } from "./numerics";

describe("bounded orbital event refinement", () => {
  it("refines AOS and LOS within one second", () => {
    const elevation = (time: number) => 20 - ((time - 50_000) / 10_000) ** 2;
    const crossing = 50_000 - Math.sqrt(10) * 10_000;
    expect(Math.abs(refineCrossing(elevation, 10, 0, 50_000, true) - crossing)).toBeLessThanOrEqual(500);
    expect(Math.abs(refineCrossing(elevation, 10, 50_000, 100_000, false) - (100_000 - crossing))).toBeLessThanOrEqual(500);
  });
  it("does not substitute missing samples", () => {
    expect(() => refineCrossing(() => null, 10, 0, 10_000, true)).toThrow();
  });
  it("finds the endpoint minimum for diverging objects", () => {
    expect(minimizeBounded((time) => time + 100, 0, 120_000)).toBe(0);
  });
  it("refines a converging then diverging encounter", () => {
    expect(Math.abs(minimizeBounded((time) => Math.hypot((time - 45_678) / 1_000, 3), 0, 120_000) - 45_678)).toBeLessThan(500);
  });
});
