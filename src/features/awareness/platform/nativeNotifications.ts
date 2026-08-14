import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

export async function enableNativeNotifications(): Promise<boolean> {
  try {
    if (await isPermissionGranted()) return true;
    return await requestPermission() === "granted";
  } catch {
    return false;
  }
}

export async function deliverNativeNotification(
  title: string,
  body: string,
): Promise<boolean> {
  try {
    if (!await isPermissionGranted()) return false;
    sendNotification({ body, title });
    return true;
  } catch {
    return false;
  }
}
