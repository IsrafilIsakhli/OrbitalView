import {
  Alert24Regular,
  LocalLanguage24Regular,
  Search24Regular,
} from "@fluentui/react-icons";
import { AnimatePresence, motion } from "motion/react";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { LanguageDialog } from "@/features/onboarding/ui/LanguageDialog";
import type { AwarenessNotification, FavoriteItem } from "@/features/awareness/domain/awareness";
import { selectUnreadCount, useAwarenessStore } from "@/features/awareness/model/awarenessStore";
import { FavoritesDashboard } from "@/features/awareness/ui/FavoritesDashboard";
import { NotificationEngine } from "@/features/awareness/ui/NotificationEngine";
import { NotificationsDashboard } from "@/features/awareness/ui/NotificationsDashboard";
import { EarthViewport } from "@/features/earth-engine/ui/EarthViewport";
import { SpaceIntelligenceDashboard } from "@/features/dashboard/ui/SpaceIntelligenceDashboard";
import { useLaunchSelectionStore } from "@/features/launches/model/selection";
import { useMissionSelectionStore } from "@/features/launches/model/missionSelection";
import { LaunchDashboard } from "@/features/launches/ui/LaunchDashboard";
import { MissionDashboard } from "@/features/launches/ui/MissionDashboard";
import { NasaDashboard } from "@/features/nasa/ui/NasaDashboard";
import { useAnalysisSelectionStore } from "@/features/orbital-analysis/model/analysisSelection";
import { usePreferencesStore } from "@/features/settings/model/preferences";
import { SettingsPanel } from "@/features/settings/ui/SettingsPanel";
import { useNewsSelectionStore } from "@/features/space-news/model/newsSelection";
import { SpaceNewsDashboard } from "@/features/space-news/ui/SpaceNewsDashboard";
import { SpaceWeatherDetailWorkspace } from "@/features/space-weather/ui/SpaceWeatherDetailWorkspace";
import { useSatelliteSelectionStore } from "@/features/satellites/model/selection";
import { localeFlags } from "@/shared/i18n/locales";

import {
  NavigationRail,
  type NavigationId,
} from "./components/NavigationRail";
import { SearchPalette } from "./components/SearchPalette";
import { TitleBar } from "./components/TitleBar";
import type { WorkspaceSelectionIntent } from "./model/workspaceSelection";
import { useWorkspaceCoordinator } from "./model/workspaceCoordinator";

const OrbitalAnalysisWorkspace = lazy(() =>
  import("@/features/orbital-analysis/ui/OrbitalAnalysisWorkspace").then((module) => ({
    default: module.OrbitalAnalysisWorkspace,
  })),
);

