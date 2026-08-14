import { ArrowSync24Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";

import {
  checkForAppUpdate,
  openUpdatePrompt,
} from "@/features/updater/api/appUpdater";
import { useAppUpdateStore } from "@/features/updater/model/updateStore";

export function UpdateSettingsRow({ installedVersion }: { installedVersion: string }) {
  const { t } = useTranslation("settings");
  const release = useAppUpdateStore((state) => state.release);
  const status = useAppUpdateStore((state) => state.status);
  const busy = status === "checking" || status === "downloading" || status === "installing";
  const statusKey = release?.required
    ? "critical"
    : status === "available"
      ? "available"
      : status;

  const handleAction = () => {
    if (release) openUpdatePrompt();
    else void checkForAppUpdate({ manual: true });
  };

  return (
    <div className="setting-row setting-row--update">
      <span className="setting-row__icon"><ArrowSync24Regular aria-hidden /></span>
      <span className="setting-row__copy">
        <strong>{t("updates.label")}</strong>
        <span>{t("updates.description", { version: installedVersion })}</span>
      </span>
      <div className="setting-update-action">
        <span className="status-chip status-chip--quiet" data-critical={release?.required ?? false}>
          {t(`updates.status.${statusKey}`)}
        </span>
        <button disabled={busy} onClick={handleAction} type="button">
          {release ? t("updates.view") : t("updates.check")}
        </button>
      </div>
    </div>
  );
}
