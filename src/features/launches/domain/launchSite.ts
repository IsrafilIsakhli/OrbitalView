import type { LaunchRecord } from "./launch";

export interface LaunchSiteRecord {
  countryCode: string | null;
  countryName: string | null;
  id: string;
  latitude: number;
  launches: LaunchRecord[];
  locationName: string | null;
  longitude: number;
  name: string;
  nextLaunch: LaunchRecord;
  padNames: string[];
  providerNames: string[];
}

export function createLaunchSites(
  launches: readonly LaunchRecord[],
): LaunchSiteRecord[] {
  const groups = new Map<string, LaunchRecord[]>();
  for (const launch of launches) {
    if (launch.latitude === null || launch.longitude === null) continue;
    const key = siteKey(launch.latitude, launch.longitude);
    const existing = groups.get(key);
    if (existing) existing.push(launch);
    else groups.set(key, [launch]);
  }

  return [...groups.entries()].map(([id, siteLaunches]) => {
    const ordered = [...siteLaunches].sort(
      (left, right) => Date.parse(left.net) - Date.parse(right.net),
    );
    const nextLaunch = ordered[0]!;
    return {
      countryCode: nextLaunch.countryCode,
      countryName: nextLaunch.countryName,
      id,
      latitude: nextLaunch.latitude!,
      launches: ordered,
      locationName: nextLaunch.locationName,
      longitude: nextLaunch.longitude!,
      name: nextLaunch.locationName ?? nextLaunch.padName ?? nextLaunch.name,
      nextLaunch,
      padNames: unique(ordered.map((launch) => launch.padName)),
      providerNames: unique(ordered.map((launch) => launch.agencyName)),
    };
  }).sort(
    (left, right) => Date.parse(left.nextLaunch.net) - Date.parse(right.nextLaunch.net),
  );
}

export function findLaunchSite(
  sites: readonly LaunchSiteRecord[],
  launchId: string,
): LaunchSiteRecord | null {
  return sites.find((site) => site.launches.some((launch) => launch.id === launchId)) ?? null;
}

function siteKey(latitude: number, longitude: number): string {
  return `site:${latitude.toFixed(4)}:${longitude.toFixed(4)}`;
}

function unique(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
