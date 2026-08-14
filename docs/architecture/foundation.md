# Product Foundation Architecture

Status: active production architecture  
Last updated: 2026-08-09

## Purpose

This foundation establishes a long-lived Windows product shell without coupling the interface to a specific orbital renderer or data provider. Later modules can replace loading-stage visuals and add live capabilities while retaining the same navigation, preferences, localization, security, and testing contracts.

## Runtime boundaries

The application has two primary runtime zones:

1. The React interface owns composition, interaction, presentation state, accessibility, and user preferences.
2. The Rust host owns operating-system integration, privileged capabilities, durable local infrastructure, and commands that cross the native boundary.

Native access is deny-by-default. The main window capability currently grants only close, minimize, drag, and maximize operations. New permissions must be introduced with the module that needs them and must not be added speculatively.

## Front-end structure

- `src/app` — composition root, providers, shell, and global error boundary
- `src/features` — user-facing vertical capabilities, beginning with settings
- `src/shared/i18n` — locale registry, typed resources, and runtime synchronization
- `src/shared/platform` — narrow Windows/Tauri adapters
- `src/shared/ui` — reusable product primitives and brand assets
- `src/locales` — feature-namespaced locale resources for all supported languages
- `src/test` — shared test environment only

Features may depend on shared modules. Shared modules must never import from features or the app composition root. Provider-specific orbital data contracts will be introduced behind domain interfaces in the relevant data module.

## State ownership

- Persisted device preferences use Zustand with Zod validation and versioned storage.
- Remote and asynchronous data will use TanStack Query with feature-owned query keys.
- Ephemeral component interaction remains local to the component unless multiple product surfaces genuinely share it.
- Large render-loop state must remain outside React reconciliation and will be owned by the Module 2 graphics engine.

## Localization contract

No product-facing JSX text may be hardcoded. ESLint enforces this rule. Every locale uses the same namespace and key topology, and an automated parity test prevents partial translations. Changing the persisted locale synchronizes i18next and the document language immediately without restarting the application.

Supported locales are Azerbaijani (`az`), Turkish (`tr`), English (`en`), Russian (`ru`), and Spanish (`es`).

## Workspace coordination

Orbital Vision remains a desktop state-coordinated application rather than introducing a browser router. `WorkspaceCoordinator` owns the current typed destination, origin, bounded history and visited-workspace set. Detail, relation, search, favorite and notification entry points therefore share one back contract. The Earth workspace is mounted once after first use and switches between active and paused states instead of creating duplicate Cesium viewers or orbit workers.

## Shared product contracts

Cross-feature code uses centralized query keys, unit/date formatters, freshness/error models, safe external URLs and async presentation primitives. Provider-specific schemas remain inside their feature and native domain modules. Shared modules do not own or duplicate provider records.

## Performance posture

The shell uses a static composition layer, motion-reduction support, constrained acrylic effects, and vendor chunk separation. The production renderer will use a dedicated frame loop, batched GPU primitives, adaptive quality, and worker-owned orbit propagation; none of those concerns are simulated in this module.

## Failure posture

- A localized global error boundary prevents a blank application surface.
- Invalid persisted settings fall back to validated defaults.
- The native command boundary returns typed serializable values.
- Future network modules must preserve last-known-good local data and expose freshness explicitly.

## Module 2 outcome

The Earth and Orbit Engine now lives behind a feature boundary, includes deterministic disposal and WebGL context-loss handling, and respects graphics and reduced-motion preferences. Its implementation and validation details are documented in [earth-engine.md](earth-engine.md) and the Module 2 performance baseline.
