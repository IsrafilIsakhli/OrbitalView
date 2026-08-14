import {
  classifyLaunchStatus,
  launchStatusIds,
  type LaunchRecord,
} from "./launch";

export type LaunchQueueTab = "upcoming" | "active" | "completed";
export type LaunchTimelineRange = "sevenDays" | "thirtyDays" | "all";
export type LaunchStatusTranslationKey =
  | "go"
  | "tbd"
  | "success"
  | "failure"
  | "hold"
  | "inFlight"
  | "partialFailure"
  | "tbc"
  | "deployed"
  | "unknown";

export interface LaunchQueues {
  active: LaunchRecord[];
  completed: LaunchRecord[];
  upcoming: LaunchRecord[];
}

export function createLaunchQueues(
  currentRecords: readonly LaunchRecord[],
  completedRecords: readonly LaunchRecord[] = [],
): LaunchQueues {
  const active: LaunchRecord[] = [];
  const completed: LaunchRecord[] = [];
  const upcoming: LaunchRecord[] = [];
  const completedById = new Map(completedRecords.map((launch) => [launch.id, launch]));

  for (const launch of currentRecords) {
    const lifecycle = classifyLaunchStatus(launch.statusId);
    if (lifecycle === "active") active.push(launch);
    else if (lifecycle === "completed") completedById.set(launch.id, launch);
    else upcoming.push(launch);
  }

  completed.push(...completedById.values());
  upcoming.sort((left, right) => Date.parse(left.net) - Date.parse(right.net));
  active.sort((left, right) => Date.parse(left.net) - Date.parse(right.net));
  completed.sort((left, right) => Date.parse(right.net) - Date.parse(left.net));
  return { active, completed, upcoming };
}

export function selectNextLaunch(
  records: readonly LaunchRecord[],
  nowUnixMs = Date.now(),
): LaunchRecord | null {
  const recentlyOpenedWindow = records.find((launch) => {
    const launchTime = Date.parse(launch.net);
    return launchTime < nowUnixMs && nowUnixMs - launchTime <= 2 * 60 * 60 * 1_000;
  });
  return recentlyOpenedWindow
    ?? records.find((launch) => Date.parse(launch.net) >= nowUnixMs)
    ?? records[0]
    ?? null;
}

export function filterLaunchTimeline(
  records: readonly LaunchRecord[],
  options: {
    nowUnixMs: number;
    query: string;
    range: LaunchTimelineRange;
    tab: LaunchQueueTab;
  },
): LaunchRecord[] {
  const normalizedQuery = options.query.trim().toLocaleLowerCase();
  const rangeMilliseconds = options.range === "sevenDays"
    ? 7 * 86_400_000
    : options.range === "thirtyDays"
      ? 30 * 86_400_000
      : Number.POSITIVE_INFINITY;

  return records.filter((launch) => {
    const launchTime = Date.parse(launch.net);
    if (options.range !== "all" && Number.isFinite(launchTime)) {
      const distance = options.tab === "completed"
        ? options.nowUnixMs - launchTime
        : launchTime - options.nowUnixMs;
      if (distance > rangeMilliseconds) return false;
    }
    if (!normalizedQuery) return true;
    return [
      launch.name,
      launch.missionName,
      launch.rocketName,
      launch.agencyName,
      launch.padName,
      launch.locationName,
      launch.countryName,
      launch.orbitName,
      launch.orbitAbbreviation,
      ...launch.payloadNames,
      ...launch.programNames,
    ].some((value) => value?.toLocaleLowerCase().includes(normalizedQuery));
  });
}

export function launchStatusTranslationKey(statusId: number | null): LaunchStatusTranslationKey {
  if (statusId === launchStatusIds.go) return "go";
  if (statusId === launchStatusIds.tbd) return "tbd";
  if (statusId === launchStatusIds.success) return "success";
  if (statusId === launchStatusIds.failure) return "failure";
  if (statusId === launchStatusIds.hold) return "hold";
  if (statusId === launchStatusIds.inFlight) return "inFlight";
  if (statusId === launchStatusIds.partialFailure) return "partialFailure";
  if (statusId === launchStatusIds.tbc) return "tbc";
  if (statusId === launchStatusIds.deployed) return "deployed";
  return "unknown";
}

export function launchStatusTone(
  statusId: number | null,
): "go" | "tbd" | "hold" | "success" | "failure" | "other" {
  if (statusId === launchStatusIds.go || statusId === launchStatusIds.inFlight) return "go";
  if (statusId === launchStatusIds.tbd || statusId === launchStatusIds.tbc) return "tbd";
  if (statusId === launchStatusIds.hold) return "hold";
  if (statusId === launchStatusIds.success || statusId === launchStatusIds.deployed) return "success";
  if (statusId === launchStatusIds.failure || statusId === launchStatusIds.partialFailure) return "failure";
  return "other";
}
