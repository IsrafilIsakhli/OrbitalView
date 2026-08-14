import type { SupportedLocale } from "./locales";
import { intlLocaleTags, normalizeLocale } from "./locales";

export type TimeDisplayMode = "utc-local" | "utc-only" | "local-only";

export interface FormattedDateTime {
  local: string | null;
  primary: string;
  utc: string | null;
}

interface DateTimeOptions extends Intl.DateTimeFormatOptions {
  invalidValue?: string;
}

export function toSupportedLocale(value: string | null | undefined): SupportedLocale {
  return normalizeLocale(value);
}

export function formatDateTime(
  value: string | number | Date,
  localeValue: string | null | undefined,
  mode: TimeDisplayMode = "utc-local",
  options: DateTimeOptions = {},
): FormattedDateTime {
  const { invalidValue = "—", ...dateOptions } = options;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return { local: null, primary: invalidValue, utc: null };
  }

  const locale = intlLocaleTags[toSupportedLocale(localeValue)];
  const usesStylePreset = dateOptions.dateStyle !== undefined || dateOptions.timeStyle !== undefined;
  const baseOptions: Intl.DateTimeFormatOptions = usesStylePreset
    ? { ...dateOptions }
    : {
        day: "2-digit",
        hour: "2-digit",
        hour12: false,
        minute: "2-digit",
        month: "short",
        year: "numeric",
        ...dateOptions,
      };
  const utc = new Intl.DateTimeFormat(locale, {
    ...baseOptions,
    timeZone: "UTC",
    ...(!usesStylePreset && { timeZoneName: baseOptions.timeZoneName ?? "short" }),
  }).format(date);
  const local = new Intl.DateTimeFormat(locale, {
    ...baseOptions,
    ...(!usesStylePreset && { timeZoneName: baseOptions.timeZoneName ?? "short" }),
  }).format(date);

  if (mode === "local-only") return { local, primary: local, utc: null };
  if (mode === "utc-only") return { local: null, primary: utc, utc };
  return { local, primary: utc, utc };
}

export function formatCompactDate(
  value: string | number | Date,
  localeValue: string | null | undefined,
  timeZone: "UTC" | "local" = "UTC",
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat(intlLocaleTags[toSupportedLocale(localeValue)], {
    day: "2-digit",
    month: "short",
    ...(timeZone === "UTC" ? { timeZone: "UTC" } : {}),
  }).format(date);
}

export function formatNumber(
  value: number,
  localeValue: string | null | undefined,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(
    intlLocaleTags[toSupportedLocale(localeValue)],
    options,
  ).format(value);
}

export function formatTime(
  value: string | number | Date,
  localeValue: string | null | undefined,
  timeZone: "UTC" | "local" = "UTC",
  includeSeconds = false,
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat(intlLocaleTags[toSupportedLocale(localeValue)], {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    second: includeSeconds ? "2-digit" : undefined,
    ...(timeZone === "UTC" ? { timeZone: "UTC" } : {}),
  }).format(date);
}

export function formatRelativeTime(
  timestampUnixMs: number,
  nowUnixMs: number,
  localeValue: string | null | undefined,
): string {
  const deltaSeconds = Math.round((timestampUnixMs - nowUnixMs) / 1_000);
  const formatter = new Intl.RelativeTimeFormat(
    intlLocaleTags[toSupportedLocale(localeValue)],
    { numeric: "auto" },
  );
  const absolute = Math.abs(deltaSeconds);
  if (absolute < 60) return formatter.format(deltaSeconds, "second");
  if (absolute < 3_600) return formatter.format(Math.round(deltaSeconds / 60), "minute");
  if (absolute < 86_400) return formatter.format(Math.round(deltaSeconds / 3_600), "hour");
  return formatter.format(Math.round(deltaSeconds / 86_400), "day");
}
