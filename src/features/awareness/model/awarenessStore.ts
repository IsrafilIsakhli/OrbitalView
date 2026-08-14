import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  type AlertPreferences,
  type AwarenessNotification,
  defaultAlertPreferences,
  type FavoriteInput,
  type FavoriteItem,
} from "../domain/awareness";

const MAX_FAVORITES = 250;
const MAX_NOTIFICATIONS = 120;
const MAX_DELIVERED_KEYS = 500;

interface AwarenessState {
  alertPreferences: AlertPreferences;
  deliveredKeys: string[];
  favorites: FavoriteItem[];
  notifications: AwarenessNotification[];
  nativeDeliveryTimes: string[];
  claimNativeDelivery: () => boolean;
  clearNotifications: () => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
  pushNotification: (
    notification: Omit<AwarenessNotification, "createdAt" | "id" | "read">,
  ) => AwarenessNotification | null;
  removeFavorite: (kind: FavoriteItem["kind"], id: string) => void;
  setAlertPreference: <Key extends keyof AlertPreferences>(
    key: Key,
    value: AlertPreferences[Key],
  ) => void;
  toggleFavorite: (favorite: FavoriteInput) => void;
}

export const useAwarenessStore = create<AwarenessState>()(
  persist(
    (set, get) => ({
      alertPreferences: defaultAlertPreferences,
      clearNotifications: () => set({ notifications: [] }),
      claimNativeDelivery: () => {
        const cutoff = Date.now() - 60 * 60_000;
        const recent = get().nativeDeliveryTimes.filter((value) => Date.parse(value) >= cutoff);
        if (recent.length >= 3) {
          set({ nativeDeliveryTimes: recent });
          return false;
        }
        set({ nativeDeliveryTimes: [...recent, new Date().toISOString()] });
        return true;
      },
      deliveredKeys: [],
      favorites: [],
      markAllRead: () => set((state) => ({
        notifications: state.notifications.map((notification) => ({
          ...notification,
          read: true,
        })),
      })),
      markRead: (id) => set((state) => ({
        notifications: state.notifications.map((notification) =>
          notification.id === id ? { ...notification, read: true } : notification,
        ),
      })),
      notifications: [],
      nativeDeliveryTimes: [],
      pushNotification: (input) => {
        if (get().deliveredKeys.includes(input.dedupeKey)) return null;
        const now = new Date().toISOString();
        const notification: AwarenessNotification = {
          ...input,
          createdAt: now,
          id: `${input.dedupeKey}:${Date.now()}`,
          read: false,
        };
        set((state) => ({
          deliveredKeys: [input.dedupeKey, ...state.deliveredKeys]
            .slice(0, MAX_DELIVERED_KEYS),
          notifications: [notification, ...state.notifications]
            .slice(0, MAX_NOTIFICATIONS),
        }));
        return notification;
      },
      removeFavorite: (kind, id) => set((state) => ({
        favorites: state.favorites.filter(
          (favorite) => favorite.kind !== kind || favorite.id !== id,
        ),
      })),
      setAlertPreference: (key, value) => set((state) => ({
        alertPreferences: { ...state.alertPreferences, [key]: value },
      })),
      toggleFavorite: (input) => set((state) => {
        const exists = state.favorites.some(
          (favorite) => favorite.kind === input.kind && favorite.id === input.id,
        );
        if (exists) {
          return {
            favorites: state.favorites.filter(
              (favorite) => favorite.kind !== input.kind || favorite.id !== input.id,
            ),
          };
        }
        return {
          favorites: [
            { ...input, addedAt: new Date().toISOString() },
            ...state.favorites,
          ].slice(0, MAX_FAVORITES),
        };
      }),
    }),
    {
      merge: (persisted, current) => {
        const candidate = persisted as Partial<AwarenessState> | undefined;
        return {
          ...current,
          alertPreferences: {
            ...defaultAlertPreferences,
            ...(candidate?.alertPreferences ?? {}),
          },
          deliveredKeys: Array.isArray(candidate?.deliveredKeys)
            ? candidate.deliveredKeys.filter((key): key is string => typeof key === "string")
                .slice(0, MAX_DELIVERED_KEYS)
            : [],
          favorites: Array.isArray(candidate?.favorites)
            ? candidate.favorites.slice(0, MAX_FAVORITES)
            : [],
          notifications: Array.isArray(candidate?.notifications)
            ? candidate.notifications.slice(0, MAX_NOTIFICATIONS)
            : [],
          nativeDeliveryTimes: Array.isArray(candidate?.nativeDeliveryTimes)
            ? candidate.nativeDeliveryTimes.filter((value): value is string => typeof value === "string").slice(-3)
            : [],
        };
      },
      name: "orbital-vision.awareness",
      partialize: ({
        alertPreferences,
        deliveredKeys,
        favorites,
        notifications,
        nativeDeliveryTimes,
      }) => ({ alertPreferences, deliveredKeys, favorites, nativeDeliveryTimes, notifications }),
      storage: createJSONStorage(() => window.localStorage),
      version: 2,
    },
  ),
);

export function selectUnreadCount(state: AwarenessState): number {
  return state.notifications.reduce(
    (count, notification) => count + (notification.read ? 0 : 1),
    0,
  );
}
