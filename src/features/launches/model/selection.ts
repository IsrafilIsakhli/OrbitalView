import { create } from "zustand";

interface LaunchSelectionState {
  requestedLaunchId: string | null;
  clearRequestedLaunch: () => void;
  requestLaunch: (id: string) => void;
}

export const useLaunchSelectionStore = create<LaunchSelectionState>((set) => ({
  clearRequestedLaunch: () => set({ requestedLaunchId: null }),
  requestLaunch: (requestedLaunchId) => set({ requestedLaunchId }),
  requestedLaunchId: null,
}));
