import { create } from "zustand";

import type { AnalysisTab } from "@/app/shell/model/workspaceSelection";

interface AnalysisSelectionState {
  requestedSatelliteId: string | null;
  requestedTab: AnalysisTab | null;
  clearRequest: () => void;
  requestAnalysis: (satelliteId?: string, tab?: AnalysisTab) => void;
}

export const useAnalysisSelectionStore = create<AnalysisSelectionState>((set) => ({
  clearRequest: () => set({ requestedSatelliteId: null, requestedTab: null }),
  requestAnalysis: (requestedSatelliteId, requestedTab) => set({
    requestedSatelliteId: requestedSatelliteId ?? null,
    requestedTab: requestedTab ?? null,
  }),
  requestedSatelliteId: null,
  requestedTab: null,
}));
