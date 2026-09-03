import { invoke, isTauri } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

import { usePreferencesStore } from "@/features/settings/model/preferences";
import { prepareUpdate } from "../domain/updateBarrier";
import { manualPackageUrl, type UpdateCapability } from "../domain/packageUpdate";
import { compareSemanticVersions } from "@/shared/data/semver";
import { openExternalUrl } from "@/shared/security/externalUrl";
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

    useAppUpdateStore.setState({ errorCode: null, status: "checking" });
    try {
      const capability = await invoke<UpdateCapability>("app_update_capability");
      const update = await check({ timeout: 15_000, target: capability.target });
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

      let policy;
      try {
        policy = parseUpdatePolicy(update.body, update.currentVersion, update.version, usePreferencesStore.getState().locale);
        if (compareSemanticVersions(update.version, update.currentVersion) <= 0
          || (current.release && compareSemanticVersions(update.version, current.release.version) < 0)) throw new Error("outdated-update");
      } catch (error) { await update.close().catch(() => undefined); throw error; }
      if (pendingUpdate && pendingUpdate !== update) {
        await pendingUpdate.close().catch(() => undefined);
      }
      pendingUpdate = update;

      const dismissed = window.sessionStorage.getItem(DISMISSED_UPDATE_KEY) === update.version;
      useAppUpdateStore.setState({
        downloadedBytes: 0,
        errorCode: null,
        lastCheckedAtUnixMs: checkedAt,
        promptOpen: policy.required || manual || !dismissed,
        release: {
          automatic: capability.automatic,
          manualDownloadUrl: manualPackageUrl(capability, update.version),
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
        promptOpen: manual || current.promptOpen,
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

    if (!release.automatic) {
      if (release.manualDownloadUrl) await openExternalUrl(release.manualDownloadUrl).catch(() => useAppUpdateStore.setState({ errorCode: "installFailed", status: "error" }));
      return;
    }

    useAppUpdateStore.setState({
      downloadedBytes: 0,
      errorCode: null,
      promptOpen: true,
      status: "downloading",
      totalBytes: null,
    });

    let resume: (() => void) | undefined;
    try {
      let downloadedBytes = 0;
      await update.download((event) => {
        if (event.event === "Started") {
          useAppUpdateStore.setState({ totalBytes: event.data.contentLength ?? null });
        } else if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
          useAppUpdateStore.setState({ downloadedBytes });
        } else {
          useAppUpdateStore.setState({ status: "installing" });
        }
      }, { timeout: 120_000 });

      useAppUpdateStore.setState({ status: "installing" });
      resume = await prepareUpdate();
      await invoke("prepare_app_update");
      await update.install();
      useAppUpdateStore.setState({ status: "ready" });
      await relaunch();
    } catch {
      resume?.();
      await invoke("resume_after_failed_update").catch(() => undefined);
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
  const { release, status } = useAppUpdateStore.getState();
  if (["downloading", "installing", "ready"].includes(status)) return;
  if (release?.required && release.automatic) return;
  if (release) window.sessionStorage.setItem(DISMISSED_UPDATE_KEY, release.version);
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
  return pendingUpdate && useAppUpdateStore.getState().errorCode !== "checkFailed"
    ? installAppUpdate()
    : checkForAppUpdate({ manual: true });
}
