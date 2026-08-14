import { useQuery } from "@tanstack/react-query";

import { fetchLaunchWeather } from "./launchWeather";

const FIFTEEN_MINUTES_MS = 15 * 60 * 1_000;

export function useLaunchWeather(
  latitude: number | null,
  longitude: number | null,
) {
  return useQuery({
    enabled: latitude !== null && longitude !== null,
    gcTime: 4 * FIFTEEN_MINUTES_MS,
    queryFn: () => fetchLaunchWeather(latitude!, longitude!),
    queryKey: ["launch-weather", latitude, longitude],
    retry: 1,
    staleTime: FIFTEEN_MINUTES_MS,
  });
}
