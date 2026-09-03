import { z } from "zod";

import type { SupportedLocale } from "@/shared/i18n/locales";

import { compareSemanticVersions, isSemanticVersion } from "@/shared/data/semver";
export { compareSemanticVersions } from "@/shared/data/semver";

const updatePolicySchema = z.object({
  minimumSupportedVersion: z.string().refine(isSemanticVersion),
  notes: z.object({
    az: z.string().max(4_000),
    en: z.string().max(4_000),
    es: z.string().max(4_000),
    ru: z.string().max(4_000),
    tr: z.string().max(4_000),
  }),
  schemaVersion: z.literal(1),
  severity: z.enum(["optional", "critical"]),
  version: z.string().refine(isSemanticVersion),
});

export interface ParsedUpdatePolicy {
  minimumSupportedVersion: string;
  notes: string;
  required: boolean;
  severity: "optional" | "critical";
}

export function parseUpdatePolicy(
  body: string | undefined,
  currentVersion: string,
  updateVersion: string,
  locale: SupportedLocale,
): ParsedUpdatePolicy {
  if (!isSemanticVersion(currentVersion) || !isSemanticVersion(updateVersion)) throw new Error("invalid-update-version");
  if (body?.trim().startsWith("{") || body?.trim().startsWith("[")) {
    const parsed = updatePolicySchema.parse(JSON.parse(body));
    if (compareSemanticVersions(parsed.version, updateVersion) !== 0
      || compareSemanticVersions(parsed.minimumSupportedVersion, parsed.version) > 0) throw new Error("invalid-update-policy");
    const required = parsed.severity === "critical"
      || compareSemanticVersions(currentVersion, parsed.minimumSupportedVersion) < 0;
    return {
      minimumSupportedVersion: parsed.minimumSupportedVersion,
      notes: parsed.notes[locale],
      required,
      severity: required ? "critical" : "optional",
    };
  }
  // Ordinary pre-policy release notes remain supported, but broken structured metadata fails closed.
  return { minimumSupportedVersion: currentVersion, notes: body?.trim() ?? "", required: false, severity: "optional" };
}
