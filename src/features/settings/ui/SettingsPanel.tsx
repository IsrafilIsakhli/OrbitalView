import {
  ChevronRight20Regular,
  Dismiss20Regular,
  Gauge24Regular,
  LocalLanguage24Regular,
  WeatherMoon24Regular,
} from "@fluentui/react-icons";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useControlCenterSnapshot } from "@/features/control-center/api/useControlCenter";

import {
  type DefaultCameraPreset,
  type GraphicsQuality,
  type TimeDisplayMode,
  type UnitSystem,
  usePreferencesStore,
} from "@/features/settings/model/preferences";
import { NasaCredentialSettings } from "./NasaCredentialSettings";
import { UpdateSettingsRow } from "@/features/updater/ui/UpdateSettingsRow";

interface SettingsPanelProps {
  onClose: () => void;
  onOpenLanguage: () => void;
  open: boolean;
}

const qualityOptions: GraphicsQuality[] = ["eco", "balanced", "high"];
const unitOptions: UnitSystem[] = ["metric", "imperial"];
const timeOptions: TimeDisplayMode[] = ["utc-local", "utc-only", "local-only"];
const cameraOptions: DefaultCameraPreset[] = ["earth", "leo", "iss", "moon", "sun"];

const localeNameKeys = {
  az: "language.az.name",
  tr: "language.tr.name",
  en: "language.en.name",
  es: "language.es.name",
  ru: "language.ru.name",
} as const;

export function SettingsPanel({ open, onClose, onOpenLanguage }: SettingsPanelProps) {
  const { t } = useTranslation(["common", "settings"]);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const operations = useControlCenterSnapshot();
  const graphicsQuality = usePreferencesStore((state) => state.graphicsQuality);
  const defaultCameraPreset = usePreferencesStore((state) => state.defaultCameraPreset);
  const locale = usePreferencesStore((state) => state.locale);
  const reduceMotion = usePreferencesStore((state) => state.reduceMotion);
  const timeDisplay = usePreferencesStore((state) => state.timeDisplay);
  const units = usePreferencesStore((state) => state.units);
  const setGraphicsQuality = usePreferencesStore((state) => state.setGraphicsQuality);
  const setDefaultCameraPreset = usePreferencesStore((state) => state.setDefaultCameraPreset);
  const setReduceMotion = usePreferencesStore((state) => state.setReduceMotion);
  const setTimeDisplay = usePreferencesStore((state) => state.setTimeDisplay);
  const setUnits = usePreferencesStore((state) => state.setUnits);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;
    dialog.showModal();

    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      aria-labelledby="settings-title"
      className="settings-panel glass-surface"
      onCancel={onClose}
      ref={dialogRef}
    >
      <header className="settings-panel__header">
        <div>
          <p className="eyebrow">{t("common:brand.name")}</p>
          <h2 id="settings-title">{t("settings:title")}</h2>
          <p>{t("settings:subtitle")}</p>
        </div>
        <button aria-label={t("common:actions.close")} className="icon-button" onClick={onClose} type="button">
          <Dismiss20Regular aria-hidden />
        </button>
      </header>

      <div className="settings-panel__content">
        <section className="settings-section">
          <h3>{t("settings:sections.experience")}</h3>

          <button className="setting-row setting-row--button" onClick={onOpenLanguage} type="button">
            <span className="setting-row__icon"><LocalLanguage24Regular aria-hidden /></span>
            <span className="setting-row__copy">
              <strong>{t("settings:language.label")}</strong>
              <span>{t("settings:language.description")}</span>
            </span>
            <span className="setting-row__value">{t(`settings:${localeNameKeys[locale]}`)}</span>
            <ChevronRight20Regular aria-hidden />
          </button>

          <div className="setting-row setting-row--stacked">
            <span className="setting-row__icon"><Gauge24Regular aria-hidden /></span>
            <span className="setting-row__copy">
              <strong>{t("settings:graphics.label")}</strong>
              <span>{t("settings:graphics.description")}</span>
            </span>
            <div className="segmented-control">
              {qualityOptions.map((quality) => (
                <button
                  aria-pressed={graphicsQuality === quality}
                  data-active={graphicsQuality === quality}
                  key={quality}
                  onClick={() => setGraphicsQuality(quality)}
                  type="button"
                >
                  {t(`settings:graphics.${quality}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="setting-row setting-row--stacked">
            <span className="setting-row__icon"><Gauge24Regular aria-hidden /></span>
            <span className="setting-row__copy">
              <strong>{t("settings:time.label")}</strong>
              <span>{t("settings:time.description")}</span>
            </span>
            <div className="segmented-control segmented-control--compact">
              {timeOptions.map((mode) => (
                <button
                  aria-pressed={timeDisplay === mode}
                  data-active={timeDisplay === mode}
                  key={mode}
                  onClick={() => setTimeDisplay(mode)}
                  type="button"
                >
                  {t(`settings:time.${mode}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="setting-row setting-row--stacked">
            <span className="setting-row__icon"><Gauge24Regular aria-hidden /></span>
            <span className="setting-row__copy">
              <strong>{t("settings:camera.label")}</strong>
              <span>{t("settings:camera.description")}</span>
            </span>
            <div className="segmented-control segmented-control--compact settings-camera-options">
              {cameraOptions.map((preset) => (
                <button
                  aria-pressed={defaultCameraPreset === preset}
                  data-active={defaultCameraPreset === preset}
                  key={preset}
                  onClick={() => setDefaultCameraPreset(preset)}
                  type="button"
                >
                  {t(`settings:camera.${preset}`)}
                </button>
              ))}
            </div>
          </div>

          <label className="setting-row" htmlFor="reduce-motion">
            <span className="setting-row__icon"><WeatherMoon24Regular aria-hidden /></span>
            <span className="setting-row__copy">
              <strong>{t("settings:motion.label")}</strong>
              <span>{t("settings:motion.description")}</span>
            </span>
            <input
              checked={reduceMotion}
              className="toggle-input"
              id="reduce-motion"
              onChange={(event) => setReduceMotion(event.currentTarget.checked)}
              role="switch"
              type="checkbox"
            />
          </label>

          <div className="setting-row setting-row--stacked">
            <span className="setting-row__icon"><Gauge24Regular aria-hidden /></span>
            <span className="setting-row__copy">
              <strong>{t("settings:units.label")}</strong>
              <span>{t("settings:units.description")}</span>
            </span>
            <div className="segmented-control segmented-control--compact">
              {unitOptions.map((unit) => ( 
                <button
                  aria-pressed={units === unit}
                  data-active={units === unit}
                  key={unit}
                  onClick={() => setUnits(unit)}
                  type="button"
                >
                  {t(`settings:units.${unit}`)}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h3>{t("settings:sections.system")}</h3>
          <NasaCredentialSettings />
          <UpdateSettingsRow installedVersion={operations.data?.runtime.appVersion ?? "—"} />
        </section>
      </div>

      <footer className="settings-panel__footer">
        <button className="primary-button" onClick={onClose} type="button">
          {t("common:actions.done")}
        </button>
      </footer>
    </dialog>
  );
}
