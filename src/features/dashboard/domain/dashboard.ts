import {
  classifyLaunchStatus,
  type LaunchRecord,
} from "@/features/launches/domain/launch";
import {
  countSatelliteCategories,
  type SatelliteCatalog,
} from "@/features/satellites/domain/satellite";
import type {
  NoaaAlert,
  NoaaSpaceWeather,
} from "@/features/space-weather/domain/spaceWeather";

const RECENT_LAUNCH_GRACE_MS = 12 * 60 * 60 * 1_000;
const RECENT_SPACE_WEATHER_ALERT_MS = 24 * 60 * 60 * 1_000;

export interface DashboardLaunchSelection {
  activeLaunches: LaunchRecord[];
  nextLaunch: LaunchRecord | null;
  upcomingLaunches: LaunchRecord[];
}

export interface DashboardCatalogSummary {
  catalogCount: number;
  debrisCount: number;
  payloadCount: number;
  propagatableCount: number;
  rocketBodyCount: number;
}

export function selectDashboardLaunches(
  launches: readonly LaunchRecord[],
  nowUnixMs = Date.now(),
): DashboardLaunchSelection {
  const activeLaunches = launches
    .filter((launch) => classifyLaunchStatus(launch.statusId) === "active")
    .sort(compareLaunchNet);
  const oldestAcceptedNet = nowUnixMs - RECENT_LAUNCH_GRACE_MS;
  const upcomingLaunches = launches
    .filter((launch) => (
      classifyLaunchStatus(launch.statusId) === "upcoming"
      && parsedNet(launch) >= oldestAcceptedNet
    ))
    .sort(compareLaunchNet);

  return {
    activeLaunches,
    nextLaunch: upcomingLaunches[0] ?? null,
    upcomingLaunches,
  };
}

export function summarizeDashboardCatalog(
  catalog: SatelliteCatalog | undefined,
): DashboardCatalogSummary | null {
  if (!catalog) return null;
  const categories = countSatelliteCategories(catalog.satellites);
  const payloadCount = catalog.satellites.filter((satellite) => (
    satellite.objectType?.trim().toLocaleUpperCase() === "PAYLOAD"
  )).length;
  return {
    catalogCount: catalog.catalogObjectCount,
    debrisCount: categories.debris,
    payloadCount,
    propagatableCount: catalog.satellites.length,
    rocketBodyCount: categories["rocket-body"],
  };
}

export function recentOperationalAlerts(
  data: NoaaSpaceWeather | undefined,
  nowUnixMs = Date.now(),
): NoaaAlert[] {
  if (!data) return [];
  const cutoff = nowUnixMs - RECENT_SPACE_WEATHER_ALERT_MS;
  return data.alerts.filter((alert) => (
    alert.issuedAtUnixMs >= cutoff
    && (alert.alertKind === "alert" || alert.alertKind === "warning" || alert.alertKind === "watch")
  ));
}

export function displayableNoaaText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized || normalized.toLocaleLowerCase() === "none") return null;
  return normalized;
}

const PROVIDER_PLACEHOLDERS = new Set([
  "n/a",
  "not available",
  "tbc",
  "tbd",
  "unknown",
  "unknown payload",
]);

export function dashboardMissionName(launch: LaunchRecord): string {
  const missionName = normalizedProviderText(launch.missionName);
  return missionName && !isProviderPlaceholder(missionName) ? missionName : launch.name;
}

export function dashboardLaunchSupportingLabel(launch: LaunchRecord): string | null {
  const title = launch.name.trim().toLocaleLowerCase();
  for (const value of [launch.missionName, launch.rocketName]) {
    const normalized = normalizedProviderText(value);
    if (!normalized || isProviderPlaceholder(normalized)) continue;
    if (!title.includes(normalized.toLocaleLowerCase())) return normalized;
  }
  return null;
}

function isProviderPlaceholder(value: string): boolean {
  return PROVIDER_PLACEHOLDERS.has(value.trim().toLocaleLowerCase());
}

function normalizedProviderText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function compareLaunchNet(left: LaunchRecord, right: LaunchRecord): number {
  return parsedNet(left) - parsedNet(right);
}

function parsedNet(launch: LaunchRecord): number {
  const parsed = Date.parse(launch.net);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}
