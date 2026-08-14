import type { OMMJsonObject } from "satellite.js";
import { z } from "zod";

const orbitalNumber = z.union([z.number(), z.string()]).transform(Number);

const ommSchema = z.object({
  ARG_OF_PERICENTER: orbitalNumber,
  BSTAR: orbitalNumber,
  CLASSIFICATION_TYPE: z.enum(["U", "C"]).optional(),
  ECCENTRICITY: orbitalNumber,
  ELEMENT_SET_NO: orbitalNumber,
  EPHEMERIS_TYPE: z.union([z.literal(0), z.literal("0")]).optional(),
  EPOCH: z.string().min(1),
  INCLINATION: orbitalNumber,
  MEAN_ANOMALY: orbitalNumber,
  MEAN_MOTION: orbitalNumber,
  MEAN_MOTION_DDOT: orbitalNumber,
  MEAN_MOTION_DOT: orbitalNumber,
  NORAD_CAT_ID: z.union([z.number(), z.string()]),
  OBJECT_ID: z.string(),
  OBJECT_NAME: z.string().min(1),
  RA_OF_ASC_NODE: orbitalNumber,
  REV_AT_EPOCH: orbitalNumber.optional(),
}).passthrough();

const satcatSchema = z.object({
  APOGEE: z.number().nullable().optional(),
  DECAY_DATE: z.string().nullable().optional(),
  INCLINATION: z.number().nullable().optional(),
  LAUNCH_DATE: z.string().nullable().optional(),
  LAUNCH_SITE: z.string().nullable().optional(),
  NORAD_CAT_ID: z.union([z.number(), z.string()]),
  OBJECT_ID: z.string().nullable().optional(),
  OBJECT_NAME: z.string().optional(),
  OBJECT_TYPE: z.string().nullable().optional(),
  OPS_STATUS_CODE: z.string().nullable().optional(),
  OWNER: z.string().nullable().optional(),
  PERIGEE: z.number().nullable().optional(),
  PERIOD: z.number().nullable().optional(),
}).passthrough();

export const satelliteCategories = [
  "station",
  "rocket-body",
  "navigation",
  "weather",
  "science",
  "communications",
  "starlink",
  "debris",
  "other",
] as const;

export type SatelliteCategory = (typeof satelliteCategories)[number];
export type SatelliteCategoryCounts = Record<SatelliteCategory, number>;

export interface SatelliteRecord {
  apogeeKm: number | null;
  argumentOfPerigeeDegrees: number;
  category: SatelliteCategory;
  eccentricity: number;
  epoch: string;
  id: string;
  inclinationDegrees: number;
  internationalDesignator: string;
  launchDate: string | null;
  launchSiteCode: string | null;
  meanAnomalyDegrees: number;
  meanMotionRevolutionsPerDay: number;
  name: string;
  noradId: string;
  objectType: string | null;
  omm: OMMJsonObject;
  operationalStatusCode: string | null;
  ownerCode: string | null;
  perigeeKm: number | null;
  periodMinutes: number;
  rightAscensionDegrees: number;
}

export interface SatelliteCatalog {
  catalogObjectCount: number;
  expiresAt: string;
  fetchedAt: string;
  rejectedObjectCount: number;
  satellites: SatelliteRecord[];
  source: string;
  stale: boolean;
}

export function countSatelliteCategories(
  satellites: readonly SatelliteRecord[],
): SatelliteCategoryCounts {
  const counts = Object.fromEntries(
    satelliteCategories.map((category) => [category, 0]),
  ) as SatelliteCategoryCounts;
  for (const satellite of satellites) {
    counts[satellite.category] += 1;
  }
  return counts;
}

