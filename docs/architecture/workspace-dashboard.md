# Workspace Coordinator and Command Dashboard

Status: implemented  
Last updated: 2026-08-09

## Workspace model

`WorkspaceCoordinator` owns typed destinations, navigation origins, a 24-entry back stack and the set of workspaces visited in the current process. Search, dashboard, relation, favorite, notification and Control Center handoffs use the same coordinator. Alt+Left returns through this stack; Escape remains layered inside the active feature before workspace back.

Earth is special: after first activation, one Cesium viewer and one propagation worker remain mounted. Hidden state pauses the renderer clock, performance sampling, layer ticks and worker interval. Selection, layers and camera context remain intact for a warm return.

## Dashboard composition

The default destination is a six-module Space Intelligence view:

1. next launch and real countdown;
2. mission, pad and launch-time-valid weather context;
3. real CelesTrak catalog count and freshness;
4. NOAA official scale/Kp/alert state;
5. recent SFN intelligence and verified LL2 relations;
6. provider operations health.

Every module renders provider ownership and freshness. Missing fields remain unavailable; the dashboard never substitutes zero, guesses a company, creates telemetry or invents a relation.

## Search and navigation

Ctrl+K uses a memoized normalized satellite index and bounded result groups for destinations, NORAD objects, launches, missions, rockets, launch sites, events, local News FTS and cached NASA content. The listbox supports ArrowUp, ArrowDown, Enter and Escape and scrolls the active option into view.
