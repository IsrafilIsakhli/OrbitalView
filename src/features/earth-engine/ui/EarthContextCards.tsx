import { Globe24Regular, Rocket24Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";

import type { LaunchRecord } from "@/features/launches/domain/launch";
import type { SatelliteRecord } from "@/features/satellites/domain/satellite";
import { formatDateTime } from "@/shared/i18n/formatters";

interface EarthContextCardsProps {
  nextLaunch: LaunchRecord | null;
  onSelectLaunch: (id: string) => void;
  onSelectSatellite: (id: string) => void;
  station: SatelliteRecord | null;
}

export function EarthContextCards({
  nextLaunch,
  onSelectLaunch,
  onSelectSatellite,
  station,
}: EarthContextCardsProps) {
  const { i18n, t } = useTranslation("earth");
  const locale = i18n.resolvedLanguage ?? "en";
  if (!station && !nextLaunch) return null;

  return (
    <nav aria-label={t("context.title")} className="earth-context-cards">
      {station && (
        <button aria-label={`${t("context.station")}: ${station.name} · ${t("context.norad", { id: station.noradId })}`} onClick={() => onSelectSatellite(station.id)} type="button">
          <span className="earth-context-cards__icon" data-kind="station">
            <Globe24Regular aria-hidden />
          </span>
          <span>
            <small>{t("context.station")}</small>
            <strong title={station.name}>{station.name}</strong>
            <em>{t("context.norad", { id: station.noradId })}</em>
          </span>
        </button>
      )}
      {nextLaunch && (
        <button aria-label={`${t("context.nextLaunch")}: ${nextLaunch.name} · ${formatLaunch(nextLaunch, locale)}`} onClick={() => onSelectLaunch(nextLaunch.id)} type="button">
          <span className="earth-context-cards__icon" data-kind="launch">
            <Rocket24Regular aria-hidden />
          </span>
          <span>
            <small>{t("context.nextLaunch")}</small>
            <strong title={nextLaunch.name}>{nextLaunch.name}</strong>
            <em title={formatLaunch(nextLaunch, locale)}>{formatLaunch(nextLaunch, locale)}</em>
          </span>
        </button>
      )}
    </nav>
  );
}

function formatLaunch(launch: LaunchRecord, locale: string): string {
  const date = formatDateTime(launch.net, locale, "utc-only", { year: undefined }).primary;
  return [date, launch.padName ?? launch.locationName].filter(Boolean).join(" · ");
}