export function createSatelliteCatalog(
  orbitalData: unknown[],
  catalogData: unknown[],
  metadata: Omit<
    SatelliteCatalog,
    "rejectedObjectCount" | "satellites"
  >,
): SatelliteCatalog {
  const catalogByNoradId = new Map<string, z.infer<typeof satcatSchema>>();
  for (const candidate of catalogData) {
    const parsed = satcatSchema.safeParse(candidate);
    if (parsed.success) {
      catalogByNoradId.set(String(parsed.data.NORAD_CAT_ID), parsed.data);
    }
  }

  const satellites: SatelliteRecord[] = [];
  let rejectedObjectCount = 0;
  for (const candidate of orbitalData) {
    const parsed = ommSchema.safeParse(candidate);
    if (!parsed.success || !Number.isFinite(parsed.data.MEAN_MOTION)) {
      rejectedObjectCount += 1;
      continue;
    }
    const omm = parsed.data as OMMJsonObject;
    const noradId = String(parsed.data.NORAD_CAT_ID);
    const catalog = catalogByNoradId.get(noradId);
    const objectType = catalog?.OBJECT_TYPE ?? null;
    satellites.push({
      apogeeKm: catalog?.APOGEE ?? null,
      argumentOfPerigeeDegrees: parsed.data.ARG_OF_PERICENTER,
      category: categorizeSatellite(parsed.data.OBJECT_NAME, objectType),
      eccentricity: parsed.data.ECCENTRICITY,
      epoch: parsed.data.EPOCH,
      id: `norad:${noradId}`,
      inclinationDegrees: parsed.data.INCLINATION,
      internationalDesignator:
        parsed.data.OBJECT_ID || catalog?.OBJECT_ID || "",
      launchDate: catalog?.LAUNCH_DATE ?? null,
      launchSiteCode: catalog?.LAUNCH_SITE ?? null,
      meanAnomalyDegrees: parsed.data.MEAN_ANOMALY,
      meanMotionRevolutionsPerDay: parsed.data.MEAN_MOTION,
      name: parsed.data.OBJECT_NAME,
      noradId,
      objectType,
      omm,
      operationalStatusCode: catalog?.OPS_STATUS_CODE ?? null,
      ownerCode: catalog?.OWNER ?? null,
      perigeeKm: catalog?.PERIGEE ?? null,
      periodMinutes:
        catalog?.PERIOD ?? 1_440 / parsed.data.MEAN_MOTION,
      rightAscensionDegrees: parsed.data.RA_OF_ASC_NODE,
    });
  }

  return {
    ...metadata,
    rejectedObjectCount,
    satellites,
  };
}

function categorizeSatellite(
  name: string,
  objectType: string | null,
): SatelliteCategory {
  const normalized = name.toLocaleUpperCase();
  const normalizedType = objectType?.toLocaleUpperCase() ?? "";
  if (
    normalizedType.includes("ROCKET") ||
    /(^|\s)(R\/B|AKM)(\s|$)/.test(normalized)
  ) {
    return "rocket-body";
  }
  if (normalizedType.includes("DEBRIS") || normalized.includes(" DEB")) {
    return "debris";
  }
  if (
    normalized.includes("ISS") ||
    normalized.includes("TIANGONG") ||
    normalized.includes("CSS")
  ) {
    return "station";
  }
  if (normalized.includes("STARLINK")) {
    return "starlink";
  }
  if (
    normalized.includes("GPS") ||
    normalized.includes("GLONASS") ||
    normalized.includes("GALILEO") ||
    normalized.includes("BEIDOU")
  ) {
    return "navigation";
  }
  if (
    normalized.includes("NOAA") ||
    normalized.includes("METEOR") ||
    normalized.includes("GOES") ||
    normalized.includes("METOP")
  ) {
    return "weather";
  }
  if (
    /(^|[\s-])(HST|JWST|TESS|GAIA|SWIFT|FERMI|CHANDRA|EUCLID|CHEOPS)([\s-]|$)/.test(normalized) ||
    normalized.includes("HUBBLE") ||
    normalized.includes("LANDSAT") ||
    normalized.includes("SENTINEL") ||
    normalized.includes("ICESAT") ||
    normalized.includes("GRACE") ||
    normalized.includes("CALIPSO") ||
    normalized.includes("CLOUDSAT") ||
    normalized.includes("EARTHCARE") ||
    normalized.includes("AQUA") ||
    normalized.includes("TERRA") ||
    normalized.includes("AURA") ||
    normalized.includes("XMM-NEWTON") ||
    normalized.includes("OCO-") ||
    normalized.includes("SMAP") ||
    normalized.includes("SWOT")
  ) {
    return "science";
  }
  if (
    normalized.includes("INTELSAT") ||
    normalized.includes("EUTELSAT") ||
    normalized.includes("ONEWEB") ||
    normalized.includes("IRIDIUM")
  ) {
    return "communications";
  }
  return "other";
}
