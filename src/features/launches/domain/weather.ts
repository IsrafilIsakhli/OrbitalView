import { z } from "zod";

const numericArray = z.array(z.number().nullable());
const weatherSchema = z.object({
  current: z.object({
    cloud_cover: z.number().nullable().optional(),
    relative_humidity_2m: z.number().nullable().optional(),
    temperature_2m: z.number().nullable().optional(),
    time: z.string(),
    weather_code: z.number().nullable().optional(),
    wind_gusts_10m: z.number().nullable().optional(),
    wind_speed_10m: z.number().nullable().optional(),
  }),
  hourly: z.object({
    cloud_cover: numericArray,
    precipitation_probability: numericArray,
    relative_humidity_2m: numericArray,
    temperature_2m: numericArray,
    time: z.array(z.string()),
    visibility: numericArray,
    weather_code: numericArray,
    wind_gusts_10m: numericArray,
    wind_speed_10m: numericArray,
  }),
}).passthrough();

export interface WeatherPoint {
  cloudCover: number | null;
  humidity: number | null;
  precipitationProbability: number | null;
  temperatureCelsius: number | null;
  time: string;
  visibilityMeters: number | null;
  weatherCode: number | null;
  windGustKmh: number | null;
  windSpeedKmh: number | null;
}

export interface LaunchWeather {
  current: WeatherPoint;
  expiresAt: string;
  fetchedAt: string;
  hourly: WeatherPoint[];
  source: string;
  stale: boolean;
}

export function createLaunchWeather(
  candidate: unknown,
  metadata: Omit<LaunchWeather, "current" | "hourly">,
): LaunchWeather {
  const weather = weatherSchema.parse(candidate);
  const hourly = weather.hourly.time.map((time, index) => ({
    cloudCover: weather.hourly.cloud_cover[index] ?? null,
    humidity: weather.hourly.relative_humidity_2m[index] ?? null,
    precipitationProbability:
      weather.hourly.precipitation_probability[index] ?? null,
    temperatureCelsius: weather.hourly.temperature_2m[index] ?? null,
    time,
    visibilityMeters: weather.hourly.visibility[index] ?? null,
    weatherCode: weather.hourly.weather_code[index] ?? null,
    windGustKmh: weather.hourly.wind_gusts_10m[index] ?? null,
    windSpeedKmh: weather.hourly.wind_speed_10m[index] ?? null,
  }));
  return {
    ...metadata,
    current: {
      cloudCover: weather.current.cloud_cover ?? null,
      humidity: weather.current.relative_humidity_2m ?? null,
      precipitationProbability: null,
      temperatureCelsius: weather.current.temperature_2m ?? null,
      time: weather.current.time,
      visibilityMeters: null,
      weatherCode: weather.current.weather_code ?? null,
      windGustKmh: weather.current.wind_gusts_10m ?? null,
      windSpeedKmh: weather.current.wind_speed_10m ?? null,
    },
    hourly,
  };
}

export function closestForecast(
  weather: LaunchWeather,
  targetIso: string,
): WeatherPoint | null {
  const target = Date.parse(targetIso);
  if (!Number.isFinite(target) || weather.hourly.length === 0) return null;
  let closest: WeatherPoint | null = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const point of weather.hourly) {
    const pointDistance = Math.abs(Date.parse(`${point.time}Z`) - target);
    if (pointDistance < distance) {
      closest = point;
      distance = pointDistance;
    }
  }
  return distance <= 90 * 60 * 1_000 ? closest : null;
}
