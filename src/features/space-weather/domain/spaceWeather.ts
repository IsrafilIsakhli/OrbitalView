export type SpaceWeatherStatus = "fresh" | "stale" | "unavailable";
export type NoaaScaleType = "radioBlackout" | "solarRadiation" | "geomagneticStorm";
export type NoaaAlertKind = "alert" | "warning" | "watch" | "summary" | "cancellation" | "message";

export interface NoaaScaleReading {
  forecastDay: number;
  level: number | null;
  majorProbabilityPercent: number | null;
  minorProbabilityPercent: number | null;
  probabilityPercent: number | null;
  scaleType: NoaaScaleType;
  text: string | null;
  validAtUnixMs: number;
}

export interface KpIndexSample {
  aRunning: number;
  kp: number;
  observedAtUnixMs: number;
  stationCount: number;
}

export interface NoaaAlert {
  alertKind: NoaaAlertKind;
  headline: string;
  issuedAtUnixMs: number;
  message: string;
  productId: string;
  scaleLevel: number | null;
  scaleType: string | null;
}

export interface NoaaSpaceWeather {
  alerts: NoaaAlert[];
  durationMs: number;
  errorCode: string | null;
  expiresAtUnixMs: number;
  fetchedAtUnixMs: number;
  kpSamples: KpIndexSample[];
  retryCount: number;
  scales: NoaaScaleReading[];
  solarWind: {
    observedAtUnixMs: number;
    speedKilometersPerSecond: number;
  } | null;
  source: string;
  sourceUrl: string;
  stale: boolean;
  status: SpaceWeatherStatus;
}

export function currentScale(
  data: NoaaSpaceWeather | undefined,
  scaleType: NoaaScaleType,
): NoaaScaleReading | null {
  return data?.scales.find((scale) => scale.forecastDay === 0 && scale.scaleType === scaleType) ?? null;
}

export function latestKp(data: NoaaSpaceWeather | undefined): KpIndexSample | null {
  if (!data || data.kpSamples.length === 0) return null;
  return data.kpSamples[data.kpSamples.length - 1] ?? null;
}