export function AppShell() {
  const { t } = useTranslation(["common", "navigation", "settings", "shell", "spaceWeather"]);
  const locale = usePreferencesStore((state) => state.locale);
  const activeItem = useWorkspaceCoordinator((state) => state.current.destination);
  const navigate = useWorkspaceCoordinator((state) => state.navigate);
  const navigateBack = useWorkspaceCoordinator((state) => state.back);
  const canNavigateBack = useWorkspaceCoordinator((state) => state.canGoBack);
  const earthMounted = useWorkspaceCoordinator((state) => state.visited.includes("satellites"));
  const analysisMounted = useWorkspaceCoordinator((state) => state.visited.includes("orbitalAnalysis"));
  const [languageOpen, setLanguageOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const favoriteCount = useAwarenessStore((state) => state.favorites.length);
  const unreadCount = useAwarenessStore(selectUnreadCount);
  const requestSatellite = useSatelliteSelectionStore(
    (state) => state.requestSatellite,
  );
  const requestLaunch = useLaunchSelectionStore((state) => state.requestLaunch);
  const requestEvent = useMissionSelectionStore((state) => state.requestEvent);
  const requestMissionLaunch = useMissionSelectionStore((state) => state.requestLaunch);
  const requestNews = useNewsSelectionStore((state) => state.requestNews);
  const requestAnalysis = useAnalysisSelectionStore((state) => state.requestAnalysis);
  const activeNavigationItem: NavigationId = activeItem === "nasa" || activeItem === "spaceWeather"
    ? "explore"
    : activeItem;

  const openLanguageFromSettings = useCallback(() => {
    setSettingsOpen(false);
    window.setTimeout(() => setLanguageOpen(true), 0);
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }

      if ((event.ctrlKey || event.metaKey) && event.key === ",") {
        event.preventDefault();
        setSettingsOpen(true);
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    const handleWorkspaceBack = (event: KeyboardEvent) => {
      const keyboardBack = event.altKey && event.key === "ArrowLeft";
      const contextualEscape = event.key === "Escape" && (activeItem === "nasa" || activeItem === "spaceWeather" || activeItem === "orbitalAnalysis");
      if ((!keyboardBack && !contextualEscape) || !canNavigateBack || searchOpen || settingsOpen) return;
      event.preventDefault();
      navigateBack();
    };
    window.addEventListener("keydown", handleWorkspaceBack);
    return () => window.removeEventListener("keydown", handleWorkspaceBack);
  }, [activeItem, canNavigateBack, navigateBack, searchOpen, settingsOpen]);

  const navigateToIntent = useCallback((selection: WorkspaceSelectionIntent, origin: "search" | "favorite" | "notification" = "search") => {
    setSearchOpen(false);
    if (selection.type === "satellite") {
      requestSatellite(selection.satelliteId);
      navigate("satellites", origin);
      return;
    }
    if (selection.type === "launch") {
      requestLaunch(selection.launchId);
      navigate("launches", origin);
      return;
    }
    if (selection.type === "event") {
      requestEvent(selection.eventId);
      navigate("missions", origin);
      return;
    }
    if (selection.type === "news") {
      requestNews(selection.newsId);
      navigate("spaceNews", origin);
      return;
    }
    if (selection.type === "mission") {
      requestMissionLaunch(selection.launchId);
      navigate("missions", origin);
      return;
    }
    if (selection.type === "rocket") {
      requestLaunch(selection.launchId);
      navigate("launches", origin);
      return;
    }
    if (selection.type === "launchSite") {
      requestLaunch(selection.launchId);
      navigate("satellites", origin);
      return;
    }
    if (selection.type === "nasa") {
      navigate("nasa", origin);
      return;
    }
    if (selection.type === "orbitalAnalysis") {
      requestAnalysis(selection.satelliteId, selection.tab);
      navigate("orbitalAnalysis", origin);
      return;
    }
    const { destination } = selection;
    if (destination === "settings") {
      setSettingsOpen(true);
      return;
    }
    navigate(destination, origin);
  }, [navigate, requestAnalysis, requestEvent, requestLaunch, requestMissionLaunch, requestNews, requestSatellite]);

  const openFavorite = (favorite: FavoriteItem) => {
    if (favorite.kind === "satellite") {
      navigateToIntent({ satelliteId: favorite.id, type: "satellite" }, "favorite");
      return;
    }
    if (favorite.kind === "launch") {
      navigateToIntent({ launchId: favorite.id, type: "launch" }, "favorite");
      return;
    }
    navigateToIntent({ eventId: favorite.id, type: "event" }, "favorite");
  };

  const openNotification = (notification: AwarenessNotification) => {
    if (!notification.targetId || !notification.targetType) return;
    if (notification.targetType === "news") {
      navigateToIntent({ newsId: notification.targetId, type: "news" }, "notification");
      return;
    }
    openFavorite({
      addedAt: notification.createdAt,
      id: notification.targetId,
      imageUrl: null,
      kind: notification.targetType,
      occurredAt: null,
      subtitle: notification.body,
      title: notification.title,
    });
  };

  return (
    <div className="app-frame">
      <TitleBar />
      <div className="app-layout" data-earth-active={activeItem === "satellites"}>
        <NavigationRail
          activeItem={activeNavigationItem}
          favoriteCount={favoriteCount}
          notificationCount={unreadCount}
          onNavigate={(destination) => navigate(destination, "navigation")}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <main className="workspace">
          <header className="command-bar">
            <button className="search-trigger" onClick={() => setSearchOpen(true)} type="button">
              <Search24Regular aria-hidden />
              <span>{t("shell:search.placeholder")}</span>
              <kbd>{t("shell:search.shortcut")}</kbd>
            </button>

            <div className="command-bar__actions">
              <button
                aria-label={t("navigation:notifications")}
                className="icon-button command-action"
                onClick={() => navigate("notifications", "navigation")}
                type="button"
              >
                <Alert24Regular aria-hidden />
                {unreadCount > 0 && <span className="command-action__count">{Math.min(unreadCount, 99)}</span>}
              </button>
              <button
                aria-label={t("settings:language.label")}
                className="locale-button"
                onClick={() => setLanguageOpen(true)}
                type="button"
              >
                <LocalLanguage24Regular aria-hidden />
                <span aria-hidden>{localeFlags[locale]}</span>
              </button>
            </div>
          </header>

          {earthMounted && (
            <section
              aria-hidden={activeItem !== "satellites"}
              className="space-canvas earth-workspace-host"
              data-active={activeItem === "satellites"}
            >
              <EarthViewport
                active={activeItem === "satellites"}
                onOpenAnalysis={(satelliteId) => {
                  requestAnalysis(satelliteId, "dynamics");
                  navigate("orbitalAnalysis", "relation");
                }}
              />
            </section>
          )}

          {analysisMounted && (
            <section
              aria-hidden={activeItem !== "orbitalAnalysis"}
              className="module-canvas analysis-workspace-host"
              data-active={activeItem === "orbitalAnalysis"}
            >
              <Suspense fallback={null}>
                <OrbitalAnalysisWorkspace
                  active={activeItem === "orbitalAnalysis"}
                  onShowEarth={(satelliteId) => {
                    requestSatellite(satelliteId);
                    navigate("satellites", "relation");
                  }}
                />
              </Suspense>
            </section>
          )}

          <AnimatePresence mode="wait">
            {activeItem === "explore" ? (
              <motion.section
                animate={{ opacity: 1, y: 0 }}
                className="module-canvas"
                exit={{ opacity: 0, y: 6 }}
                initial={{ opacity: 0, y: 6 }}
                key="command-dashboard"
                transition={{ duration: 0.3 }}
              >
                <SpaceIntelligenceDashboard
                  onOpenEarth={() => navigate("satellites", "dashboard")}
                  onOpenLaunch={(launchId) => { requestLaunch(launchId); navigate("launches", "dashboard"); }}
                  onOpenLaunches={() => navigate("launches", "dashboard")}
                  onOpenMissions={() => navigate("missions", "dashboard")}
                  onOpenNasa={() => navigate("nasa", "dashboard")}
                  onOpenNews={() => navigate("spaceNews", "dashboard")}
                  onOpenNewsItem={(newsId) => { requestNews(newsId); navigate("spaceNews", "dashboard"); }}
                  onOpenSpaceWeather={() => navigate("spaceWeather", "dashboard")}
                />
              </motion.section>
            ) : activeItem === "satellites" ? (
              null
            ) : activeItem === "orbitalAnalysis" ? (
              null
            ) : activeItem === "launches" ? (
              <motion.section
                animate={{ opacity: 1, y: 0 }}
                className="module-canvas"
                exit={{ opacity: 0, y: 6 }}
                initial={{ opacity: 0, y: 6 }}
                key="launches"
                transition={{ duration: 0.3 }}
              >
                <LaunchDashboard
                  onOpenNews={(newsId) => { requestNews(newsId); navigate("spaceNews", "relation"); }}
                  onShowEarth={(launchId) => { requestLaunch(launchId); navigate("satellites", "relation"); }}
                />
              </motion.section>
            ) : activeItem === "missions" ? (
              <motion.section
                animate={{ opacity: 1, y: 0 }}
                className="module-canvas"
                exit={{ opacity: 0, y: 6 }}
                initial={{ opacity: 0, y: 6 }}
                key="missions"
                transition={{ duration: 0.3 }}
              >
                <MissionDashboard
                  onOpenLaunch={(launchId) => { requestLaunch(launchId); navigate("launches", "relation"); }}
                  onShowLaunchSite={(launchId) => { requestLaunch(launchId); navigate("satellites", "relation"); }}
                  onTrackSatellite={(satelliteId) => { requestSatellite(satelliteId); navigate("satellites", "relation"); }}
                />
              </motion.section>
            ) : activeItem === "spaceNews" ? (
              <motion.section
                animate={{ opacity: 1, y: 0 }}
                className="module-canvas"
                exit={{ opacity: 0, y: 6 }}
                initial={{ opacity: 0, y: 6 }}
                key="space-news"
                transition={{ duration: 0.3 }}
              >
                <SpaceNewsDashboard
                  onOpenEvent={(eventId) => { requestEvent(eventId); navigate("missions", "relation"); }}
                  onOpenLaunch={(launchId) => { requestLaunch(launchId); navigate("launches", "relation"); }}
                />
              </motion.section>
            ) : activeItem === "favorites" ? (
              <motion.section
                animate={{ opacity: 1, y: 0 }}
                className="module-canvas"
                exit={{ opacity: 0, y: 6 }}
                initial={{ opacity: 0, y: 6 }}
                key="favorites"
                transition={{ duration: 0.3 }}
              >
                <FavoritesDashboard onOpen={openFavorite} />
              </motion.section>
            ) : activeItem === "notifications" ? (
              <motion.section
                animate={{ opacity: 1, y: 0 }}
                className="module-canvas"
                exit={{ opacity: 0, y: 6 }}
                initial={{ opacity: 0, y: 6 }}
                key="notifications"
                transition={{ duration: 0.3 }}
              >
                <NotificationsDashboard onOpen={openNotification} />
              </motion.section>
            ) : activeItem === "nasa" ? (
              <motion.section animate={{ opacity: 1, y: 0 }} className="module-canvas" exit={{ opacity: 0, y: 6 }} initial={{ opacity: 0, y: 6 }} key="nasa" transition={{ duration: 0.3 }}>
                <button className="workspace-back-button secondary-button" onClick={navigateBack} type="button">← {t("spaceWeather:actions.back")}</button>
                <NasaDashboard />
              </motion.section>
            ) : activeItem === "spaceWeather" ? (
              <motion.section animate={{ opacity: 1, y: 0 }} className="module-canvas" exit={{ opacity: 0, y: 6 }} initial={{ opacity: 0, y: 6 }} key="space-weather" transition={{ duration: 0.3 }}>
                <SpaceWeatherDetailWorkspace onBack={navigateBack} />
              </motion.section>
            ) : null}
          </AnimatePresence>
        </main>
      </div>

      <SearchPalette
        onClose={() => setSearchOpen(false)}
        onSelect={navigateToIntent}
        open={searchOpen}
      />
      <SettingsPanel
        onClose={() => setSettingsOpen(false)}
        onOpenLanguage={openLanguageFromSettings}
        open={settingsOpen}
      />
      <LanguageDialog onClose={() => setLanguageOpen(false)} open={languageOpen} />
      <NotificationEngine />
    </div>
  );
}
