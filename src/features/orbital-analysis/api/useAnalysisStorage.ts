import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  deleteAnalysisGroundStation,
  fetchAnalysisGroundStations,
  saveAnalysisGroundStation,
} from "./analysisStorage";

const groundStationKey = ["orbital-analysis", "ground-stations"] as const;

export function useAnalysisGroundStations() {
  return useQuery({
    queryFn: fetchAnalysisGroundStations,
    queryKey: groundStationKey,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useSaveAnalysisGroundStation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveAnalysisGroundStation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: groundStationKey }),
  });
}

export function useDeleteAnalysisGroundStation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAnalysisGroundStation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: groundStationKey }),
  });
}
