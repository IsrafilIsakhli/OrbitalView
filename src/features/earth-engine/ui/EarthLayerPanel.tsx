import {
  BuildingMultiple24Regular,
  ChevronDown16Regular,
  ChevronUp16Regular,
  Communication24Regular,
  Dismiss24Regular,
  Eye20Regular,
  EyeOff20Regular,
  GlobeLocation24Regular,
  Layer24Regular,
  LayerDiagonal24Regular,
  Microscope24Regular,
  MoreCircle24Regular,
  NetworkCheck24Regular,
  Rocket24Regular,
  WeatherCloudy24Regular,
} from "@fluentui/react-icons";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  SatelliteCategory,
  SatelliteCategoryCounts,
} from "@/features/satellites/domain/satellite";
import { formatNumber } from "@/shared/i18n/formatters";

const categoryGroups: ReadonlyArray<{
  categories: readonly SatelliteCategory[];
  key: "orbitalNetworks" | "scienceObservation" | "vehiclesEnvironment";
}> = [
  {
    categories: ["station", "starlink", "navigation", "communications"],
    key: "orbitalNetworks",
  },
  {
    categories: ["weather", "science"],
    key: "scienceObservation",
  },
  {
    categories: ["rocket-body", "debris", "other"],
    key: "vehiclesEnvironment",
  },
];

type LayerSectionKey = (typeof categoryGroups)[number]["key"] | "sceneOverlays";

interface EarthLayerPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryLabels: Record<SatelliteCategory, string>;
  categoryCounts: SatelliteCategoryCounts;
  categoryVisibility: Record<SatelliteCategory, boolean>;
  cloudsLabel: string;
  cloudsVisible: boolean;
  collapseLabel: string;
  expandLabel: string;
  focusedCategory: SatelliteCategory | null;
  groundTrackLabel: string;
  groundTrackCount: number;
  groundTrackVisible: boolean;
  launchSitesLabel: string;
  launchSiteCount: number;
  launchSitesVisible: boolean;
  onFocusCategory: (category: SatelliteCategory | null) => void;
  onToggleCategory: (category: SatelliteCategory) => void;
  onToggleClouds: () => void;
  onToggleGroundTrack: () => void;
  onToggleLaunchSites: () => void;
  onToggleNightLights: () => void;
  onToggleOrbits: () => void;
  nightLightsLabel: string;
  nightLightsVisible: boolean;
  orbitCount: number;
  orbitLabel: string;
  orbitsVisible: boolean;
  overviewLabel: string;
  semanticLabel: string;
  semanticMarkerCount: number;
  signalCount: number;
  signalLabel: string;
  title: string;
  visibleSummary: string;
}

