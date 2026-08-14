import { useQuery } from "@tanstack/react-query";

import { fetchSatelliteObjectMedia } from "./satelliteMedia";

export const satelliteMediaQueryKey = ["satellite-object-media"] as const;

export function useSatelliteObjectMedia(noradId: string) {
  return useQuery({
    gcTime: 60 * 60_000,
    queryFn: () => fetchSatelliteObjectMedia(noradId),
    queryKey: [...satelliteMediaQueryKey, noradId],
    retry: false,
    staleTime: 5 * 60_000,
  });
}
