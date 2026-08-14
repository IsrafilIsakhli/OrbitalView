import { useQuery } from "@tanstack/react-query";

import { fetchSpaceIntelligence } from "./spaceIntelligence";

const THIRTY_MINUTES_MS = 30 * 60 * 1_000;

export function useSpaceIntelligence(options?: { enabled?: boolean }) {
  return useQuery({
    enabled: options?.enabled ?? true,
    gcTime: 3 * THIRTY_MINUTES_MS,
    queryFn: fetchSpaceIntelligence,
    queryKey: ["space-intelligence", "ll2", "upcoming"],
    retry: 1,
    staleTime: THIRTY_MINUTES_MS,
  });
}
