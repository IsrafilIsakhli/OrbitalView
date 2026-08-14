import { isTauri } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

import { usePreferencesStore } from "@/features/settings/model/preferences";
import { parseUpdatePolicy } from "@/features/updater/domain/updatePolicy";
import { useAppUpdateStore } from "@/features/updater/model/updateStore";

const DISMISSED_UPDATE_KEY = "orbital-vision.dismissed-update";

let pendingUpdate: Update | null = null;
let checkPromise: Promise<void> | null = null;
let installPromise: Promise<void> | null = null;

function updaterAvailable(): boolean {
  return !import.meta.env.DEV && isTauri();
}

async function closePendingUpdate(): Promise<void> {
  const previous = pendingUpdate;
  pendingUpdate = null;
  if (previous) await previous.close().catch(() => undefined);
}

export function checkForAppUpdate({ manual = false }: { manual?: boolean } = {}): Promise<void> {
  if (checkPromise) return checkPromise;

  checkPromise = (async () => {
    if (!updaterAvailable()) {
      useAppUpdateStore.setState({ status: "disabled" });
      return;
    }

    const current = useAppUpdateStore.getState();
    if (current.status === "downloading" || current.status === "installing") return;
    if (current.release) {
      if (manual) useAppUpdateStore.setState({ promptOpen: true });
      return;
    }

    useAppUpdateStore.setState({ errorCode: null, status: "checking" });
    try {
      const update = await check({ timeout: 15_000 });
      const checkedAt = Date.now();
      if (!update) {
        await closePendingUpdate();
        useAppUpdateStore.setState({
          lastCheckedAtUnixMs: checkedAt,
          promptOpen: false,
          release: null,
          status: "upToDate",
        });
        return;
      }

      if (pendingUpdate && pendingUpdate !== update) {
        await pendingUpdate.close().catch(() => undefined);
      }
      pendingUpdate = update;

      const locale = usePreferencesStore.getState().locale;
      const policy = parseUpdatePolicy(update.body, update.currentVersion, update.version, locale);
      const dismissed = window.sessionStorage.getItem(DISMISSED_UPDATE_KEY) === update.version;
      useAppUpdateStore.setState({
        downloadedBytes: 0,
        errorCode: null,
        lastCheckedAtUnixMs: checkedAt,
        promptOpen: policy.required || manual || !dismissed,
        release: {
          currentVersion: update.currentVersion,
          date: update.date ?? null,
          minimumSupportedVersion: policy.minimumSupportedVersion,
          notes: policy.notes,
          required: policy.required,
          severity: policy.severity,
          version: update.version,
        },
        status: "available",
        totalBytes: null,
      });
    } catch {
      useAppUpdateStore.setState({
        errorCode: "checkFailed",
        lastCheckedAtUnixMs: Date.now(),
        promptOpen: manual,
        status: "error",
      });
    }
  })().finally(() => {
    checkPromise = null;
  });

  return checkPromise;
}

export function installAppUpdate(): Promise<void> {
  if (installPromise) return installPromise;

  installPromise = (async () => {
    const update = pendingUpdate;
    const release = useAppUpdateStore.getState().release;
    if (!update || !release) {
      await checkForAppUpdate({ manual: true });
      return;
    }

    useAppUpdateStore.setState({
      downloadedBytes: 0,
      errorCode: null,
      promptOpen: true,
      status: "downloading",
      totalBytes: null,
    });

    try {
      let downloadedBytes = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          useAppUpdateStore.setState({ totalBytes: event.data.contentLength ?? null });
        } else if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
          useAppUpdateStore.setState({ downloadedBytes });
        } else {
          useAppUpdateStore.setState({ status: "installing" });
        }
      }, { timeout: 120_000 });

      useAppUpdateStore.setState({ status: "ready" });
      await relaunch();
    } catch {
      useAppUpdateStore.setState({
        errorCode: "installFailed",
        promptOpen: true,
        status: "error",
      });
    }
  })().finally(() => {
    installPromise = null;
  });

  return installPromise;
}

export function dismissOptionalUpdate(): void {
  const release = useAppUpdateStore.getState().release;
  if (!release || release.required) return;
  window.sessionStorage.setItem(DISMISSED_UPDATE_KEY, release.version);
  useAppUpdateStore.setState({ promptOpen: false });
}

export function openUpdatePrompt(): void {
  if (useAppUpdateStore.getState().release) {
    useAppUpdateStore.setState({ promptOpen: true });
  }
}

export function synchronizeUpdateLocale(): void {
  const update = pendingUpdate;
  const release = useAppUpdateStore.getState().release;
  if (!update || !release) return;
  const policy = parseUpdatePolicy(
    update.body,
    update.currentVersion,
    update.version,
    usePreferencesStore.getState().locale,
  );
  useAppUpdateStore.setState({
    release: {
      ...release,
      notes: policy.notes,
      required: policy.required,
      severity: policy.severity,
    },
  });
}

export function retryAppUpdate(): Promise<void> {
  return pendingUpdate
    ? installAppUpdate()
    : checkForAppUpdate({ manual: true });
}
