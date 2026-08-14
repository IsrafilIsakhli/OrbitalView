import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  clearProviderCache,
  fetchControlCenterSnapshot,
  type ProviderId,
  refreshProvider,
} from "./controlCenter";
import { queryKeys } from "@/shared/data/queryKeys";

export const controlCenterQueryKey = queryKeys.controlCenter;

export function useControlCenterSnapshot() {
  return useQuery({
    gcTime: 5 * 60_000,
    queryFn: fetchControlCenterSnapshot,
    queryKey: controlCenterQueryKey,
    retry: 1,
    staleTime: 10_000,
  });
}

export function useRefreshProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: refreshProvider,
    onSettled: async (_data, _error, provider) => {
      await queryClient.invalidateQueries({ queryKey: controlCenterQueryKey });
      if (provider === "celestrak") {
        await queryClient.invalidateQueries({ queryKey: ["satellites", "celestrak"] });
      } else if (provider === "launchLibrary") {
        await queryClient.invalidateQueries({ queryKey: ["space-intelligence", "ll2"] });
        await queryClient.invalidateQueries({ queryKey: ["launches", "ll2"] });
      } else if (provider === "nasa") {
        await queryClient.invalidateQueries({ queryKey: ["nasa", "open-apis"] });
      } else if (provider === "noaaSwpc") {
        await queryClient.invalidateQueries({ queryKey: queryKeys.noaa });
      } else if (provider === "spaceflightNews") {
        await queryClient.invalidateQueries({ queryKey: ["space-news", "sfn-v4"] });
      }
    },
  });
}

export function useClearProviderCache() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: clearProviderCache,
    onSuccess: async (_data, provider: ProviderId) => {
      await queryClient.invalidateQueries({ queryKey: controlCenterQueryKey });
      if (provider === "celestrak") {
        queryClient.removeQueries({ queryKey: ["satellites", "celestrak"] });
      } else if (provider === "launchLibrary") {
        queryClient.removeQueries({ queryKey: ["space-intelligence", "ll2"] });
        queryClient.removeQueries({ queryKey: ["launches", "ll2"] });
      } else if (provider === "nasa") {
        queryClient.removeQueries({ queryKey: ["nasa", "open-apis"] });
      } else if (provider === "noaaSwpc") {
        queryClient.removeQueries({ queryKey: queryKeys.noaa });
      } else if (provider === "spaceflightNews") {
        queryClient.removeQueries({ queryKey: ["space-news", "sfn-v4"] });
      }
    },
  });
}
