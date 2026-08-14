import {
  CalendarLtr24Regular,
  Alert24Regular,
  DataHistogram24Regular,
  Globe24Regular,
  Home24Regular,
  MoreHorizontal24Regular,
  News24Regular,
  Rocket24Regular,
  Settings24Regular,
  Star24Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { useEffect, useRef, useState } from "react";

import { BrandMark } from "@/shared/ui/BrandMark";
import type { WorkspaceDestination } from "../model/workspaceCoordinator";

export type NavigationId = Extract<WorkspaceDestination,
  | "explore"
  | "satellites"
  | "orbitalAnalysis"
  | "launches"
  | "missions"
  | "spaceNews"
  | "favorites"
  | "notifications">;

interface NavigationRailProps {
  activeItem: NavigationId;
  favoriteCount: number;
  notificationCount: number;
  onNavigate: (item: NavigationId) => void;
  onOpenSettings: () => void;
}

const primaryNavigationItems = [
  { id: "explore", icon: Home24Regular },
  { id: "satellites", icon: Globe24Regular },
  { id: "orbitalAnalysis", icon: DataHistogram24Regular },
  { id: "launches", icon: Rocket24Regular },
  { id: "missions", icon: CalendarLtr24Regular },
  { id: "spaceNews", icon: News24Regular },
] as const;

const secondaryNavigationItems = [
  { id: "favorites", icon: Star24Regular },
  { id: "notifications", icon: Alert24Regular },
] as const;

const mobilePrimaryItems = primaryNavigationItems.filter(({ id }) =>
  id === "explore" || id === "satellites" || id === "launches"
);
const mobileMoreItems = [
  primaryNavigationItems[2],
  primaryNavigationItems[4],
  primaryNavigationItems[5],
  secondaryNavigationItems[0],
] as const;

export function NavigationRail({
  activeItem,
  favoriteCount,
  notificationCount,
  onNavigate,
  onOpenSettings,
}: NavigationRailProps) {
  const { t } = useTranslation(["common", "navigation"]);
  const navRef = useRef<HTMLElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!moreOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [moreOpen]);
  const handleRovingKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
    const buttons = Array.from(navRef.current?.querySelectorAll<HTMLButtonElement>("button.navigation-item") ?? []);
    if (buttons.length === 0) return;
    event.preventDefault();
    const currentIndex = Math.max(0, buttons.indexOf(event.currentTarget));
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : event.key === "ArrowDown"
          ? (currentIndex + 1) % buttons.length
          : (currentIndex - 1 + buttons.length) % buttons.length;
    buttons[nextIndex]?.focus();
  };

  return (
    <aside className="navigation-rail">
      <div className="navigation-rail__brand">
        <BrandMark className="navigation-rail__mark" />
        <div className="navigation-rail__brand-copy">
          <strong>{t("common:brand.name")}</strong>
          <span>{t("common:brand.tagline")}</span>
        </div>
      </div>

      <nav aria-label={t("common:brand.name")} className="navigation-rail__items navigation-rail__items--desktop" ref={navRef}>
        {primaryNavigationItems.map(({ id, icon: Icon }) => (
          <button
            aria-label={t(`navigation:${id}`)}
            aria-current={activeItem === id ? "page" : undefined}
            className="navigation-item"
            data-active={activeItem === id}
            key={id}
            title={t(`navigation:${id}`)}
            onKeyDown={handleRovingKey}
            onClick={() => {
              setMoreOpen(false);
              onNavigate(id);
            }}
            type="button"
          >
            <Icon aria-hidden />
            <span>{t(`navigation:${id}`)}</span>
          </button>
        ))}
        <span aria-hidden className="navigation-rail__divider" />
        {secondaryNavigationItems.map(({ id, icon: Icon }) => (
          <button
            aria-label={t(`navigation:${id}`)}
            aria-current={activeItem === id ? "page" : undefined}
            className="navigation-item navigation-item--secondary"
            data-active={activeItem === id}
            key={id}
            title={t(`navigation:${id}`)}
            onKeyDown={handleRovingKey}
            onClick={() => {
              setMoreOpen(false);
              onNavigate(id);
            }}
            type="button"
          >
            <Icon aria-hidden />
            <span>{t(`navigation:${id}`)}</span>
            {id === "favorites" && favoriteCount > 0 && <span className="navigation-item__badge">{favoriteCount}</span>}
            {id === "notifications" && notificationCount > 0 && <span className="navigation-item__badge">{Math.min(notificationCount, 99)}</span>}
          </button>
        ))}
      </nav>

      <button
        aria-label={t("navigation:settings")}
        className="navigation-item navigation-item--settings"
        onClick={onOpenSettings}
        title={t("navigation:settings")}
        type="button"
      >
        <Settings24Regular aria-hidden />
        <span>{t("navigation:settings")}</span>
      </button>

      <nav aria-label={t("common:brand.name")} className="mobile-navigation">
        {mobilePrimaryItems.map(({ id, icon: Icon }) => (
          <button
            aria-label={`${t(`navigation:${id}`)} · ${t("navigation:mobile")}`}
            aria-current={activeItem === id ? "page" : undefined}
            data-active={activeItem === id}
            key={id}
            onClick={() => {
              setMoreOpen(false);
              onNavigate(id);
            }}
            type="button"
          >
            <Icon aria-hidden />
            <span>{t(`navigation:${id}`)}</span>
          </button>
        ))}
        <button
          aria-expanded={moreOpen}
          aria-label={t("navigation:more")}
          data-active={moreOpen || mobileMoreItems.some(({ id }) => id === activeItem)}
          onClick={() => setMoreOpen((value) => !value)}
          type="button"
        >
          <MoreHorizontal24Regular aria-hidden />
          <span>{t("navigation:more")}</span>
        </button>
      </nav>

      {moreOpen && (
        <>
          <button
            aria-label={t("common:actions.close")}
            className="mobile-navigation__backdrop"
            onClick={() => setMoreOpen(false)}
            type="button"
          />
          <section aria-label={t("navigation:more")} className="mobile-navigation__sheet">
            <span aria-hidden className="mobile-navigation__handle" />
            {mobileMoreItems.map(({ id, icon: Icon }) => (
              <button
                aria-current={activeItem === id ? "page" : undefined}
                data-active={activeItem === id}
                key={id}
                onClick={() => {
                  setMoreOpen(false);
                  onNavigate(id);
                }}
                type="button"
              >
                <Icon aria-hidden />
                <span>{t(`navigation:${id}`)}</span>
                {id === "favorites" && favoriteCount > 0 && <strong>{favoriteCount}</strong>}
              </button>
            ))}
            <button onClick={() => {
              setMoreOpen(false);
              onOpenSettings();
            }} type="button">
              <Settings24Regular aria-hidden />
              <span>{t("navigation:settings")}</span>
            </button>
          </section>
        </>
      )}
    </aside>
  );
}
