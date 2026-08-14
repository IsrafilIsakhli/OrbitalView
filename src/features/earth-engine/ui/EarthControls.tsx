import {
  ArrowRotateClockwise24Regular,
  Pause24Regular,
  Play24Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";

import type {
  CameraPresetId,
  EarthEngineSnapshot,
} from "../contracts/earth-engine";
import { cameraPresetIds } from "../contracts/earth-engine";

interface EarthControlsProps {
  onFlyTo: (preset: CameraPresetId) => void;
  onToggleRotation: () => void;
  snapshot: EarthEngineSnapshot;
}

export function EarthControls({
  onFlyTo,
  onToggleRotation,
  snapshot,
}: EarthControlsProps) {
  const { t } = useTranslation("earth");

  return (
    <div className="earth-controls">
      <div className="earth-controls__presets" role="group" aria-label={t("camera.groupLabel")}>
        {cameraPresetIds.map((preset) => (
          <button
            aria-pressed={snapshot.activePreset === preset}
            className="camera-preset"
            data-active={snapshot.activePreset === preset}
            key={preset}
            onClick={() => onFlyTo(preset)}
            type="button"
          >
            <span>{t(`camera.presets.${preset}.label`)}</span>
            <small>{t(`camera.presets.${preset}.detail`)}</small>
          </button>
        ))}
      </div>
      <button
        aria-label={
          snapshot.autoRotation ? t("rotation.pause") : t("rotation.resume")
        }
        aria-pressed={snapshot.autoRotation}
        className="earth-rotation-button"
        onClick={onToggleRotation}
        type="button"
      >
        <ArrowRotateClockwise24Regular aria-hidden />
        {snapshot.autoRotation ? (
          <Pause24Regular aria-hidden />
        ) : (
          <Play24Regular aria-hidden />
        )}
      </button>
    </div>
  );
}
