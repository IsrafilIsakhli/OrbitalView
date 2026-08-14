import { getCurrentWindow } from "@tauri-apps/api/window";

export function isTauriRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    "__TAURI_INTERNALS__" in window
  );
}

async function withCurrentWindow(
  action: (windowHandle: ReturnType<typeof getCurrentWindow>) => Promise<void>,
): Promise<void> {
  if (!isTauriRuntime()) return;
  await action(getCurrentWindow());
}

export function minimizeWindow(): Promise<void> {
  return withCurrentWindow((windowHandle) => windowHandle.minimize());
}

export function toggleMaximizeWindow(): Promise<void> {
  return withCurrentWindow((windowHandle) => windowHandle.toggleMaximize());
}

export function closeWindow(): Promise<void> {
  return withCurrentWindow((windowHandle) => windowHandle.close());
}
