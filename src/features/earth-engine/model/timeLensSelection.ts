import { create } from "zustand";

export type EarthTimeLensOrigin = "analysis" | "ground-station" | "conjunction";

export interface EarthTimeLensRequest {
  id: number;
  origin: EarthTimeLensOrigin;
  timestampUnixMs: number;
}

interface EarthTimeLensSelectionState {
  clearRequest: (id: number) => void;
  request: EarthTimeLensRequest | null;
  requestSerial: number;
  requestTimeLens: (timestampUnixMs: number, origin: EarthTimeLensOrigin) => void;
}

export const useEarthTimeLensSelectionStore = create<EarthTimeLensSelectionState>((set) => ({
  clearRequest: (id) => set((state) => state.request?.id === id ? { request: null } : state),
  request: null,
  requestSerial: 0,
  requestTimeLens: (timestampUnixMs, origin) => {
    if (!Number.isFinite(timestampUnixMs) || timestampUnixMs <= 0) return;
    set((state) => ({
      request: {
        id: state.requestSerial + 1,
        origin,
        timestampUnixMs,
      },
      requestSerial: state.requestSerial + 1,
    }));
  },
}));
