import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  deleteAnalysisGroundStation,
  fetchAnalysisOrbitalHistory,
  fetchAnalysisGroundStations,
  recordAnalysisOrbitalSnapshot,
  saveAnalysisGroundStation,
} from "./analysisStorage";
import type { RecordOrbitalSnapshotInput } from "./analysisStorage";

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

export function useAnalysisOrbitalHistory(noradId: string | undefined) {
  return useQuery({
    enabled: Boolean(noradId),
    queryFn: () => fetchAnalysisOrbitalHistory(noradId!),
    queryKey: ["orbital-analysis", "orbital-history", noradId],
    staleTime: 60_000,
  });
}

export function useRecordAnalysisOrbitalSnapshot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: RecordOrbitalSnapshotInput) =>
      recordAnalysisOrbitalSnapshot(request),
    onSuccess: (snapshot) => queryClient.invalidateQueries({
      queryKey: ["orbital-analysis", "orbital-history", snapshot.noradId],
    }),
  });
}
