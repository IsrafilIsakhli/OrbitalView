import { describe, expect, it } from "vitest";

import { createSatelliteCatalog } from "./satellite";

const issOmm = {
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

describe("createSatelliteCatalog", () => {
  it("merges OMM propagation data with SATCAT metadata", () => {
    const result = createSatelliteCatalog(
      [issOmm],
      [{
        LAUNCH_DATE: "1998-11-20",
        LAUNCH_SITE: "TTMTR",
        NORAD_CAT_ID: 25544,
        OBJECT_ID: "1998-067A",
        OBJECT_NAME: "ISS (ZARYA)",
        OBJECT_TYPE: "PAY",
        OPS_STATUS_CODE: "+",
        OWNER: "ISS",
      }],
      {
        catalogObjectCount: 1,
        expiresAt: "2026-08-06T02:00:00.000Z",
        fetchedAt: "2026-08-06T00:00:00.000Z",
        source: "CelesTrak live",
        stale: false,
      },
    );

    expect(result.satellites).toHaveLength(1);
    expect(result.satellites[0]).toMatchObject({
      argumentOfPerigeeDegrees: 32.1,
      category: "station",
      launchDate: "1998-11-20",
      meanAnomalyDegrees: 328.1,
      noradId: "25544",
      ownerCode: "ISS",
      rightAscensionDegrees: 45.2,
    });
    expect(result.rejectedObjectCount).toBe(0);
  });

  it("rejects malformed orbital records without failing the catalog", () => {
    const result = createSatelliteCatalog(
      [{ ...issOmm, MEAN_MOTION: "invalid" }],
      [],
      {
        catalogObjectCount: 0,
        expiresAt: "2026-08-06T02:00:00.000Z",
        fetchedAt: "2026-08-06T00:00:00.000Z",
        source: "CelesTrak live",
        stale: false,
      },
    );

    expect(result.satellites).toHaveLength(0);
    expect(result.rejectedObjectCount).toBe(1);
  });

  it("classifies real science missions separately from generic active objects", () => {
    const result = createSatelliteCatalog(
      [{ ...issOmm, NORAD_CAT_ID: 20580, OBJECT_ID: "1990-037B", OBJECT_NAME: "HST" }],
      [{ NORAD_CAT_ID: 20580, OBJECT_NAME: "HST", OBJECT_TYPE: "PAY" }],
      {
        catalogObjectCount: 1,
        expiresAt: "2026-08-06T02:00:00.000Z",
        fetchedAt: "2026-08-06T00:00:00.000Z",
        source: "CelesTrak live",
        stale: false,
      },
    );

    expect(result.satellites[0]?.category).toBe("science");
  });
});
