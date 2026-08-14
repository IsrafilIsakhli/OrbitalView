export type DesktopPlatform = "windows" | "macos" | "linux" | "unknown";

export function normalizeDesktopPlatform(value: string): DesktopPlatform {
  const normalized = value.trim().toLowerCase();

  if (normalized === "win32" || normalized === "windows") return "windows";
  if (normalized === "darwin" || normalized === "macos") return "macos";
  if (normalized === "linux") return "linux";
  return "unknown";
}

const buildTargetOs =
  typeof __ORBITAL_TARGET_OS__ === "string"
    ? __ORBITAL_TARGET_OS__
    : typeof navigator === "undefined"
      ? "unknown"
      : navigator.platform;

export const desktopPlatform = normalizeDesktopPlatform(buildTargetOs);

export function usesNativeWindowFrame(
  platform: DesktopPlatform = desktopPlatform,
): boolean {
  return platform !== "windows";
}

export function applyDesktopPlatformAttribute(
  platform: DesktopPlatform = desktopPlatform,
): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.platform = platform;
}
