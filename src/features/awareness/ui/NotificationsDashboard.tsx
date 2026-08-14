import {
  Alert24Regular,
  Checkmark20Regular,
  Delete20Regular,
  DesktopPulse24Regular,
  Rocket24Regular,
  News24Regular,
  WeatherRain24Regular,
} from "@fluentui/react-icons";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDateTime } from "@/shared/i18n/formatters";

import type {
  AwarenessNotification,
  AwarenessNotificationKind,
} from "../domain/awareness";
import {
  selectUnreadCount,
  useAwarenessStore,
} from "../model/awarenessStore";
import { enableNativeNotifications } from "../platform/nativeNotifications";

interface NotificationsDashboardProps {
  onOpen: (notification: AwarenessNotification) => void;
}

type NotificationFilter = "all" | "unread" | AwarenessNotificationKind;

const filters: NotificationFilter[] = [
  "all",
  "unread",
  "launch",
  "mission",
  "satellite",
  "weather",
  "news",
  "system",
];

export function NotificationsDashboard({ onOpen }: NotificationsDashboardProps) {
  const { i18n, t } = useTranslation("awareness");
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [permissionState, setPermissionState] = useState<"idle" | "working" | "denied">("idle");
  const notifications = useAwarenessStore((state) => state.notifications);
  const unreadCount = useAwarenessStore(selectUnreadCount);
  const preferences = useAwarenessStore((state) => state.alertPreferences);
  const clearNotifications = useAwarenessStore((state) => state.clearNotifications);
  const markAllRead = useAwarenessStore((state) => state.markAllRead);
  const markRead = useAwarenessStore((state) => state.markRead);
  const setPreference = useAwarenessStore((state) => state.setAlertPreference);
  const locale = i18n.resolvedLanguage ?? "en";

  const filtered = useMemo(() => notifications.filter((notification) => {
    if (filter === "all") return true;
    if (filter === "unread") return !notification.read;
    return notification.kind === filter;
  }), [filter, notifications]);

  const enableNative = async () => {
    setPermissionState("working");
    const granted = await enableNativeNotifications();
    setPreference("nativeNotifications", granted);
    setPermissionState(granted ? "idle" : "denied");
  };

  return (
    <section className="awareness-dashboard notification-dashboard">
      <header className="awareness-header">
        <div>
          <p className="eyebrow"><span />{t("notifications.eyebrow")}</p>
          <h1>{t("notifications.title")}</h1>
          <p>{t("notifications.subtitle")}</p>
        </div>
        <div className="notification-header-actions">
          <span className="awareness-count"><Alert24Regular aria-hidden /><strong>{unreadCount}</strong>{t("notifications.unread")}</span>
          <button disabled={unreadCount === 0} onClick={markAllRead} type="button"><Checkmark20Regular aria-hidden />{t("notifications.markAll")}</button>
          <button disabled={notifications.length === 0} onClick={clearNotifications} type="button"><Delete20Regular aria-hidden />{t("notifications.clear")}</button>
        </div>
      </header>

      <div className="notification-layout">
        <div className="notification-feed glass-surface">
          <div className="notification-filters">
            {filters.map((item) => <button data-active={filter === item} key={item} onClick={() => setFilter(item)} type="button">{t(`notifications.filter.${item}`)}</button>)}
          </div>
          <div className="notification-list">
            {filtered.length === 0 ? (
              <div className="notification-empty"><Alert24Regular aria-hidden /><h2>{t("notifications.emptyTitle")}</h2><p>{t("notifications.emptyBody")}</p></div>
            ) : filtered.map((notification) => (
              <button
                className="notification-item"
                data-read={notification.read}
                key={notification.id}
                onClick={() => {
                  markRead(notification.id);
                  if (notification.targetId) onOpen(notification);
                }}
                type="button"
              >
                <span className={`notification-item__icon notification-item__icon--${notification.kind}`}><NotificationIcon kind={notification.kind} /></span>
                <span className="notification-item__content"><small>{t(`notifications.kind.${notification.kind}`)}</small><strong>{notification.title}</strong><span>{notification.body}</span><time>{formatRelative(notification.createdAt, locale)}</time></span>
                {!notification.read && <i />}
              </button>
            ))}
          </div>
        </div>

        <aside className="alert-settings glass-surface">
          <header><DesktopPulse24Regular aria-hidden /><div><small>{t("settings.eyebrow")}</small><h2>{t("settings.title")}</h2></div></header>
          <SettingToggle checked={preferences.launchAlerts} label={t("settings.launches")} onChange={(value) => setPreference("launchAlerts", value)} />
          <SettingToggle checked={preferences.missionAlerts} label={t("settings.missions")} onChange={(value) => setPreference("missionAlerts", value)} />
          <SettingToggle checked={preferences.satelliteAlerts} label={t("settings.satellites")} onChange={(value) => setPreference("satelliteAlerts", value)} />
          <SettingToggle checked={preferences.weatherAlerts} label={t("settings.weather")} onChange={(value) => setPreference("weatherAlerts", value)} />
          <SettingToggle checked={preferences.newsAlerts} label={t("settings.news")} onChange={(value) => setPreference("newsAlerts", value)} />
          <SettingToggle checked={preferences.providerAlerts} label={t("settings.providers")} onChange={(value) => setPreference("providerAlerts", value)} />
          <SettingToggle checked={preferences.quietHoursEnabled} label={t("settings.quietHours", { end: preferences.quietHoursEnd, start: preferences.quietHoursStart })} onChange={(value) => setPreference("quietHoursEnabled", value)} />
          <label className="alert-lead-time"><span>{t("settings.leadTime")}</span><select onChange={(event) => setPreference("launchLeadHours", Number(event.currentTarget.value))} value={preferences.launchLeadHours}><option value={6}>{t("settings.hours", { count: 6 })}</option><option value={24}>{t("settings.hours", { count: 24 })}</option><option value={72}>{t("settings.hours", { count: 72 })}</option><option value={168}>{t("settings.hours", { count: 168 })}</option></select></label>
          <div className="native-notification-card" data-enabled={preferences.nativeNotifications}>
            <DesktopPulse24Regular aria-hidden />
            <div><strong>{t("settings.windowsTitle")}</strong><p>{t("settings.windowsBody")}</p></div>
            <button disabled={permissionState === "working" || preferences.nativeNotifications} onClick={() => void enableNative()} type="button">{t(preferences.nativeNotifications ? "settings.enabled" : permissionState === "denied" ? "settings.denied" : "settings.enable")}</button>
          </div>
        </aside>
      </div>
    </section>
  );
}

function SettingToggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (value: boolean) => void }) {
  return <label className="alert-toggle"><span>{label}</span><input checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} type="checkbox" /><i /></label>;
}

function NotificationIcon({ kind }: { kind: AwarenessNotificationKind }) {
  if (kind === "launch") return <Rocket24Regular aria-hidden />;
  if (kind === "weather") return <WeatherRain24Regular aria-hidden />;
  if (kind === "news") return <News24Regular aria-hidden />;
  return <Alert24Regular aria-hidden />;
}

function formatRelative(iso: string, locale: string): string {
  return formatDateTime(iso, locale, "local-only", { year: undefined }).primary;
}
