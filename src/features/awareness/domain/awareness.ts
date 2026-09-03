export type FavoriteKind = "satellite" | "launch" | "event";

export interface FavoriteItem {
  addedAt: string;
  id: string;
  imageUrl: string | null;
  kind: FavoriteKind;
  occurredAt: string | null;
  subtitle: string | null;
  title: string;
}

export type FavoriteInput = Omit<FavoriteItem, "addedAt">;

export type AwarenessNotificationKind =
  | "launch"
  | "mission"
  | "satellite"
  | "weather"
  | "news"
  | "system";

export type NotificationTargetType = FavoriteKind | "news";

export interface AwarenessNotification {
  body: string;
  createdAt: string;
  dedupeKey: string;
  id: string;
  kind: AwarenessNotificationKind;
  read: boolean;
  targetId: string | null;
  targetType: NotificationTargetType | null;
  title: string;
}

export interface AlertPreferences {
  launchAlerts: boolean;
  launchLeadHours: number;
  missionAlerts: boolean;
  nativeNotifications: boolean;
  newsAlerts: boolean;
  providerAlerts: boolean;
  quietHoursEnabled: boolean;
  quietHoursEnd: number;
  quietHoursStart: number;
  satelliteAlerts: boolean;
  weatherAlerts: boolean;
}

export const defaultAlertPreferences: AlertPreferences = {
  launchAlerts: true,
  launchLeadHours: 72,
  missionAlerts: true,
  nativeNotifications: false,
  newsAlerts: true,
  providerAlerts: false,
  quietHoursEnabled: false,
  quietHoursEnd: 7,
  quietHoursStart: 22,
  satelliteAlerts: false,
  weatherAlerts: true,
};
