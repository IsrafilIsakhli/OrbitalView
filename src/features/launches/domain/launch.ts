import { z } from "zod";

const nullableText = z.string().nullable().optional();
const agencyTypeSchema = z.union([
  z.string(),
  z.object({ name: z.string() }).passthrough(),
]).nullable().optional();
const nullableNumber = z.union([z.number(), z.string()])
  .nullable()
  .optional()
  .transform((value) => {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  });

const linkSchema = z.object({
  url: nullableText,
}).passthrough();

const imageSchema = z.object({
  credit: nullableText,
  image_url: nullableText,
  license: z.object({
    link: nullableText,
    name: nullableText,
  }).nullable().optional(),
  thumbnail_url: nullableText,
}).passthrough();

const rocketConfigurationSchema = z.object({
  active: z.boolean().optional(),
  apogee: nullableNumber,
  description: nullableText,
  diameter: nullableNumber,
  failed_launches: nullableNumber,
  families: z.array(z.object({ name: z.string().min(1) }).passthrough()).optional(),
  full_name: nullableText,
  gto_capacity: nullableNumber,
  id: z.number().optional(),
  info_url: nullableText,
  is_placeholder: z.boolean().optional(),
  launch_cost: nullableNumber,
  launch_mass: nullableNumber,
  length: nullableNumber,
  leo_capacity: nullableNumber,
  maiden_flight: nullableText,
  manufacturer: z.object({
    name: z.string().min(1),
  }).nullable().optional(),
  max_stage: nullableNumber,
  min_stage: nullableNumber,
  name: z.string().min(1),
  pending_launches: nullableNumber,
  successful_launches: nullableNumber,
  to_thrust: nullableNumber,
  total_launch_count: nullableNumber,
  variant: nullableText,
  wiki_url: nullableText,
}).passthrough();

const launchSchema = z.object({
  id: z.string().min(1),
  last_updated: nullableText,
  launch_designator: nullableText,
  url: nullableText,
  image: imageSchema.nullable().optional(),
  launch_service_provider: z.object({
    abbrev: nullableText,
    id: z.number().optional(),
    name: z.string().min(1),
    type: agencyTypeSchema,
  }).nullable().optional(),
  mission: z.object({
    description: nullableText,
    id: z.number().optional(),
    name: z.string().min(1),
    orbit: z.object({
      abbrev: nullableText,
      name: nullableText,
    }).nullable().optional(),
    type: nullableText,
    vid_urls: z.array(linkSchema).optional(),
  }).nullable().optional(),
  name: z.string().min(1),
  net: z.string().min(1),
  pad: z.object({
    country: z.object({
      alpha_2_code: nullableText,
      name: nullableText,
    }).nullable().optional(),
    id: z.number().optional(),
    image: imageSchema.nullable().optional(),
    latitude: nullableNumber,
    location: z.object({
      map_image: nullableText,
      name: nullableText,
      timezone_name: nullableText,
    }).nullable().optional(),
    longitude: nullableNumber,
    map_url: nullableText,
    name: z.string().min(1),
  }).nullable().optional(),
  probability: nullableNumber,
  program: z.array(z.object({ name: z.string().min(1) }).passthrough()).optional(),
  rocket: z.object({
    configuration: rocketConfigurationSchema.nullable().optional(),
    spacecraftflight: z.object({
      spacecraft: z.object({ name: z.string().min(1) }).nullable().optional(),
    }).nullable().optional(),
  }).nullable().optional(),
  status: z.object({
    id: z.number().int().optional(),
    abbrev: nullableText,
    description: nullableText,
    name: z.string().min(1),
  }).nullable().optional(),
  vid_urls: z.array(linkSchema).optional(),
  webcast_live: z.boolean().optional(),
  weather_concerns: nullableText,
  window_end: nullableText,
  window_start: nullableText,
}).passthrough();

