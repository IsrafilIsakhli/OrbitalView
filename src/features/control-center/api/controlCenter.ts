import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

export const providerIds = ["celestrak", "launchLibrary", "nasa", "noaaSwpc", "openMeteo", "spaceflightNews"] as const;
export type ProviderId = (typeof providerIds)[number];

const providerStatusSchema = z.enum([
  "healthy",
  "refreshing",
  "stale",
  "degraded",
  "unavailable",
]);

const providerHealthSchema = z.object({
  backoffUntilUnixMs: z.number().int().nonnegative().nullable(),
  cache: z.object({
    bytes: z.number().int().nonnegative(),
    entryCount: z.number().int().nonnegative(),
  }),
  expiresAtUnixMs: z.number().int().nonnegative().nullable(),
  itemCount: z.number().int().nonnegative(),
  lastAttemptAtUnixMs: z.number().int().nonnegative().nullable(),
  lastErrorCode: z.string().nullable(),
  lastLatencyMs: z.number().int().nonnegative().nullable(),
  lastSuccessAtUnixMs: z.number().int().nonnegative().nullable(),
  provider: z.enum(providerIds),
  retryCount: z.number().int().nonnegative(),
  status: providerStatusSchema,
});

const snapshotSchema = z.object({
  backgroundSyncEnabled: z.boolean(),
  generatedAtUnixMs: z.number().int().nonnegative(),
  nasaCredential: z.object({
    configured: z.boolean(),
    source: z.enum(["credentialStore", "environment", "development", "unconfigured"]),
    verified: z.boolean().nullable(),
  }),
  providers: z.array(providerHealthSchema),
  schedulerState: z.enum(["running", "paused"]),
  runtime: z.object({
    appVersion: z.string(),
    architecture: z.string(),
    debugBuild: z.boolean(),
    operatingSystem: z.string(),
  }),
  spaceNews: z.object({
    databaseBytes: z.number().int().nonnegative(),
    failedTranslations: z.number().int().nonnegative(),
    imageCacheBytes: z.number().int().nonnegative(),
    itemCount: z.number().int().nonnegative(),
    lastSuccessAtUnixMs: z.number().int().nonnegative().nullable(),
    pendingTranslations: z.number().int().nonnegative(),
    translatedItems: z.number().int().nonnegative(),
    translationGatewayConfigured: z.boolean(),
  }),
  totalCacheBytes: z.number().int().nonnegative(),
});

const refreshResultSchema = z.object({
  fetchedAtUnixMs: z.number().int().nonnegative(),
  itemCount: z.number().int().nonnegative(),
  provider: z.enum(providerIds),
  suggestedIntervalMs: z.number().int().positive(),
  stale: z.boolean(),
});

export type ProviderHealth = z.infer<typeof providerHealthSchema>;
export type ProviderHealthStatus = z.infer<typeof providerStatusSchema>;
export type ControlCenterSnapshot = z.infer<typeof snapshotSchema>;
export type RefreshProviderResult = z.infer<typeof refreshResultSchema>;

export async function fetchControlCenterSnapshot(): Promise<ControlCenterSnapshot> {
  return snapshotSchema.parse(await invoke("control_center_snapshot"));
}

export async function refreshProvider(provider: ProviderId): Promise<RefreshProviderResult> {
  return refreshResultSchema.parse(await invoke("refresh_provider", { provider }));
}

export async function clearProviderCache(provider: ProviderId): Promise<void> {
  await invoke("clear_provider_cache", { provider });
}

export async function setNativeBackgroundSync(enabled: boolean): Promise<void> {
  await invoke("set_background_sync_enabled", { enabled });
}
