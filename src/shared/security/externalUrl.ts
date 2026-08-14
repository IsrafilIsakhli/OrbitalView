import { invoke } from "@tauri-apps/api/core";

export function validateExternalUrl(value: string): string | null {
  if (value.length > 2_048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const hostname = url.hostname.toLowerCase();
    if (hostname === "localhost" || hostname.endsWith(".local")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function openExternalUrl(value: string): Promise<void> {
  const url = validateExternalUrl(value);
  if (!url) throw new Error("external-url-invalid");
  await invoke("open_external_url", { url });
}
