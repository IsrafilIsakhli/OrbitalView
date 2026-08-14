import { beforeEach, describe, expect, it } from "vitest";

import { defaultAlertPreferences } from "../domain/awareness";
import {
  selectUnreadCount,
  useAwarenessStore,
} from "./awarenessStore";

describe("awareness store", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useAwarenessStore.setState({
      alertPreferences: defaultAlertPreferences,
      deliveredKeys: [],
      favorites: [],
      notifications: [],
      nativeDeliveryTimes: [],
    });
  });

  it("toggles a favorite without creating duplicates", () => {
    const favorite = {
      id: "norad:25544",
      imageUrl: null,
      kind: "satellite" as const,
      occurredAt: "1998-11-20",
      subtitle: "ISS",
      title: "ISS (ZARYA)",
    };
    useAwarenessStore.getState().toggleFavorite(favorite);
    expect(useAwarenessStore.getState().favorites).toHaveLength(1);
    useAwarenessStore.getState().toggleFavorite(favorite);
    expect(useAwarenessStore.getState().favorites).toHaveLength(0);
  });

  it("deduplicates operational alerts and tracks unread state", () => {
    const alert = {
      body: "Window opens soon",
      dedupeKey: "launch:test:72",
      kind: "launch" as const,
      targetId: "test",
      targetType: "launch" as const,
      title: "Test launch",
    };
    expect(useAwarenessStore.getState().pushNotification(alert)).not.toBeNull();
    expect(useAwarenessStore.getState().pushNotification(alert)).toBeNull();
    expect(selectUnreadCount(useAwarenessStore.getState())).toBe(1);
    useAwarenessStore.getState().markAllRead();
    expect(selectUnreadCount(useAwarenessStore.getState())).toBe(0);
  });

  it("caps native deliveries to three in a rolling hour", () => {
    const claim = useAwarenessStore.getState().claimNativeDelivery;
    expect(claim()).toBe(true);
    expect(claim()).toBe(true);
    expect(claim()).toBe(true);
    expect(claim()).toBe(false);
  });
});
