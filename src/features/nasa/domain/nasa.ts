import { z } from "zod";

export const providerStatusSchema = z.enum(["fresh", "stale", "unavailable"]);
export type ProviderStatus = z.infer<typeof providerStatusSchema>;
export type NasaComponentName = "apod" | "neo" | "cmes" | "flares" | "storms";

export interface ProviderDiagnostics {
  cacheHit: boolean;
  durationMs: number;
  errorType: string | null;
  provider: string;
  request: string;
  retryCount: number;
  status: ProviderStatus;
}

export interface NasaComponentInput {
  data: unknown;
  diagnostics: ProviderDiagnostics;
  expiresAtUnixMs: number;
  fetchedAtUnixMs: number;
  rateLimitRemaining: number | null;
  source: string;
  stale: boolean;
  status: ProviderStatus;
}

export interface NasaComponentMetadata {
  diagnostics: ProviderDiagnostics;
  expiresAt: string | null;
  fetchedAt: string | null;
  name: NasaComponentName;
  rateLimitRemaining: number | null;
  source: string;
  stale: boolean;
  status: ProviderStatus;
}

export interface DataProvenance {
  isStale: boolean;
  lastUpdated: string | null;
  observedAt: string | null;
  retrievedAt: string | null;
  source: string;
  sourceId: string;
}

export interface AstronomyPicture extends DataProvenance {
  copyright: string | null;
  date: string;
  explanation: string;
  hdUrl: string | null;
  mediaType: "image" | "video";
  thumbnailUrl: string | null;
  title: string;
  url: string;
}

export interface NearEarthApproach extends DataProvenance {
  absoluteMagnitude: number | null;
  approachAt: string;
  estimatedDiameterMaxKm: number | null;
  estimatedDiameterMinKm: number | null;
  id: string;
  lunarDistance: number | null;
  missDistanceKm: number | null;
  name: string;
  nasaUrl: string | null;
  orbitingBody: string;
  potentiallyHazardous: boolean;
  relativeVelocityKps: number | null;
}

export type DonkiEventType = "cme" | "flare" | "storm";

export interface DonkiEvent extends DataProvenance {
  eventType: DonkiEventType;
  id: string;
  link: string | null;
  location: string | null;
  magnitudeLabel: string | null;
  occurredAt: string;
  summary: string | null;
}

export interface NasaIntelligence {
  apiKeyConfigured: boolean;
  apod: AstronomyPicture | null;
  approaches: NearEarthApproach[];
  components: Record<NasaComponentName, NasaComponentMetadata>;
  overallStatus: ProviderStatus | "degraded";
  rejectedRecordCount: number;
  retrievedAt: string;
  spaceWeatherEvents: DonkiEvent[];
}

export interface NasaIntelligenceInput {
  apiKeyConfigured: boolean;
  apod: NasaComponentInput;
  cmes: NasaComponentInput;
  flares: NasaComponentInput;
  neo: NasaComponentInput;
  retrievedAtUnixMs: number;
  storms: NasaComponentInput;
}

const nullableString = z.string().nullable().optional();
const nullableNumber = z.number().finite().nullable().optional();
const apodSchema = z.object({
  copyright: nullableString,
  date: z.string().min(1),
  explanation: z.string().min(1),
  hdurl: nullableString,
  media_type: z.enum(["image", "video"]),
  thumbnail_url: nullableString,
  title: z.string().min(1),
  url: z.string().min(1),
}).passthrough();

const closeApproachSchema = z.object({
  close_approach_date: z.string().min(1),
  close_approach_date_full: nullableString,
  miss_distance: z.object({
    kilometers: z.union([z.string(), z.number()]).nullable().optional(),
    lunar: z.union([z.string(), z.number()]).nullable().optional(),
  }).passthrough(),
  orbiting_body: z.string().min(1),
  relative_velocity: z.object({
    kilometers_per_second: z.union([z.string(), z.number()]).nullable().optional(),
  }).passthrough(),
}).passthrough();

