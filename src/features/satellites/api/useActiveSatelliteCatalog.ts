import { useQuery } from "@tanstack/react-query";

import { fetchActiveSatelliteCatalog } from "./activeSatelliteCatalog";

const TWO_HOURS_MS = 2 * 60 * 60 * 1_000;

export function useActiveSatelliteCatalog(options?: { enabled?: boolean }) {
  return useQuery({
    enabled: options?.enabled ?? true,
    gcTime: 3 * TWO_HOURS_MS,
    queryFn: fetchActiveSatelliteCatalog,
    queryKey: ["satellites", "celestrak", "active"],
    retry: 1,
    staleTime: TWO_HOURS_MS,
  });
}
