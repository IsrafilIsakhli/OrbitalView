import {
  eciToEcf,
  gstime,
  json2satrec,
  propagate,
  type OMMJsonObject,
} from "satellite.js";
import { describe, expect, it } from "vitest";

import { createOrbitCoordinateFrames } from "./orbitCoordinateFrames";

describe("orbit coordinate frames", () => {
  it("keeps the live SGP4 center position within two kilometers", () => {
    const reference = Date.UTC(2026, 7, 6, 0, 0, 0);
    const omm: OMMJsonObject = {
      ARG_OF_PERICENTER: 32.1,
      BSTAR: 0.0001,
      CLASSIFICATION_TYPE: "U",
      ECCENTRICITY: 0.0004,
      ELEMENT_SET_NO: 999,
      EPHEMERIS_TYPE: 0,
      EPOCH: "2026-08-06T00:00:00.000000",
      INCLINATION: 51.64,
      MEAN_ANOMALY: 328.1,
      MEAN_MOTION: 15.5,
      MEAN_MOTION_DDOT: 0,
      MEAN_MOTION_DOT: 0.0001,
      NORAD_CAT_ID: 25544,
      OBJECT_ID: "1998-067A",
      OBJECT_NAME: "ISS (ZARYA)",
      RA_OF_ASC_NODE: 45.2,
      REV_AT_EPOCH: 52_000,
    };
    const propagated = propagate(json2satrec(omm), new Date(reference), {
      communityDecayCheckEnabled: true,
    });
    expect(propagated).not.toBeNull();
    const position = propagated!.position;
    const frames = createOrbitCoordinateFrames([
      { positionKilometers: position, timestampUnixMs: reference },
    ], reference);
    const expected = eciToEcf(position, gstime(new Date(reference)));
    const deltaMeters = Math.hypot(
      frames.orbitPositionsMeters[0]! - expected.x * 1_000,
      frames.orbitPositionsMeters[1]! - expected.y * 1_000,
      frames.orbitPositionsMeters[2]! - expected.z * 1_000,
    );

    expect(deltaMeters).toBeLessThan(2_000);
  });

  it("uses one reference frame for the space orbit and sample time for ground track", () => {
    const reference = Date.UTC(2026, 0, 1, 0, 0, 0);
    const position = { x: 7_000, y: 120, z: 40 };
    const frames = createOrbitCoordinateFrames([
      { positionKilometers: position, timestampUnixMs: reference - 30 * 60_000 },
      { positionKilometers: position, timestampUnixMs: reference },
      { positionKilometers: position, timestampUnixMs: reference + 30 * 60_000 },
    ], reference);

    expect(Array.from(frames.orbitPositionsMeters.slice(0, 3))).toEqual(
      Array.from(frames.orbitPositionsMeters.slice(3, 6)),
    );
    expect(Array.from(frames.orbitPositionsMeters.slice(3, 6))).toEqual(
      Array.from(frames.groundTrackPositionsMeters.slice(3, 6)),
    );
    expect(Array.from(frames.groundTrackPositionsMeters.slice(0, 3))).not.toEqual(
      Array.from(frames.groundTrackPositionsMeters.slice(6, 9)),
    );
  });

  it("keeps invalid samples explicit instead of inventing coordinates", () => {
    const frames = createOrbitCoordinateFrames([
      { positionKilometers: null, timestampUnixMs: 0 },
    ], 0);
    expect(Number.isNaN(frames.orbitPositionsMeters[0])).toBe(true);
    expect(Number.isNaN(frames.groundTrackPositionsMeters[0])).toBe(true);
  });
});
