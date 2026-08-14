import { useQuery } from "@tanstack/react-query";

import { fetchNasaIntelligence } from "./nasaIntelligence";

const THIRTY_MINUTES_MS = 30 * 60 * 1_000;

export function useNasaIntelligence(options?: { enabled?: boolean }) {
  return useQuery({
    enabled: options?.enabled ?? true,
    gcTime: 6 * THIRTY_MINUTES_MS,
    queryFn: fetchNasaIntelligence,
    queryKey: ["nasa", "open-apis", "dashboard"],
    retry: 1,
    staleTime: THIRTY_MINUTES_MS,
  });
}
