import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { z } from "zod";

export type RemoteMediaProvider = "launchLibrary" | "nasa";

const payloadSchema = z.object({ cachedPath: z.string().min(1) });

export async function resolveRemoteMedia(url: string, provider: RemoteMediaProvider): Promise<string> {
  const payload = payloadSchema.parse(await invoke("cache_remote_media", { provider, url }));
  return convertFileSrc(payload.cachedPath);
}
