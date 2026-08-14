import { useMemo } from "react";

import { useLaunchWeather } from "@/features/launches/api/useLaunchWeather";
import { useSpaceIntelligence } from "@/features/launches/api/useSpaceIntelligence";
import { useActiveSatelliteCatalog } from "@/features/satellites/api/useActiveSatelliteCatalog";
import { useSpaceNews, useSpaceNewsForRelation } from "@/features/space-news/api/useSpaceNews";
import { useNoaaSpaceWeather } from "@/features/space-weather/api/useNoaaSpaceWeather";

import { selectDashboardLaunches } from "../domain/dashboard";

export function useDashboardComposition() {
  const launches = useSpaceIntelligence();
  const launchSelection = useMemo(
    () => selectDashboardLaunches(launches.data?.launches ?? []),
    [launches.data?.launches],
  );
  const nextLaunch = launchSelection.nextLaunch;
  return {
    launchSelection,
    launches,
    news: useSpaceNews({ limit: 6 }),
    noaa: useNoaaSpaceWeather(),
    relatedNews: useSpaceNewsForRelation("launch", nextLaunch?.id ?? null, 4),
    satellites: useActiveSatelliteCatalog(),
    weather: useLaunchWeather(nextLaunch?.latitude ?? null, nextLaunch?.longitude ?? null),
  };
}
