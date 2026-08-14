import { useQuery } from "@tanstack/react-query";

import { fetchRocketConfiguration } from "./launchRocket";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1_000;

export function useRocketConfiguration(
  configurationId: string | null,
  enabled: boolean,
) {
  return useQuery({
    enabled: enabled && configurationId !== null,
    gcTime: TWENTY_FOUR_HOURS_MS,
    queryFn: () => fetchRocketConfiguration(configurationId!),
    queryKey: ["rocket-configuration", configurationId],
    retry: 1,
    staleTime: TWENTY_FOUR_HOURS_MS,
  });
}
