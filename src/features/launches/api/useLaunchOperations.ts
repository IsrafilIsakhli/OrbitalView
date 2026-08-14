import { useQuery } from "@tanstack/react-query";

import { fetchCompletedLaunches, fetchLaunchDetail } from "./launchOperations";

export function useCompletedLaunches(options?: { enabled?: boolean; limit?: number; offset?: number }) {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  return useQuery({
    enabled: options?.enabled ?? true,
    gcTime: 90 * 60_000,
    queryFn: () => fetchCompletedLaunches(limit, offset),
    queryKey: ["launches", "ll2", "previous", limit, offset],
    retry: 1,
    staleTime: 30 * 60_000,
  });
}

export function useLaunchDetail(id: string | null) {
  return useQuery({
    enabled: Boolean(id),
    gcTime: 90 * 60_000,
    queryFn: () => fetchLaunchDetail(id!),
    queryKey: ["launches", "ll2", "detail", id],
    retry: 1,
    staleTime: 30 * 60_000,
  });
}