const eventSchema = z.object({
  date: z.string().min(1),
  description: nullableText,
  id: z.number(),
  image: imageSchema.nullable().optional(),
  info_urls: z.array(linkSchema).optional(),
  location: nullableText,
  name: z.string().min(1),
  type: z.object({ name: z.string().min(1) }).nullable().optional(),
  vid_urls: z.array(linkSchema).optional(),
  webcast_live: z.boolean().optional(),
}).passthrough();

export interface LaunchImage {
  credit: string | null;
  licenseName: string | null;
  licenseUrl: string | null;
  thumbnailUrl: string | null;
  url: string | null;
}

export interface RocketRecord {
  active: boolean | null;
  apogeeKm: number | null;
  description: string | null;
  diameterMeters: number | null;
  failedLaunches: number | null;
  familyName: string | null;
  fullName: string;
  gtoCapacityKg: number | null;
  id: string | null;
  infoUrl: string | null;
  isPlaceholder: boolean;
  launchCostUsd: number | null;
  launchMassTonnes: number | null;
  lengthMeters: number | null;
  leoCapacityKg: number | null;
  maidenFlight: string | null;
  manufacturerName: string | null;
  maxStages: number | null;
  minStages: number | null;
  name: string;
  pendingLaunches: number | null;
  successfulLaunches: number | null;
  thrustKilonewtons: number | null;
  totalLaunchCount: number | null;
  variant: string | null;
  wikiUrl: string | null;
}

export interface LaunchRecord {
  agencyAbbreviation: string | null;
  agencyName: string | null;
  agencyType: string | null;
  countryCode: string | null;
  countryName: string | null;
  id: string;
  image: LaunchImage | null;
  lastUpdated: string | null;
  latitude: number | null;
  launchDesignator: string | null;
  locationName: string | null;
  longitude: number | null;
  missionDescription: string | null;
  missionName: string | null;
  missionType: string | null;
  name: string;
  net: string;
  orbitAbbreviation: string | null;
  orbitName: string | null;
  padName: string | null;
  padId: string | null;
  padMapUrl: string | null;
  payloadNames: string[];
  probability: number | null;
  programNames: string[];
  rocketName: string | null;
  rocket: RocketRecord | null;
  sourceUrl: string | null;
  statusAbbreviation: string | null;
  statusDescription: string | null;
  statusId: number | null;
  statusName: string | null;
  streamUrl: string | null;
  webcastLive: boolean;
  weatherConcerns: string | null;
  windowEnd: string | null;
  windowStart: string | null;
}

export interface SpaceEventRecord {
  date: string;
  description: string | null;
  id: string;
  image: LaunchImage | null;
  infoUrl: string | null;
  location: string | null;
  name: string;
  streamUrl: string | null;
  typeName: string | null;
  webcastLive: boolean;
}

export interface SpaceIntelligence {
  eventCount: number;
  events: SpaceEventRecord[];
  expiresAt: string;
  fetchedAt: string;
  launchCount: number;
  launches: LaunchRecord[];
  rejectedEventCount: number;
  rejectedLaunchCount: number;
  source: string;
  stale: boolean;
}

export type MissionLifecycle = "upcoming" | "active" | "completed" | "unknown";

export const launchStatusIds = {
  go: 1,
  tbd: 2,
  success: 3,
  failure: 4,
  hold: 5,
  inFlight: 6,
  partialFailure: 7,
  tbc: 8,
  deployed: 9,
} as const;

export function classifyLaunchStatus(statusId: number | null): MissionLifecycle {
  if (statusId === launchStatusIds.inFlight) return "active";
  if (new Set<number>([
    launchStatusIds.success,
    launchStatusIds.failure,
    launchStatusIds.partialFailure,
    launchStatusIds.deployed,
  ]).has(statusId ?? -1)) return "completed";
  if (new Set<number>([
    launchStatusIds.go,
    launchStatusIds.tbd,
    launchStatusIds.hold,
    launchStatusIds.tbc,
  ]).has(statusId ?? -1)) return "upcoming";
  return "unknown";
}

interface SpaceIntelligenceMetadata {
  eventCount: number;
  expiresAt: string;
  fetchedAt: string;
  launchCount: number;
  source: string;
  stale: boolean;
}

