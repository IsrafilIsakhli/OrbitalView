import { create } from "zustand";

export type AppUpdateStatus =
  | "idle"
  | "checking"
  | "upToDate"
  | "available"
  | "downloading"
  | "installing"
  | "ready"
  | "error"
  | "disabled";

export interface AppUpdateRelease {
  currentVersion: string;
  date: string | null;
  minimumSupportedVersion: string;
  notes: string;
  required: boolean;
  severity: "optional" | "critical";
  version: string;
}

interface AppUpdateState {
  downloadedBytes: number;
  errorCode: "checkFailed" | "installFailed" | null;
  lastCheckedAtUnixMs: number | null;
  promptOpen: boolean;
  release: AppUpdateRelease | null;
  status: AppUpdateStatus;
  totalBytes: number | null;
}

export const initialAppUpdateState: AppUpdateState = {
  downloadedBytes: 0,
  errorCode: null,
  lastCheckedAtUnixMs: null,
  promptOpen: false,
  release: null,
  status: "idle",
  totalBytes: null,
};

export const useAppUpdateStore = create<AppUpdateState>(() => initialAppUpdateState);
