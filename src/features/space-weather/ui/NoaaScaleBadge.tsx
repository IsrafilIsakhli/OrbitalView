import { useTranslation } from "react-i18next";

import type { NoaaScaleReading, NoaaScaleType } from "../domain/spaceWeather";

export function NoaaScaleBadge({ scale, scaleType }: { scale: NoaaScaleReading | null; scaleType: NoaaScaleType }) {
  const { t } = useTranslation("spaceWeather");
  const prefix = scaleType === "radioBlackout"
    ? "R"
    : scaleType === "solarRadiation"
      ? "S"
      : "G";
  const level = scale?.level ?? null;
  return (
    <span className="noaa-scale-badge" data-level={level ?? "unavailable"}>
      <strong>{prefix}{level ?? "—"}</strong>
      <span>{scale?.text ?? t("scale.none")}</span>
    </span>
  );
}
