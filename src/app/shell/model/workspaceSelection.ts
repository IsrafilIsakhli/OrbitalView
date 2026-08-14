import type { WorkspaceDestination as CoordinatedDestination } from "./workspaceCoordinator";

export type WorkspaceDestination = CoordinatedDestination | "settings";

export type AnalysisTab =
  | "dynamics"
  | "groundStation"
  | "constellation"
  | "proximity";

export type WorkspaceSelectionIntent =
  | { type: "destination"; destination: WorkspaceDestination }
  | { type: "satellite"; satelliteId: string }
  | { type: "orbitalAnalysis"; satelliteId?: string; tab?: AnalysisTab }
  | { type: "launch"; launchId: string }
  | { type: "event"; eventId: string }
  | { type: "news"; newsId: string }
  | { type: "mission"; launchId: string }
  | { type: "rocket"; launchId: string }
  | { type: "launchSite"; launchId: string }
  | { type: "nasa"; itemId: string };
