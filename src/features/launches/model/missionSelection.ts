import { create } from "zustand";

interface MissionSelectionState {
  requestedEventId: string | null;
  requestedLaunchId: string | null;
  clearRequestedEvent: () => void;
  clearRequestedLaunch: () => void;
  requestEvent: (id: string) => void;
  requestLaunch: (id: string) => void;
}

export const useMissionSelectionStore = create<MissionSelectionState>((set) => ({
  clearRequestedEvent: () => set({ requestedEventId: null }),
  clearRequestedLaunch: () => set({ requestedLaunchId: null }),
  requestEvent: (requestedEventId) => set({ requestedEventId }),
  requestLaunch: (requestedLaunchId) => set({ requestedLaunchId }),
  requestedEventId: null,
  requestedLaunchId: null,
}));
