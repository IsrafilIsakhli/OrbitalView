import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

import {
  createLaunchRecord,
  createSpaceIntelligence,
  type LaunchRecord,
} from "../domain/launch";

const listResponseSchema = z.object({
  expiresAtUnixMs: z.number().int().nonnegative(),
  fetchedAtUnixMs: z.number().int().nonnegative(),
  launchesData: z.array(z.unknown()),
  loadedCount: z.number().int().nonnegative(),
  providerCount: z.number().int().nonnegative(),
  source: z.string(),
  stale: z.boolean(),
});

const detailResponseSchema = z.object({
  data: z.unknown(),
  expiresAtUnixMs: z.number().int().nonnegative(),
  fetchedAtUnixMs: z.number().int().nonnegative(),
  source: z.string(),
  stale: z.boolean(),
});

export interface CompletedLaunchPage {
  expiresAt: string;
  fetchedAt: string;
  launches: LaunchRecord[];
  loadedCount: number;
  providerCount: number;
  rejectedCount: number;
  source: string;
  stale: boolean;
}

export interface LaunchDetailResult {
  expiresAt: string;
  fetchedAt: string;
  launch: LaunchRecord;
  source: string;
  stale: boolean;
}

export async function fetchCompletedLaunches(
  limit = 50,
  offset = 0,
): Promise<CompletedLaunchPage> {
  const response = listResponseSchema.parse(await invoke("completed_launches", { limit, offset }));
  const normalized = createSpaceIntelligence(response.launchesData, [], {
    eventCount: 0,
    expiresAt: new Date(response.expiresAtUnixMs).toISOString(),
    fetchedAt: new Date(response.fetchedAtUnixMs).toISOString(),
    launchCount: response.providerCount,
    source: response.source,
    stale: response.stale,
  });
  return {
    expiresAt: normalized.expiresAt,
    fetchedAt: normalized.fetchedAt,
    launches: normalized.launches,
    loadedCount: response.loadedCount,
    providerCount: response.providerCount,
    rejectedCount: normalized.rejectedLaunchCount,
    source: response.source,
    stale: response.stale,
  };
}

export async function fetchLaunchDetail(id: string): Promise<LaunchDetailResult> {
  const response = detailResponseSchema.parse(await invoke("launch_detail", { launchId: id }));
  const launch = createLaunchRecord(response.data);
  if (!launch) throw new Error("Launch Library detail response was invalid");
  return {
    expiresAt: new Date(response.expiresAtUnixMs).toISOString(),
    fetchedAt: new Date(response.fetchedAtUnixMs).toISOString(),
    launch,
    source: response.source,
    stale: response.stale,
  };
}
