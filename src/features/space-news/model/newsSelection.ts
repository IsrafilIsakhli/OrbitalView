import { create } from "zustand";

interface NewsSelectionState {
  activeSource: string;
  activeType: "all" | "article" | "blog" | "report" | "featured";
  limit: number;
  requestedNewsId: string | null;
  scrollTop: number;
  search: string;
  clearRequestedNews: () => void;
  requestNews: (id: string) => void;
  setViewState: (state: Partial<Pick<NewsSelectionState, "activeSource" | "activeType" | "limit" | "scrollTop" | "search">>) => void;
}

export const useNewsSelectionStore = create<NewsSelectionState>((set) => ({
  activeSource: "",
  activeType: "all",
  clearRequestedNews: () => set({ requestedNewsId: null }),
  limit: 30,
  requestNews: (requestedNewsId) => set({ requestedNewsId }),
  requestedNewsId: null,
  scrollTop: 0,
  search: "",
  setViewState: (state) => set(state),
}));
