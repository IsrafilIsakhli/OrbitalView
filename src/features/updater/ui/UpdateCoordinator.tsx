import { useEffect } from "react";

import { usePreferencesStore } from "@/features/settings/model/preferences";
import {
  checkForAppUpdate,
  installAppUpdate,
  synchronizeUpdateLocale,
} from "@/features/updater/api/appUpdater";
import { useAppUpdateStore } from "@/features/updater/model/updateStore";

import { UpdatePrompt } from "./UpdatePrompt";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1_000;
const FOCUS_RECHECK_AGE_MS = 30 * 60 * 1_000;

export function UpdateCoordinator() {
  const locale = usePreferencesStore((state) => state.locale);
  const release = useAppUpdateStore((state) => state.release);
  const status = useAppUpdateStore((state) => state.status);

  useEffect(() => {
    const startupTimer = window.setTimeout(() => {
      void checkForAppUpdate();
    }, 1_500);
    const interval = window.setInterval(() => {
      void checkForAppUpdate();
    }, CHECK_INTERVAL_MS);
    const handleFocus = () => {
      const lastCheckedAt = useAppUpdateStore.getState().lastCheckedAtUnixMs ?? 0;
      if (Date.now() - lastCheckedAt >= FOCUS_RECHECK_AGE_MS) {
        void checkForAppUpdate();
      }
    };
    window.addEventListener("focus", handleFocus);
    return () => {
      window.clearTimeout(startupTimer);
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  useEffect(() => {
    synchronizeUpdateLocale();
  }, [locale]);

  useEffect(() => {
    if (status === "available" && release?.required) {
      void installAppUpdate();
    }
  }, [release, status]);

  return <UpdatePrompt />;
}
