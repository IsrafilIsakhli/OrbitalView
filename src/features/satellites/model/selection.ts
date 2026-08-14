import { create } from "zustand";

interface SatelliteSelectionState {
  requestedSatelliteId: string | null;
  clearRequestedSatellite: () => void;
  requestSatellite: (id: string) => void;
}

export const useSatelliteSelectionStore = create<SatelliteSelectionState>(
  (set) => ({
    clearRequestedSatellite: () => set({ requestedSatelliteId: null }),
    requestSatellite: (requestedSatelliteId) => set({ requestedSatelliteId }),
    requestedSatelliteId: null,
  }),
);

