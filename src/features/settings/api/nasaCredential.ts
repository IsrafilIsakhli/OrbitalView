import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

const nasaCredentialStatusSchema = z.object({
  configured: z.boolean(),
  source: z.enum(["credentialStore", "environment", "development", "unconfigured"]),
  verified: z.boolean().nullable(),
});

export type NasaCredentialStatus = z.infer<typeof nasaCredentialStatusSchema>;

export async function fetchNasaCredentialStatus(): Promise<NasaCredentialStatus> {
  return nasaCredentialStatusSchema.parse(await invoke("nasa_credential_status"));
}

export async function saveNasaCredential(apiKey: string): Promise<NasaCredentialStatus> {
  return nasaCredentialStatusSchema.parse(await invoke("set_nasa_credential", { apiKey }));
}

export async function removeNasaCredential(): Promise<NasaCredentialStatus> {
  return nasaCredentialStatusSchema.parse(await invoke("delete_nasa_credential"));
}

export async function verifyNasaCredential(): Promise<NasaCredentialStatus> {
  return nasaCredentialStatusSchema.parse(await invoke("verify_nasa_credential"));
}
