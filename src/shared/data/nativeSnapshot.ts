import { invoke } from "@tauri-apps/api/core";

/** Native scheduler owns upstream refresh; recurring UI reads use its last snapshot. */
export async function nativeSnapshot(provider: string, initialCommand: string): Promise<unknown> {
  const cached = await invoke<unknown>("provider_cached_snapshot", { provider });
  return cached ?? invoke<unknown>(initialCommand);
}
