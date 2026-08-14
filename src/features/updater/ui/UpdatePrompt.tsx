import {
  ArrowDownload24Regular,
  CheckmarkCircle24Regular,
  Dismiss20Regular,
  ShieldError24Regular,
} from "@fluentui/react-icons";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import {
  dismissOptionalUpdate,
  installAppUpdate,
  retryAppUpdate,
} from "@/features/updater/api/appUpdater";
import { useAppUpdateStore } from "@/features/updater/model/updateStore";

export function UpdatePrompt() {
  const { t } = useTranslation("settings");
  const downloadedBytes = useAppUpdateStore((state) => state.downloadedBytes);
  const errorCode = useAppUpdateStore((state) => state.errorCode);
  const promptOpen = useAppUpdateStore((state) => state.promptOpen);
  const release = useAppUpdateStore((state) => state.release);
  const status = useAppUpdateStore((state) => state.status);
  const totalBytes = useAppUpdateStore((state) => state.totalBytes);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (promptOpen) headingRef.current?.focus();
  }, [promptOpen]);

  if (!promptOpen) return null;

  const required = release?.required ?? false;
  const checkError = status === "error" && !release;
  const busy = status === "downloading" || status === "installing" || status === "ready";
  const progress = totalBytes && totalBytes > 0
    ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
    : null;

  return (
    <div className="update-overlay" role="presentation">
      <section
        aria-describedby="update-prompt-description"
        aria-labelledby="update-prompt-title"
        aria-live="assertive"
        aria-modal="true"
        className="update-prompt glass-surface"
        data-required={required}
        role="alertdialog"
      >
        <header className="update-prompt__header">
          <span className="update-prompt__icon">
            {required || checkError ? <ShieldError24Regular aria-hidden /> : <ArrowDownload24Regular aria-hidden />}
          </span>
          <div>
            <p className="eyebrow">
              {checkError ? t("updates.checkErrorEyebrow") : required ? t("updates.criticalEyebrow") : t("updates.availableEyebrow")}
            </p>
            <h2 id="update-prompt-title" ref={headingRef} tabIndex={-1}>
              {checkError ? t("updates.checkErrorTitle") : required ? t("updates.criticalTitle") : t("updates.availableTitle")}
            </h2>
          </div>
          {!required && !busy && (
            <button
              aria-label={t("updates.later")}
              className="icon-button"
              onClick={dismissOptionalUpdate}
              type="button"
            >
              <Dismiss20Regular aria-hidden />
            </button>
          )}
        </header>

        <div className="update-prompt__body">
          <p id="update-prompt-description">
            {checkError ? t("updates.checkErrorDescription") : required ? t("updates.criticalDescription") : t("updates.availableDescription")}
          </p>
          {release && (
            <div className="update-version-path">
              <span>{release.currentVersion}</span>
              <i aria-hidden>→</i>
              <strong>{release.version}</strong>
            </div>
          )}
          {release?.notes && <p className="update-release-notes">{release.notes}</p>}

          {busy && (
            <div className="update-progress" data-indeterminate={progress === null}>
              <div aria-hidden><span style={progress === null ? undefined : { width: `${progress}%` }} /></div>
              <p>
                {status === "downloading"
                  ? t("updates.downloading", { progress: progress ?? "…" })
                  : status === "ready"
                    ? t("updates.restarting")
                    : t("updates.installing")}
              </p>
            </div>
          )}

          {status === "error" && (
            <div className="update-error" role="status">
              <ShieldError24Regular aria-hidden />
              <span>{t(`updates.errors.${errorCode ?? "checkFailed"}`)}</span>
            </div>
          )}
        </div>

        <footer className="update-prompt__actions">
          {!required && !busy && (
            <button className="secondary-button" onClick={dismissOptionalUpdate} type="button">
              {t("updates.later")}
            </button>
          )}
          {status === "available" && !required && (
            <button className="primary-button" onClick={() => void installAppUpdate()} type="button">
              <ArrowDownload24Regular aria-hidden />
              {t("updates.updateNow")}
            </button>
          )}
          {status === "error" && (
            <button className="primary-button" onClick={() => void retryAppUpdate()} type="button">
              {required ? <ShieldError24Regular aria-hidden /> : <CheckmarkCircle24Regular aria-hidden />}
              {t("updates.retry")}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
