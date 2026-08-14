import { create } from "zustand";

export type WorkspaceDestination =
  | "explore"
  | "satellites"
  | "orbitalAnalysis"
  | "launches"
  | "missions"
  | "spaceNews"
  | "favorites"
  | "notifications"
  | "nasa"
  | "spaceWeather";

export type WorkspaceOrigin =
  | "navigation"
  | "dashboard"
  | "search"
  | "favorite"
  | "notification"
  | "relation"
  | "system";

export interface WorkspaceLocation {
  destination: WorkspaceDestination;
  origin: WorkspaceOrigin;
}

interface WorkspaceCoordinatorState {
  canGoBack: boolean;
  current: WorkspaceLocation;
  history: WorkspaceLocation[];
  visited: WorkspaceDestination[];
  back: () => void;
  navigate: (destination: WorkspaceDestination, origin?: WorkspaceOrigin) => void;
  reset: () => void;
}

const initialLocation: WorkspaceLocation = { destination: "explore", origin: "system" };
const MAX_HISTORY = 24;

export function pushWorkspace(
  current: WorkspaceLocation,
  history: WorkspaceLocation[],
  destination: WorkspaceDestination,
  origin: WorkspaceOrigin,
): Pick<WorkspaceCoordinatorState, "canGoBack" | "current" | "history"> {
  if (current.destination === destination) return { canGoBack: history.length > 0, current, history };
  const nextHistory = [...history, current].slice(-MAX_HISTORY);
  return {
    canGoBack: true,
    current: { destination, origin },
    history: nextHistory,
  };
}

export const useWorkspaceCoordinator = create<WorkspaceCoordinatorState>((set) => ({
  back: () => set((state) => {
    const previous = state.history[state.history.length - 1];
    if (!previous) return state;
    const history = state.history.slice(0, -1);
    return { canGoBack: history.length > 0, current: previous, history };
  }),
  canGoBack: false,
  current: initialLocation,
  history: [],
  visited: ["explore"],
  navigate: (destination, origin = "navigation") => set((state) => ({
    ...pushWorkspace(state.current, state.history, destination, origin),
    visited: state.visited.includes(destination) ? state.visited : [...state.visited, destination],
  })),
  reset: () => set({ canGoBack: false, current: initialLocation, history: [], visited: ["explore"] }),
}));
