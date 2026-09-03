import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useSpaceIntelligence } from "@/features/launches/api/useSpaceIntelligence";
import { useSpaceNews } from "@/features/space-news/api/useSpaceNews";
import { useNoaaSpaceWeather } from "@/features/space-weather/api/useNoaaSpaceWeather";

import type { AwarenessNotification } from "../domain/awareness";
import { useAwarenessStore } from "../model/awarenessStore";
import { deliverNativeNotification } from "../platform/nativeNotifications";

const MINUTE_MS = 60_000;

export function NotificationEngine() {
  const { t } = useTranslation("awareness");
  const query = useSpaceIntelligence();
  const noaa = useNoaaSpaceWeather();
  const news = useSpaceNews({ featured: true, limit: 10 });
  const alertPreferences = useAwarenessStore((state) => state.alertPreferences);
  const favorites = useAwarenessStore((state) => state.favorites);
  const pushNotification = useAwarenessStore((state) => state.pushNotification);
  const claimNativeDelivery = useAwarenessStore((state) => state.claimNativeDelivery);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), MINUTE_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const intelligence = query.data;
    if (!intelligence) return;

    if (alertPreferences.launchAlerts) {
      const favoriteLaunchIds = new Set(
        favorites.filter((item) => item.kind === "launch").map((item) => item.id),
      );
      const candidates = intelligence.launches.filter((launch, index) =>
        index === 0 || favoriteLaunchIds.has(launch.id),
      );
      for (const launch of candidates) {
        const hours = (Date.parse(launch.net) - now) / 3_600_000;
        if (hours <= 0 || hours > alertPreferences.launchLeadHours) continue;
        const notification = pushNotification({
          body: t("generated.launchBody", {
            agency: launch.agencyName ?? t("common.unknown"),
            hours: Math.max(1, Math.round(hours)),
          }),
          dedupeKey: `launch:${launch.id}:${alertPreferences.launchLeadHours}`,
          kind: "launch",
          targetId: launch.id,
          targetType: "launch",
          title: launch.name,
        });
        void maybeDeliverNative(notification, alertPreferences.nativeNotifications, claimNativeDelivery, isQuietHours(alertPreferences));
      }
    }

    if (alertPreferences.missionAlerts) {
      const favoriteEventIds = new Set(
        favorites.filter((item) => item.kind === "event").map((item) => item.id),
      );
      for (const event of intelligence.events) {
        if (!favoriteEventIds.has(event.id)) continue;
        const hours = (Date.parse(event.date) - now) / 3_600_000;
        if (hours <= 0 || hours > alertPreferences.launchLeadHours) continue;
        const notification = pushNotification({
          body: t("generated.missionBody", { hours: Math.max(1, Math.round(hours)) }),
          dedupeKey: `event:${event.id}:${alertPreferences.launchLeadHours}`,
          kind: "mission",
          targetId: event.id,
          targetType: "event",
          title: event.name,
        });
        void maybeDeliverNative(notification, alertPreferences.nativeNotifications, claimNativeDelivery, isQuietHours(alertPreferences));
      }
    }
  }, [alertPreferences, claimNativeDelivery, favorites, now, pushNotification, query.data, t]);

  useEffect(() => {
    if (!alertPreferences.weatherAlerts || !noaa.data) return;
    for (const alert of noaa.data.alerts.slice(0, 8)) {
      const notification = pushNotification({
        body: alert.message.slice(0, 360),
        dedupeKey: `noaa:${alert.productId}:${alert.issuedAtUnixMs}`,
        kind: "weather",
        targetId: null,
        targetType: null,
        title: alert.headline,
      });
      void maybeDeliverNative(notification, alertPreferences.nativeNotifications, claimNativeDelivery, isQuietHours(alertPreferences));
    }
  }, [alertPreferences, claimNativeDelivery, noaa.data, pushNotification]);

  useEffect(() => {
    if (!alertPreferences.newsAlerts || !news.data) return;
    for (const item of news.data.items.filter((candidate) => candidate.featured).slice(0, 6)) {
      const notification = pushNotification({
        body: t("generated.newsBody", { source: item.source }),
        dedupeKey: `news:featured:${item.id}`,
        kind: "news",
        targetId: item.id,
        targetType: "news",
        title: item.title,
      });
      void maybeDeliverNative(notification, alertPreferences.nativeNotifications, claimNativeDelivery, isQuietHours(alertPreferences));
    }
  }, [alertPreferences, claimNativeDelivery, news.data, pushNotification, t]);

  return null;
}

async function maybeDeliverNative(
  notification: AwarenessNotification | null,
  enabled: boolean,
  claim: () => boolean,
  quiet: boolean,
): Promise<void> {
  if (!notification || !enabled || quiet || !claim()) return;
  await deliverNativeNotification(notification.title, notification.body);
}

function isQuietHours(preferences: { quietHoursEnabled: boolean; quietHoursEnd: number; quietHoursStart: number }): boolean {
  if (!preferences.quietHoursEnabled) return false;
  const hour = new Date().getHours();
  return preferences.quietHoursStart > preferences.quietHoursEnd
    ? hour >= preferences.quietHoursStart || hour < preferences.quietHoursEnd
    : hour >= preferences.quietHoursStart && hour < preferences.quietHoursEnd;
}
