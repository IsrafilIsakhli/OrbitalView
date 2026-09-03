import { nativeSnapshot } from "@/shared/data/nativeSnapshot";
import { z } from "zod";

import type { NoaaSpaceWeather } from "../domain/spaceWeather";

const payloadSchema = z.object({
  alerts: z.array(z.object({
    alertKind: z.enum(["alert", "warning", "watch", "summary", "cancellation", "message"]),
    headline: z.string().min(1),
    issuedAtUnixMs: z.number().int().nonnegative(),
    message: z.string(),
    productId: z.string().min(1),
    scaleLevel: z.number().int().min(0).max(5).nullable(),
    scaleType: z.string().nullable(),
  })),
  durationMs: z.number().int().nonnegative(),
  errorCode: z.string().nullable(),
  expiresAtUnixMs: z.number().int().nonnegative(),
  fetchedAtUnixMs: z.number().int().nonnegative(),
  kpSamples: z.array(z.object({
    aRunning: z.number().int().nonnegative(),
    kp: z.number().finite().min(0).max(9),
    observedAtUnixMs: z.number().int().nonnegative(),
    stationCount: z.number().int().nonnegative(),
  })),
  retryCount: z.number().int().nonnegative(),
  scales: z.array(z.object({
    forecastDay: z.number().int().min(0).max(3),
    level: z.number().int().min(0).max(5).nullable(),
    majorProbabilityPercent: z.number().int().min(0).max(100).nullable(),
    minorProbabilityPercent: z.number().int().min(0).max(100).nullable(),
    probabilityPercent: z.number().int().min(0).max(100).nullable(),
    scaleType: z.enum(["radioBlackout", "solarRadiation", "geomagneticStorm"]),
    text: z.string().nullable(),
    validAtUnixMs: z.number().int().nonnegative(),
  })),
  solarWind: z.object({
    observedAtUnixMs: z.number().int().nonnegative(),
    speedKilometersPerSecond: z.number().finite().nonnegative(),
  }).nullable(),
  source: z.string().min(1),
  sourceUrl: z.string().url(),
  stale: z.boolean(),
  status: z.enum(["fresh", "stale", "unavailable"]),
});

export async function fetchNoaaSpaceWeather(): Promise<NoaaSpaceWeather> {
  return payloadSchema.parse(await nativeSnapshot("noaaSwpc", "noaa_space_weather"));
}
