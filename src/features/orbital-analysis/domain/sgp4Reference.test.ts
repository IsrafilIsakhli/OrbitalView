import { expect, it } from "vitest";
import { json2satrec } from "@satellite/io";
import { sgp4 } from "@satellite/propagation";
import { parseUtcEpoch } from "@/shared/data/utcEpoch";

// Vallado et al., AIAA 2006-6753, TCPPVER.OUT, object 00005 at epoch.
// https://celestrak.org/publications/AIAA/2006-6753/AIAA-2006-6753.pdf
it("matches independently published SGP4 position and velocity, not a self-generated snapshot", () => {
  const record = json2satrec({
    OBJECT_NAME: "VANGUARD 1", OBJECT_ID: "1958-002B", NORAD_CAT_ID: 5,
    EPOCH: new Date(parseUtcEpoch("2000-06-27T18:50:19.733568")).toISOString(),
    MEAN_MOTION: 10.82419157, ECCENTRICITY: 0.1859667, INCLINATION: 34.2682,
    RA_OF_ASC_NODE: 348.7242, ARG_OF_PERICENTER: 331.7664, MEAN_ANOMALY: 19.3264,
    EPHEMERIS_TYPE: 0, CLASSIFICATION_TYPE: "U", ELEMENT_SET_NO: 475,
    REV_AT_EPOCH: 41366, BSTAR: 0.000028098, MEAN_MOTION_DOT: 0.00000023, MEAN_MOTION_DDOT: 0,
  });
  const result = sgp4(record, 0);
  expect(result?.position).toBeTruthy();
  expect(result?.velocity).toBeTruthy();
  if (!result?.position || !result.velocity) throw new Error("reference propagation failed");
  expect(result.position.x).toBeCloseTo(7022.46529266, 5);
  expect(result.position.y).toBeCloseTo(-1400.08296755, 5);
  expect(result.position.z).toBeCloseTo(0.03995155, 5);
  expect(result.velocity.x).toBeCloseTo(1.893841015, 8);
  expect(result.velocity.y).toBeCloseTo(6.405893759, 8);
  expect(result.velocity.z).toBeCloseTo(4.534807250, 8);
});