export function EarthLayerPanel({
  open,
  onOpenChange,
  categoryLabels,
  categoryCounts,
  categoryVisibility,
  cloudsLabel,
  cloudsVisible,
  collapseLabel,
  expandLabel,
  focusedCategory,
  groundTrackLabel,
  groundTrackCount,
  groundTrackVisible,
  launchSitesLabel,
  launchSiteCount,
  launchSitesVisible,
  onFocusCategory,
  onToggleCategory,
  onToggleClouds,
  onToggleGroundTrack,
  onToggleLaunchSites,
  onToggleNightLights,
  onToggleOrbits,
  nightLightsLabel,
  nightLightsVisible,
  orbitCount,
  orbitLabel,
  orbitsVisible,
  overviewLabel,
  semanticLabel,
  semanticMarkerCount,
  signalCount,
  signalLabel,
  title,
  visibleSummary,
}: EarthLayerPanelProps) {
  const { i18n, t } = useTranslation("earth");
  const localizeNumber = (value: number) => formatNumber(value, i18n.resolvedLanguage);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const wasOpen = useRef(open);
  const close = () => {
    onOpenChange(false);
    triggerRef.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (open && !wasOpen.current) headingRef.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open]);
  const [expandedSections, setExpandedSections] = useState<Record<LayerSectionKey, boolean>>({
    orbitalNetworks: true,
    scienceObservation: false,
    sceneOverlays: false,
    vehiclesEnvironment: false,
  });
  const toggleSection = (section: LayerSectionKey) => {
    setExpandedSections((current) => ({ ...current, [section]: !current[section] }));
  };

  return (
    <>
      <button
        aria-controls="earth-layer-controller"
        aria-expanded={open}
        className="earth-layer-trigger glass-surface"
        ref={triggerRef}
        onClick={() => onOpenChange(!open)}
        type="button"
      >
        <Layer24Regular aria-hidden />
        <span>{t("orbitLegend.openLayers")}</span>
      </button>
      {open && (
        <button
          aria-label={t("orbitLegend.closeLayers")}
          className="earth-layer-backdrop"
          onClick={close}
          type="button"
        />
      )}
      <aside
        aria-labelledby="earth-layer-controller-title"
        className="earth-layer-panel glass-surface"
        hidden={!open}
        data-mobile-open={open}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
        }}
        id="earth-layer-controller"
      >
        <header className="earth-layer-panel__header">
          <div>
            <h2 id="earth-layer-controller-title" ref={headingRef} tabIndex={-1}>{title}</h2>
            <small>{t("orbitLegend.subtitle")}</small>
          </div>
          <button
            aria-label={t("orbitLegend.closeLayers")}
            className="earth-layer-panel__collapse"
            onClick={close}
            type="button"
          >
            <Dismiss24Regular aria-hidden />
          </button>
        </header>
        <div className="earth-layer-panel__body">
          <div className="earth-layer-panel__summary">
            <span>{visibleSummary}</span>
            <details>
              <summary>{t("orbitLegend.renderDetails")}</summary>
              <span><strong>{localizeNumber(signalCount)}</strong> {signalLabel}{" · "}<strong>{localizeNumber(semanticMarkerCount)}</strong> {semanticLabel}</span>
            </details>
          </div>

          <button
            aria-pressed={focusedCategory === null}
            className="earth-layer-panel__overview"
            data-active={focusedCategory === null}
            onClick={() => onFocusCategory(null)}
            type="button"
          >
            <GlobeLocation24Regular aria-hidden />
            <span>{overviewLabel}</span>
            {focusedCategory && <strong>{categoryLabels[focusedCategory]}</strong>}
          </button>

          <div className="earth-layer-panel__scroll-region">
            <div className="earth-layer-panel__categories">
              {categoryGroups.map((group) => (
                <section
                  aria-labelledby={`earth-layer-group-${group.key}`}
                  className="earth-layer-panel__group"
                  key={group.key}
                >
                  <header className="earth-layer-panel__section-header">
                    <h3 id={`earth-layer-group-${group.key}`}><button
                      aria-controls={`earth-layer-content-${group.key}`}
                      aria-expanded={expandedSections[group.key]}
                      aria-label={`${expandedSections[group.key] ? collapseLabel : expandLabel}: ${t(`orbitLegend.groups.${group.key}`)}`}
                      onClick={() => toggleSection(group.key)}
                      type="button"
                    >
                      <span>{t(`orbitLegend.groups.${group.key}`)}</span>
                      <strong>{localizeNumber(group.categories.reduce((sum, category) => sum + categoryCounts[category], 0))}</strong>
                      {expandedSections[group.key]
                        ? <ChevronUp16Regular aria-hidden />
                        : <ChevronDown16Regular aria-hidden />}
                    </button></h3>
                  </header>
                  <div className="earth-layer-panel__section-content" hidden={!expandedSections[group.key]} id={`earth-layer-content-${group.key}`}>
                  {group.categories.map((category) => {
                    const categoryVisible = categoryVisibility[category];
                    const visibility = t(
                      categoryVisible
                        ? "orbitLegend.visibilityState.visible"
                        : "orbitLegend.visibilityState.hidden",
                    );
                    return (
                      <div
                        className="earth-layer-panel__category-row"
                        data-active={focusedCategory === category}
                        data-kind={category}
                        key={category}
                      >
                        <button
                          aria-label={t("orbitLegend.focusCategory", {
                            category: categoryLabels[category],
                            count: localizeNumber(categoryCounts[category]),
                            visibility,
                          })}
                          aria-pressed={focusedCategory === category}
                          className="earth-layer-panel__category-focus"
                          data-visible={categoryVisible}
                          onClick={() => onFocusCategory(category)}
                          type="button"
                        >
                          <CategoryIcon category={category} />
                          <span>{categoryLabels[category]}</span>
                          <strong>{localizeNumber(categoryCounts[category])}</strong>
                        </button>
                        <button
                          aria-label={t("orbitLegend.categoryVisibility", {
                            category: categoryLabels[category],
                            count: localizeNumber(categoryCounts[category]),
                            visibility,
                          })}
                          aria-pressed={categoryVisible}
                          className="earth-layer-panel__category-eye"
                          onClick={() => onToggleCategory(category)}
                          title={visibility}
                          type="button"
                        >
                          {categoryVisible
                            ? <Eye20Regular aria-hidden />
                            : <EyeOff20Regular aria-hidden />}
                        </button>
                      </div>
                    );
                  })}
                  </div>
                </section>
              ))}
            </div>

            <section
              aria-labelledby="earth-layer-overlays"
              className="earth-layer-panel__overlay-section"
            >
              <header className="earth-layer-panel__section-header">
                <h3 id="earth-layer-overlays"><button
                  aria-controls="earth-layer-overlay-content"
                  aria-expanded={expandedSections.sceneOverlays}
                  aria-label={`${expandedSections.sceneOverlays ? collapseLabel : expandLabel}: ${t("orbitLegend.sceneOverlays")}`}
                  onClick={() => toggleSection("sceneOverlays")}
                  type="button"
                >
                  <span>{t("orbitLegend.sceneOverlays")}</span>
                  <strong>{localizeNumber([
                    cloudsVisible,
                    nightLightsVisible,
                    orbitsVisible,
                    groundTrackVisible,
                    launchSitesVisible,
                  ].filter(Boolean).length)}</strong>
                  {expandedSections.sceneOverlays
                    ? <ChevronUp16Regular aria-hidden />
                    : <ChevronDown16Regular aria-hidden />}
                </button></h3>
              </header>
              <div className="earth-layer-panel__switches" hidden={!expandedSections.sceneOverlays} id="earth-layer-overlay-content">
                <LayerSwitch active={cloudsVisible} label={cloudsLabel} localizeNumber={localizeNumber} onClick={onToggleClouds} />
                <LayerSwitch active={nightLightsVisible} label={nightLightsLabel} localizeNumber={localizeNumber} onClick={onToggleNightLights} />
                <LayerSwitch active={orbitsVisible} count={orbitCount} label={orbitLabel} localizeNumber={localizeNumber} onClick={onToggleOrbits} />
                <LayerSwitch active={groundTrackVisible} count={groundTrackCount} label={groundTrackLabel} localizeNumber={localizeNumber} onClick={onToggleGroundTrack} />
                <LayerSwitch active={launchSitesVisible} count={launchSiteCount} label={launchSitesLabel} localizeNumber={localizeNumber} onClick={onToggleLaunchSites} />
              </div>
            </section>
          </div>
        </div>
      </aside>
    </>
  );
}

function CategoryIcon({ category }: { category: SatelliteCategory }) {
  const icons: Record<SatelliteCategory, ReactNode> = {
    communications: <Communication24Regular aria-hidden />,
    debris: <LayerDiagonal24Regular aria-hidden />,
    navigation: <GlobeLocation24Regular aria-hidden />,
    other: <MoreCircle24Regular aria-hidden />,
    "rocket-body": <Rocket24Regular aria-hidden />,
    science: <Microscope24Regular aria-hidden />,
    starlink: <NetworkCheck24Regular aria-hidden />,
    station: <BuildingMultiple24Regular aria-hidden />,
    weather: <WeatherCloudy24Regular aria-hidden />,
  };
  return <i className="earth-layer-panel__category-icon">{icons[category]}</i>;
}

function LayerSwitch({
  active,
  count,
  label,
  localizeNumber,
  onClick,
}: {
  active: boolean;
  count?: number;
  label: string;
  localizeNumber: (value: number) => string;
  onClick: () => void;
}) {
  return (
    <button aria-checked={active} data-active={active} onClick={onClick} role="switch" type="button">
      <span>{label}</span><strong>{count === undefined ? null : localizeNumber(count)}</strong><i aria-hidden />
    </button>
  );
}
