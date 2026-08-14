import { Delete20Regular, Key24Regular, ShieldCheckmark20Regular } from "@fluentui/react-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useNasaCredentialStatus,
  useRemoveNasaCredential,
  useSaveNasaCredential,
  useVerifyNasaCredential,
} from "../api/useNasaCredential";

export function NasaCredentialSettings() {
  const { t } = useTranslation("settings");
  const status = useNasaCredentialStatus();
  const save = useSaveNasaCredential();
  const remove = useRemoveNasaCredential();
  const verify = useVerifyNasaCredential();
  const [apiKey, setApiKey] = useState("");
  const current = status.data;
  const busy = save.isPending || remove.isPending || verify.isPending;
  const hasError = save.isError || remove.isError || verify.isError || status.isError;

  return (
    <div className="setting-row setting-row--credential">
      <span className="setting-row__icon"><Key24Regular aria-hidden /></span>
      <div className="setting-row__copy credential-settings__copy">
        <strong>{t("credentials.label")}</strong>
        <span>{t("credentials.description")}</span>
        <div className="credential-settings__status">
          <span className="status-chip" data-status={current?.verified === true ? "healthy" : current?.configured ? "stale" : "unavailable"}>
            {current?.verified === true
              ? t("credentials.verified")
              : current?.configured
                ? t("credentials.configured")
                : t("credentials.unconfigured")}
          </span>
          {current && <small>{t(`credentials.source.${current.source}`)}</small>}
        </div>
        <div className="credential-settings__form">
          <input
            aria-label={t("credentials.input")}
            autoComplete="off"
            disabled={busy}
            onChange={(event) => setApiKey(event.currentTarget.value)}
            placeholder={t("credentials.placeholder")}
            type="password"
            value={apiKey}
          />
          <button className="secondary-button" disabled={busy || apiKey.trim().length < 20} onClick={() => save.mutate(apiKey.trim(), { onSuccess: () => setApiKey("") })} type="button">{t("credentials.save")}</button>
          {current?.configured && <button className="secondary-button" disabled={busy} onClick={() => verify.mutate(undefined)} type="button"><ShieldCheckmark20Regular aria-hidden />{t("credentials.verify")}</button>}
          {current?.source === "credentialStore" && <button aria-label={t("credentials.remove")} className="icon-button" disabled={busy} onClick={() => remove.mutate(undefined)} type="button"><Delete20Regular aria-hidden /></button>}
        </div>
        {hasError && <span className="field-error" role="alert">{t("credentials.error")}</span>}
      </div>
    </div>
  );
}
