import { z } from "zod";

import type { SupportedLocale } from "@/shared/i18n/locales";

const semanticVersionPattern = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const updatePolicySchema = z.object({
  minimumSupportedVersion: z.string().regex(semanticVersionPattern),
  notes: z.object({
    az: z.string().max(4_000),
    en: z.string().max(4_000),
    es: z.string().max(4_000),
    ru: z.string().max(4_000),
    tr: z.string().max(4_000),
  }),
  schemaVersion: z.literal(1),
  severity: z.enum(["optional", "critical"]),
  version: z.string().regex(semanticVersionPattern),
});

export interface ParsedUpdatePolicy {
  minimumSupportedVersion: string;
  notes: string;
  required: boolean;
  severity: "optional" | "critical";
}

function versionParts(version: string): [number, number, number] | null {
  const core = version.trim().replace(/^v/, "").split(/[+-]/, 1)[0];
  if (!core) return null;
  const parts = core.split(".").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isSafeInteger(part) || part < 0)) {
    return null;
  }
  return [parts[0]!, parts[1]!, parts[2]!];
}

export function compareSemanticVersions(left: string, right: string): number {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  if (!leftParts || !rightParts) return 0;

  for (let index = 0; index < leftParts.length; index += 1) {
    const difference = leftParts[index]! - rightParts[index]!;
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

export function parseUpdatePolicy(
  body: string | undefined,
  currentVersion: string,
  updateVersion: string,
  locale: SupportedLocale,
): ParsedUpdatePolicy {
  if (body) {
    try {
      const parsed = updatePolicySchema.safeParse(JSON.parse(body));
      if (parsed.success && compareSemanticVersions(parsed.data.version, updateVersion) === 0) {
        const required = parsed.data.severity === "critical"
          || compareSemanticVersions(currentVersion, parsed.data.minimumSupportedVersion) < 0;
        return {
          minimumSupportedVersion: parsed.data.minimumSupportedVersion,
          notes: parsed.data.notes[locale],
          required,
          severity: required ? "critical" : "optional",
        };
      }
    } catch {
      // Older manifests may contain ordinary human-readable release notes.
    }
  }

  return {
    minimumSupportedVersion: currentVersion,
    notes: body?.trim() ?? "",
    required: false,
    severity: "optional",
  };
}