export function createSpaceIntelligence(
  launchCandidates: unknown[],
  eventCandidates: unknown[],
  metadata: SpaceIntelligenceMetadata,
): SpaceIntelligence {
  const launches: LaunchRecord[] = [];
  const events: SpaceEventRecord[] = [];
  let rejectedLaunchCount = 0;
  let rejectedEventCount = 0;

  for (const candidate of launchCandidates) {
    const parsed = launchSchema.safeParse(candidate);
    if (!parsed.success || !isValidDate(parsed.data.net)) {
      rejectedLaunchCount += 1;
      continue;
    }
    const launch = parsed.data;
    const configuration = launch.rocket?.configuration;
    const mission = launch.mission;
    const pad = launch.pad;
    launches.push({
      agencyAbbreviation: launch.launch_service_provider?.abbrev ?? null,
      agencyName: launch.launch_service_provider?.name ?? null,
      agencyType: typeof launch.launch_service_provider?.type === "string"
        ? launch.launch_service_provider.type
        : launch.launch_service_provider?.type?.name ?? null,
      countryCode: pad?.country?.alpha_2_code ?? null,
      countryName: pad?.country?.name ?? null,
      id: launch.id,
      image: normalizeImage(launch.image),
      lastUpdated: launch.last_updated ?? null,
      latitude: pad?.latitude ?? null,
      launchDesignator: launch.launch_designator ?? null,
      locationName: pad?.location?.name ?? null,
      longitude: pad?.longitude ?? null,
      missionDescription: mission?.description ?? null,
      missionName: mission?.name ?? null,
      missionType: mission?.type ?? null,
      name: launch.name,
      net: launch.net,
      orbitAbbreviation: mission?.orbit?.abbrev ?? null,
      orbitName: mission?.orbit?.name ?? null,
      padName: pad?.name ?? null,
      padId: pad?.id === undefined ? null : String(pad.id),
      padMapUrl: safeHttpsUrl(pad?.map_url),
      payloadNames: extractPayloadNames(candidate, launch.rocket?.spacecraftflight?.spacecraft?.name),
      probability: launch.probability ?? null,
      programNames: launch.program?.map((program) => program.name) ?? [],
      rocketName: configuration?.full_name ?? configuration?.name ?? null,
      rocket: normalizeRocket(configuration),
      sourceUrl: safeHttpsUrl(launch.url),
      statusAbbreviation: launch.status?.abbrev ?? null,
      statusDescription: launch.status?.description ?? null,
      statusId: launch.status?.id ?? null,
      statusName: launch.status?.name ?? null,
      streamUrl: firstHttpsUrl([
        ...(launch.vid_urls ?? []),
        ...(mission?.vid_urls ?? []),
      ]),
      webcastLive: launch.webcast_live ?? false,
      weatherConcerns: launch.weather_concerns ?? null,
      windowEnd: launch.window_end ?? null,
      windowStart: launch.window_start ?? null,
    });
  }

  for (const candidate of eventCandidates) {
    const parsed = eventSchema.safeParse(candidate);
    if (!parsed.success || !isValidDate(parsed.data.date)) {
      rejectedEventCount += 1;
      continue;
    }
    const event = parsed.data;
    events.push({
      date: event.date,
      description: event.description ?? null,
      id: `event:${event.id}`,
      image: normalizeImage(event.image),
      infoUrl: firstHttpsUrl(event.info_urls ?? []),
      location: event.location ?? null,
      name: event.name,
      streamUrl: firstHttpsUrl(event.vid_urls ?? []),
      typeName: event.type?.name ?? null,
      webcastLive: event.webcast_live ?? false,
    });
  }

  launches.sort((left, right) => Date.parse(left.net) - Date.parse(right.net));
  events.sort((left, right) => Date.parse(left.date) - Date.parse(right.date));
  return {
    ...metadata,
    events,
    launches,
    rejectedEventCount,
    rejectedLaunchCount,
  };
}

