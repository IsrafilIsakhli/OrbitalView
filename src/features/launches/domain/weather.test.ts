import { describe, expect, it } from "vitest";

import { closestForecast, createLaunchWeather } from "./weather";

describe("launch weather", () => {
  it("selects the hourly forecast closest to the launch window", () => {
    const weather = createLaunchWeather({
      current: {
        temperature_2m: 25,
        time: "2026-08-07T12:00",
        weather_code: 1,
        wind_speed_10m: 12,
      },
      hourly: {
        cloud_cover: [20, 40],
        precipitation_probability: [5, 15],
        relative_humidity_2m: [65, 70],
        temperature_2m: [25, 23],
        time: ["2026-08-08T15:00", "2026-08-08T16:00"],
        visibility: [20_000, 18_000],
        weather_code: [1, 2],
        wind_gusts_10m: [20, 26],
        wind_speed_10m: [12, 17],
      },
    }, {
      expiresAt: "2026-08-07T12:15:00Z",
      fetchedAt: "2026-08-07T12:00:00Z",
      source: "Open-Meteo live",
      stale: false,
    });

    expect(closestForecast(weather, "2026-08-08T16:24:49Z")).toMatchObject({
      cloudCover: 40,
      precipitationProbability: 15,
      windSpeedKmh: 17,
    });
  });
});
