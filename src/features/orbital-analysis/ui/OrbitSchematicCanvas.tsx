import { useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { usePreferencesStore } from "@/features/settings/model/preferences";
import { formatDistanceFromKm } from "@/shared/formatting/units";
import { formatDateTime } from "@/shared/i18n/formatters";
import type { DynamicsSample } from "../domain/analysis";
import { SGP4_EARTH_RADIUS_KM } from "../domain/orbitalMath";
import { radiusSchematic } from "../domain/radiusSchematic";

export function OrbitSchematicCanvas({ ariaLabel, samples, selectedIndex, onSelectIndex }: {
  ariaLabel: string;
  samples: DynamicsSample[];
  selectedIndex: number;
  onSelectIndex?: (index: number) => void;
}) {
  const { t } = useTranslation("orbitalAnalysis");
  const locale = usePreferencesStore((state) => state.locale);
  const units = usePreferencesStore((state) => state.units);
  const gradientId = useId();
  const geometry = useMemo(() => {
    const { points, maxRadiusKm } = radiusSchematic(samples);
    const scale = 148 / maxRadiusKm;
    const scaled = points.map((point) => ({ x: 190 + point.x * scale, y: 180 + point.y * scale }));
    return {
      points: scaled,
      earthRadius: SGP4_EARTH_RADIUS_KM * scale,
      path: scaled.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" "),
    };
  }, [samples]);
  const index = Math.min(samples.length - 1, Math.max(0, selectedIndex));
  const selected = samples[index];
  const point = geometry.points[index];
  if (!selected || !point) return null;
  return (
    <div className="analysis-radius">
      <div className="analysis-radius__diagram">
        <svg aria-label={ariaLabel} role="img" viewBox="0 0 380 360">
          <defs>
            <radialGradient id={gradientId} cx="32%" cy="28%" r="75%">
              <stop offset="0" stopColor="#246b96" />
              <stop offset=".68" stopColor="#0b304b" />
              <stop offset="1" stopColor="#061322" />
            </radialGradient>
          </defs>
          <circle cx="190" cy="180" r={geometry.earthRadius} fill={`url(#${gradientId})`} stroke="#4d97b1" strokeWidth="1" />
          <ellipse cx="190" cy="180" rx={geometry.earthRadius * .48} ry={geometry.earthRadius} fill="none" stroke="#73b6d0" strokeOpacity=".18" />
          <ellipse cx="190" cy="180" rx={geometry.earthRadius} ry={geometry.earthRadius * .36} fill="none" stroke="#73b6d0" strokeOpacity=".18" />
          <path d={geometry.path} fill="none" stroke="#79e6ff" strokeWidth="1.8" strokeLinejoin="round" />
          <line x1="190" y1="180" x2={point.x} y2={point.y} stroke="#ffca70" strokeWidth="1.2" strokeDasharray="4 4" />
          <circle cx="190" cy="180" r="2.5" fill="#ffca70" />
          <circle cx={point.x} cy={point.y} r="10" fill="#ffca70" fillOpacity=".12" />
          <circle cx={point.x} cy={point.y} r="4" fill="#ffca70" stroke="#fff0ce" />
        </svg>
      </div>
      <div className="analysis-radius__readout">
        <p className="eyebrow">{t("dynamics.selectedInstant")}</p>
        <time>{formatDateTime(selected.timestampUnixMs, locale, "utc-only").primary}</time>
        <dl>
          <div><dt>{t("dynamics.radius")}</dt><dd>{formatDistanceFromKm(selected.radiusKm, units, locale, 2)}</dd></div>
          <div><dt>{t("dynamics.altitude")}</dt><dd>{formatDistanceFromKm(selected.altitudeKm, units, locale, 2)}</dd></div>
          <div><dt>{t("dynamics.earthRadius")}</dt><dd>{formatDistanceFromKm(SGP4_EARTH_RADIUS_KM, units, locale, 2)}</dd></div>
        </dl>
        <p className="analysis-radius__note">{t("dynamics.radiusDescription")}</p>
        <label className="analysis-radius__slider">
          <span>{t("dynamics.selectedInstant")} <b>{index + 1} / {samples.length}</b></span>
          <input aria-label={t("dynamics.selectedInstant")} type="range" min="0" max={samples.length - 1} value={index} onChange={(event) => onSelectIndex?.(Number(event.target.value))} />
        </label>
      </div>
    </div>
  );
}
