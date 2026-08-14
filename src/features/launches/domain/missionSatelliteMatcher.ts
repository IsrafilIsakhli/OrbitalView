import type { SatelliteRecord } from "@/features/satellites/domain/satellite";

export interface MissionSatelliteMatch {
  isPrimary: boolean;
  satellite: SatelliteRecord;
}

export function matchMissionSatellites(
  launchDesignator: string | null,
  satellites: readonly SatelliteRecord[],
): MissionSatelliteMatch[] {
  const normalizedLaunch = normalizeLaunchDesignator(launchDesignator);
  if (!normalizedLaunch) return [];

  const matches = satellites
    .filter((satellite) => {
      const objectId = normalizeObjectDesignator(satellite.internationalDesignator);
      return objectId?.launch === normalizedLaunch;
    })
    .sort((left, right) => {
      const typeOrder = objectTypePriority(left.objectType) - objectTypePriority(right.objectType);
      return typeOrder || Number(left.noradId) - Number(right.noradId);
    });
  return matches.map((satellite, index) => ({ isPrimary: index === 0, satellite }));
}

export function normalizeLaunchDesignator(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLocaleUpperCase().replace(/_/g, "-") ?? "";
  const match = /^(\d{4})-(\d{3})$/.exec(normalized);
  return match ? `${match[1]!}-${match[2]!}` : null;
}

function normalizeObjectDesignator(value: string): { launch: string; piece: string } | null {
  const normalized = value.trim().toLocaleUpperCase().replace(/_/g, "-");
  const match = /^(\d{4})-(\d{3})([A-Z]{1,3})$/.exec(normalized);
  return match ? { launch: `${match[1]!}-${match[2]!}`, piece: match[3]! } : null;
}

function objectTypePriority(objectType: string | null): number {
  const normalized = objectType?.toLocaleUpperCase() ?? "";
  if (normalized.includes("PAYLOAD")) return 0;
  if (normalized.includes("ROCKET")) return 1;
  if (normalized.includes("DEBRIS")) return 2;
  return 3;
}
