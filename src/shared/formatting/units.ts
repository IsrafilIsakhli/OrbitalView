import { formatNumber } from "@/shared/i18n/formatters";

export type UnitSystem = "metric" | "imperial";

const KILOMETERS_TO_MILES = 0.6213711922;
const METERS_TO_FEET = 3.280839895;
const KILOGRAMS_TO_POUNDS = 2.2046226218;
const TONNES_TO_SHORT_TONS = 1.1023113109;
const KILONEWTONS_TO_POUNDS_FORCE = 224.80894387;
const CELSIUS_TO_FAHRENHEIT_SCALE = 9 / 5;

export function formatDistanceFromKm(value: number, units: UnitSystem, locale: string, maximumFractionDigits = 1): string {
  const converted = units === "imperial" ? value * KILOMETERS_TO_MILES : value;
  return `${formatNumber(converted, locale, { maximumFractionDigits })} ${units === "imperial" ? "mi" : "km"}`;
}

export function formatOrbitalSpeed(valueKmPerSecond: number, units: UnitSystem, locale: string, maximumFractionDigits = 2): string {
  const converted = units === "imperial" ? valueKmPerSecond * KILOMETERS_TO_MILES : valueKmPerSecond;
  return `${formatNumber(converted, locale, { maximumFractionDigits })} ${units === "imperial" ? "mi/s" : "km/s"}`;
}

export function formatSurfaceSpeed(valueKmh: number, units: UnitSystem, locale: string, maximumFractionDigits = 0): string {
  const converted = units === "imperial" ? valueKmh * KILOMETERS_TO_MILES : valueKmh;
  return `${formatNumber(converted, locale, { maximumFractionDigits })} ${units === "imperial" ? "mph" : "km/h"}`;
}

export function formatTemperature(valueCelsius: number, units: UnitSystem, locale: string, maximumFractionDigits = 0): string {
  const converted = units === "imperial" ? (valueCelsius * CELSIUS_TO_FAHRENHEIT_SCALE) + 32 : valueCelsius;
  return `${formatNumber(converted, locale, { maximumFractionDigits })}°${units === "imperial" ? "F" : "C"}`;
}

export function formatLengthFromMeters(valueMeters: number, units: UnitSystem, locale: string, maximumFractionDigits = 1): string {
  const converted = units === "imperial" ? valueMeters * METERS_TO_FEET : valueMeters;
  return `${formatNumber(converted, locale, { maximumFractionDigits })} ${units === "imperial" ? "ft" : "m"}`;
}

export function formatMassFromKilograms(valueKilograms: number, units: UnitSystem, locale: string, maximumFractionDigits = 0): string {
  const converted = units === "imperial" ? valueKilograms * KILOGRAMS_TO_POUNDS : valueKilograms;
  return `${formatNumber(converted, locale, { maximumFractionDigits })} ${units === "imperial" ? "lb" : "kg"}`;
}

export function formatMassFromTonnes(valueTonnes: number, units: UnitSystem, locale: string, maximumFractionDigits = 1): string {
  const converted = units === "imperial" ? valueTonnes * TONNES_TO_SHORT_TONS : valueTonnes;
  return `${formatNumber(converted, locale, { maximumFractionDigits })} ${units === "imperial" ? "short ton" : "t"}`;
}

export function formatForceFromKilonewtons(valueKilonewtons: number, units: UnitSystem, locale: string, maximumFractionDigits = 0): string {
  const converted = units === "imperial" ? valueKilonewtons * KILONEWTONS_TO_POUNDS_FORCE : valueKilonewtons;
  return `${formatNumber(converted, locale, { maximumFractionDigits })} ${units === "imperial" ? "lbf" : "kN"}`;
}
