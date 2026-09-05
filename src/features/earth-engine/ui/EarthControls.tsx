import {
  ArrowRotateClockwise24Regular,
  BuildingMultiple24Regular,
  Clock24Regular,
  Globe24Regular,
  GlobeLocation24Regular,
  Pause24Regular,
  Play24Regular,
  WeatherMoon24Regular,
  WeatherSunny24Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";

import type {
  CameraPresetId,
  EarthEngineSnapshot,
} from "../contracts/earth-engine";
import { cameraPresetIds } from "../contracts/earth-engine";

const presetIcons = {
  earth: Globe24Regular,
  leo: GlobeLocation24Regular,
  iss: BuildingMultiple24Regular,
  moon: WeatherMoon24Regular,
  sun: WeatherSunny24Regular,
};

interface EarthControlsProps {
  onFlyTo: (preset: CameraPresetId) => void;
  onToggleRotation: () => void;
  onToggleTimeLens: () => void;
  snapshot: EarthEngineSnapshot;
}

export function EarthControls({
  onFlyTo,
  onToggleRotation,
  onToggleTimeLens,
  snapshot,
}: EarthControlsProps) {
  const { t } = useTranslation("earth");

  return (
    <div className="earth-controls">
      <div className="earth-controls__presets" role="group" aria-label={t("camera.groupLabel")}>
        {cameraPresetIds.map((preset) => {
          const PresetIcon = presetIcons[preset];
          const label = t(`camera.presets.${preset}.label`);
          const detail = t(`camera.presets.${preset}.detail`);
          return (
          <button
            aria-label={`${label} · ${detail}`}
            aria-pressed={snapshot.activePreset === preset}
            className="camera-preset"
            data-active={snapshot.activePreset === preset}
            key={preset}
            onClick={() => onFlyTo(preset)}
            onFocus={(event) => event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" })}
            title={preset === "iss" ? t("camera.issNotice") : `${label} · ${detail}`}
            type="button"
          >
            <PresetIcon aria-hidden />
            <span>{label}</span>
            <small>{detail}</small>
          </button>
          );
        })}
      </div>
      <button
        aria-label={
          snapshot.autoRotation ? t("rotation.pause") : t("rotation.resume")
        }
        aria-pressed={snapshot.autoRotation}
        className="earth-rotation-button"
        onClick={onToggleRotation}
        title={snapshot.autoRotation ? t("rotation.pause") : t("rotation.resume")}
        type="button"
      >
        <ArrowRotateClockwise24Regular aria-hidden />
        {snapshot.autoRotation ? (
          <Pause24Regular aria-hidden />
        ) : (
          <Play24Regular aria-hidden />
        )}
      </button>
      <button
        aria-label={snapshot.timeLensActive
          ? t("timeLens.returnLive")
          : t("timeLens.open")}
        aria-pressed={snapshot.timeLensActive}
        className="earth-time-lens-button"
        data-active={snapshot.timeLensActive}
        onClick={onToggleTimeLens}
        title={snapshot.timeLensActive ? t("timeLens.returnLive") : t("timeLens.open")}
        type="button"
      >
        <Clock24Regular aria-hidden />
        <span>{snapshot.timeLensActive ? t("timeLens.forecast") : t("timeLens.now")}</span>
      </button>
    </div>
  );
}