const neoSchema = z.object({
  absolute_magnitude_h: nullableNumber,
  close_approach_data: z.array(closeApproachSchema),
  estimated_diameter: z.object({
    kilometers: z.object({
      estimated_diameter_max: nullableNumber,
      estimated_diameter_min: nullableNumber,
    }).passthrough(),
  }).passthrough(),
  id: z.string().min(1),
  is_potentially_hazardous_asteroid: z.boolean(),
  name: z.string().min(1),
  nasa_jpl_url: nullableString,
  orbital_data: z.object({
    last_observation_date: nullableString,
  }).passthrough().nullable().optional(),
}).passthrough();

const neoFeedSchema = z.object({
  near_earth_objects: z.record(z.string(), z.array(z.unknown())),
}).passthrough();

const cmeSchema = z.object({
  activityID: z.string().min(1),
  activeRegionNum: z.number().nullable().optional(),
  cmeAnalyses: z.array(z.object({
    isMostAccurate: z.boolean().nullable().optional(),
    speed: z.number().finite().nullable().optional(),
  }).passthrough()).nullable().optional(),
  link: nullableString,
  note: nullableString,
  sourceLocation: nullableString,
  startTime: z.string().min(1),
}).passthrough();

const flareSchema = z.object({
  activeRegionNum: z.number().nullable().optional(),
  beginTime: z.string().min(1),
  classType: nullableString,
  flrID: z.string().min(1),
  link: nullableString,
  note: nullableString,
  peakTime: nullableString,
  sourceLocation: nullableString,
}).passthrough();

const stormSchema = z.object({
  allKpIndex: z.array(z.object({
    kpIndex: z.number().finite().nullable().optional(),
    observedTime: nullableString,
  }).passthrough()).nullable().optional(),
  gstID: z.string().min(1),
  link: nullableString,
  startTime: z.string().min(1),
}).passthrough();

export function createNasaIntelligence(input: NasaIntelligenceInput): NasaIntelligence {
  const components = {
    apod: componentMetadata("apod", input.apod),
    cmes: componentMetadata("cmes", input.cmes),
    flares: componentMetadata("flares", input.flares),
    neo: componentMetadata("neo", input.neo),
    storms: componentMetadata("storms", input.storms),
  } satisfies Record<NasaComponentName, NasaComponentMetadata>;
  let rejectedRecordCount = 0;

  const parsedApod = input.apod.status === "unavailable"
    ? null
    : apodSchema.safeParse(input.apod.data);
  const apod = parsedApod && parsedApod.success
    ? normalizeApod(parsedApod.data, components.apod)
    : null;
  if (parsedApod && !parsedApod.success) rejectedRecordCount += 1;

  const approaches: NearEarthApproach[] = [];
  if (input.neo.status !== "unavailable") {
    const feed = neoFeedSchema.safeParse(input.neo.data);
    if (feed.success) {
      for (const candidate of Object.values(feed.data.near_earth_objects).flat()) {
        const parsed = neoSchema.safeParse(candidate);
        if (!parsed.success) {
          rejectedRecordCount += 1;
          continue;
        }
        for (const approach of parsed.data.close_approach_data) {
          const approachAt = normalizeApproachDate(
            approach.close_approach_date_full,
            approach.close_approach_date,
          );
          if (!approachAt) {
            rejectedRecordCount += 1;
            continue;
          }
          approaches.push(normalizeNeoApproach(parsed.data, approach, approachAt, components.neo));
        }
      }
    } else {
      rejectedRecordCount += 1;
    }
  }
  approaches.sort((left, right) => Date.parse(left.approachAt) - Date.parse(right.approachAt));

  const spaceWeatherEvents: DonkiEvent[] = [];
  rejectedRecordCount += appendCmes(input.cmes, components.cmes, spaceWeatherEvents);
  rejectedRecordCount += appendFlares(input.flares, components.flares, spaceWeatherEvents);
  rejectedRecordCount += appendStorms(input.storms, components.storms, spaceWeatherEvents);
  spaceWeatherEvents.sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt));

  return {
    apiKeyConfigured: input.apiKeyConfigured,
    apod,
    approaches,
    components,
    overallStatus: overallStatus(Object.values(components).map((component) => component.status)),
    rejectedRecordCount,
    retrievedAt: new Date(input.retrievedAtUnixMs).toISOString(),
    spaceWeatherEvents,
  };
}