export function createLaunchRecord(candidate: unknown): LaunchRecord | null {
  const normalized = createSpaceIntelligence([candidate], [], {
    eventCount: 0,
    expiresAt: new Date(0).toISOString(),
    fetchedAt: new Date(0).toISOString(),
    launchCount: 1,
    source: "Launch Library 2.3",
    stale: false,
  });
  return normalized.launches[0] ?? null;
}

function extractPayloadNames(candidate: unknown, primaryName: string | undefined): string[] {
  const names = new Set<string>();
  if (primaryName?.trim()) names.add(primaryName.trim());
  if (!candidate || typeof candidate !== "object") return [...names];

  const source = candidate as Record<string, unknown>;
  const mission = asRecord(source.mission);
  const rocket = asRecord(source.rocket);
  for (const value of [source.payloads, mission?.payloads, rocket?.payloads]) {
    collectNamedRecords(value, names);
  }
  const stage = asRecord(rocket?.spacecraft_stage);
  collectNamedRecords(stage?.spacecraft, names);
  collectNamedRecords(stage?.payloads, names);
  return [...names];
}

function collectNamedRecords(value: unknown, names: Set<string>): void {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  for (const item of values) {
    if (typeof item === "string" && item.trim()) {
      names.add(item.trim());
      continue;
    }
    const record = asRecord(item);
    const name = typeof record?.name === "string" ? record.name.trim() : "";
    if (name) names.add(name);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

type LaunchConfigurationInput = z.infer<typeof rocketConfigurationSchema>;

export function createRocketRecord(candidate: unknown): RocketRecord | null {
  const parsed = rocketConfigurationSchema.safeParse(candidate);
  return parsed.success ? normalizeRocket(parsed.data) : null;
}

function normalizeRocket(
  configuration: LaunchConfigurationInput | null | undefined,
): RocketRecord | null {
  if (!configuration) return null;
  return {
    active: configuration.active ?? null,
    apogeeKm: configuration.apogee ?? null,
    description: configuration.description ?? null,
    diameterMeters: configuration.diameter ?? null,
    failedLaunches: configuration.failed_launches ?? null,
    familyName: configuration.families?.[0]?.name ?? null,
    fullName: configuration.full_name ?? configuration.name,
    gtoCapacityKg: configuration.gto_capacity ?? null,
    id: configuration.id === undefined ? null : String(configuration.id),
    infoUrl: safeHttpsUrl(configuration.info_url),
    isPlaceholder: configuration.is_placeholder ?? false,
    launchCostUsd: configuration.launch_cost ?? null,
    launchMassTonnes: configuration.launch_mass ?? null,
    lengthMeters: configuration.length ?? null,
    leoCapacityKg: configuration.leo_capacity ?? null,
    maidenFlight: configuration.maiden_flight ?? null,
    manufacturerName: configuration.manufacturer?.name ?? null,
    maxStages: configuration.max_stage ?? null,
    minStages: configuration.min_stage ?? null,
    name: configuration.name,
    pendingLaunches: configuration.pending_launches ?? null,
    successfulLaunches: configuration.successful_launches ?? null,
    thrustKilonewtons: configuration.to_thrust ?? null,
    totalLaunchCount: configuration.total_launch_count ?? null,
    variant: configuration.variant ?? null,
    wikiUrl: safeHttpsUrl(configuration.wiki_url),
  };
}

function normalizeImage(
  image: z.infer<typeof imageSchema> | null | undefined,
): LaunchImage | null {
  const url = safeHttpsUrl(image?.image_url);
  const thumbnailUrl = safeHttpsUrl(image?.thumbnail_url);
  if (!url && !thumbnailUrl) return null;
  return {
    credit: image?.credit ?? null,
    licenseName: image?.license?.name ?? null,
    licenseUrl: safeHttpsUrl(image?.license?.link),
    thumbnailUrl,
    url,
  };
}

function firstHttpsUrl(
  links: Array<{ url?: string | null | undefined }>,
): string | null {
  for (const link of links) {
    const url = safeHttpsUrl(link.url);
    if (url) return url;
  }
  return null;
}

export function safeHttpsUrl(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function isValidDate(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}
