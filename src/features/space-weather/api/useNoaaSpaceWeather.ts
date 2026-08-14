import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/shared/data/queryKeys";

import { fetchNoaaSpaceWeather } from "./noaaSpaceWeather";

export function useNoaaSpaceWeather(options?: { enabled?: boolean }) {
  return useQuery({
    enabled: options?.enabled ?? true,
    gcTime: 30 * 60_000,
    queryFn: fetchNoaaSpaceWeather,
    queryKey: queryKeys.noaa,
    retry: 1,
    staleTime: 5 * 60_000,
  });
}