function normalizeApod(
  apod: z.infer<typeof apodSchema>,
  metadata: NasaComponentMetadata,
): AstronomyPicture {
  return {
    ...provenance(metadata, `apod:${apod.date}`, apod.date, apod.date),
    copyright: apod.copyright?.trim() || null,
    date: apod.date,
    explanation: apod.explanation,
    hdUrl: safeHttpsUrl(apod.hdurl),
    mediaType: apod.media_type,
    thumbnailUrl: safeNasaImageUrl(apod.thumbnail_url),
    title: apod.title,
    url: apod.media_type === "image"
      ? safeNasaImageUrl(apod.url) ?? safeHttpsUrl(apod.url) ?? ""
      : safeHttpsUrl(apod.url) ?? "",
  };
}

function normalizeNeoApproach(
  neo: z.infer<typeof neoSchema>,
  approach: z.infer<typeof closeApproachSchema>,
  approachAt: string,
  metadata: NasaComponentMetadata,
): NearEarthApproach {
  return {
    ...provenance(metadata, neo.id, approachAt, neo.orbital_data?.last_observation_date ?? null),
    absoluteMagnitude: neo.absolute_magnitude_h ?? null,
    approachAt,
    estimatedDiameterMaxKm: neo.estimated_diameter.kilometers.estimated_diameter_max ?? null,
    estimatedDiameterMinKm: neo.estimated_diameter.kilometers.estimated_diameter_min ?? null,
    id: neo.id,
    lunarDistance: finiteNumber(approach.miss_distance.lunar),
    missDistanceKm: finiteNumber(approach.miss_distance.kilometers),
    name: neo.name,
    nasaUrl: safeHttpsUrl(neo.nasa_jpl_url),
    orbitingBody: approach.orbiting_body,
    potentiallyHazardous: neo.is_potentially_hazardous_asteroid,
    relativeVelocityKps: finiteNumber(approach.relative_velocity.kilometers_per_second),
  };
}

function appendCmes(
  component: NasaComponentInput,
  metadata: NasaComponentMetadata,
  target: DonkiEvent[],
): number {
  if (component.status === "unavailable") return 0;
  const candidates = z.array(z.unknown()).safeParse(component.data);
  if (!candidates.success) return 1;
  let rejected = 0;
  for (const candidate of candidates.data) {
    const parsed = cmeSchema.safeParse(candidate);
    if (!parsed.success || !isValidDate(parsed.data.startTime)) {
      rejected += 1;
      continue;
    }
    const item = parsed.data;
    const analysis = item.cmeAnalyses?.find((entry) => entry.isMostAccurate)
      ?? item.cmeAnalyses?.[0];
    target.push({
      ...provenance(metadata, item.activityID, item.startTime, null),
      eventType: "cme",
      id: item.activityID,
      link: safeHttpsUrl(item.link),
      location: item.sourceLocation ?? null,
      magnitudeLabel: analysis?.speed ? `${Math.round(analysis.speed)} km/s` : null,
      occurredAt: item.startTime,
      summary: item.note?.trim() || null,
    });
  }
  return rejected;
}

function appendFlares(
  component: NasaComponentInput,
  metadata: NasaComponentMetadata,
  target: DonkiEvent[],
): number {
  if (component.status === "unavailable") return 0;
  const candidates = z.array(z.unknown()).safeParse(component.data);
  if (!candidates.success) return 1;
  let rejected = 0;
  for (const candidate of candidates.data) {
    const parsed = flareSchema.safeParse(candidate);
    if (!parsed.success || !isValidDate(parsed.data.beginTime)) {
      rejected += 1;
      continue;
    }
    const item = parsed.data;
    target.push({
      ...provenance(metadata, item.flrID, item.beginTime, item.peakTime ?? null),
      eventType: "flare",
      id: item.flrID,
      link: safeHttpsUrl(item.link),
      location: item.sourceLocation ?? null,
      magnitudeLabel: item.classType ?? null,
      occurredAt: item.beginTime,
      summary: item.note?.trim() || null,
    });
  }
  return rejected;
}

function appendStorms(
  component: NasaComponentInput,
  metadata: NasaComponentMetadata,
  target: DonkiEvent[],
): number {
  if (component.status === "unavailable") return 0;
  const candidates = z.array(z.unknown()).safeParse(component.data);
  if (!candidates.success) return 1;
  let rejected = 0;
  for (const candidate of candidates.data) {
    const parsed = stormSchema.safeParse(candidate);
    if (!parsed.success || !isValidDate(parsed.data.startTime)) {
      rejected += 1;
      continue;
    }
    const item = parsed.data;
    const kp = Math.max(
      ...((item.allKpIndex ?? [])
        .map((entry) => entry.kpIndex)
        .filter((value): value is number => value !== null && value !== undefined)),
      Number.NEGATIVE_INFINITY,
    );
    const observations = item.allKpIndex
      ?.map((entry) => entry.observedTime)
      .filter((value): value is string => Boolean(value)) ?? [];
    const lastObservation = observations.length > 0
      ? observations[observations.length - 1] ?? null
      : null;
    target.push({
      ...provenance(metadata, item.gstID, item.startTime, lastObservation),
      eventType: "storm",
      id: item.gstID,
      link: safeHttpsUrl(item.link),
      location: null,
      magnitudeLabel: Number.isFinite(kp) ? `Kp ${kp.toFixed(1)}` : null,
      occurredAt: item.startTime,
      summary: null,
    });
  }
  return rejected;
}

function componentMetadata(
  name: NasaComponentName,
  input: NasaComponentInput,
): NasaComponentMetadata {
  return {
    diagnostics: input.diagnostics,
    expiresAt: timestamp(input.expiresAtUnixMs),
    fetchedAt: timestamp(input.fetchedAtUnixMs),
    name,
    rateLimitRemaining: input.rateLimitRemaining,
    source: input.source,
    stale: input.stale,
    status: input.status,
  };
}

function provenance(
  metadata: NasaComponentMetadata,
  sourceId: string,
  observedAt: string | null,
  lastUpdated: string | null,
): DataProvenance {
  return {
    isStale: metadata.stale,
    lastUpdated,
    observedAt,
    retrievedAt: metadata.fetchedAt,
    source: metadata.source,
    sourceId,
  };
}

function overallStatus(statuses: ProviderStatus[]): ProviderStatus | "degraded" {
  if (statuses.every((status) => status === "unavailable")) return "unavailable";
  if (statuses.every((status) => status === "fresh")) return "fresh";
  if (statuses.every((status) => status === "stale")) return "stale";
  return "degraded";
}

function normalizeApproachDate(full: string | null | undefined, date: string): string | null {
  if (full) {
    const match = /^(\d{4})-([A-Za-z]{3})-(\d{2})\s+(\d{2}):(\d{2})$/.exec(full);
    if (match) {
      const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        .indexOf(match[2] ?? "");
      if (month >= 0) {
        return new Date(Date.UTC(Number(match[1]), month, Number(match[3]), Number(match[4]), Number(match[5])))
          .toISOString();
      }
    }
  }
  const fallback = `${date}T00:00:00.000Z`;
  return isValidDate(fallback) ? fallback : null;
}

function safeNasaImageUrl(candidate: string | null | undefined): string | null {
  const value = safeHttpsUrl(candidate);
  if (!value) return null;
  const hostname = new URL(value).hostname.toLocaleLowerCase();
  return hostname === "nasa.gov" || hostname.endsWith(".nasa.gov") ? value : null;
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

function finiteNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function timestamp(value: number): string | null {
  return value > 0 ? new Date(value).toISOString() : null;
}

function isValidDate(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}
