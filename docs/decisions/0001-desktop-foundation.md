# ADR 0001: Windows Desktop Foundation

Date: 2026-08-06  
Status: accepted for Module 1 review

## Context

Orbital Vision requires a premium Windows experience, continuous GPU rendering, strong native integration, a small trusted host, instant localization, and a codebase that can grow into several independent product domains. The first module must create these boundaries without prematurely committing the product to a satellite provider or rendering implementation.

## Decision

Use Tauri 2 with a Rust host and a React/TypeScript interface. Apply feature-oriented front-end boundaries, strict compilation and linting, a minimal Tauri capability manifest, typed native commands, validated persisted preferences, and namespace-based localization from the first commit.

Use Fluent-inspired native-window behavior and product-owned visual tokens instead of coupling the interface to a large component framework. Use TanStack Query for future asynchronous data state and Zustand only for small validated device preferences. Keep the future frame loop and high-volume object state outside React.

## Consequences

Positive outcomes:

- The installed application is substantially smaller and less privileged than an Electron-style host.
- Rust provides an appropriate boundary for future propagation, caching, update verification, and Windows integration.
- React retains a mature product-interface ecosystem without owning high-frequency renderer state.
- Localization, accessibility, motion policy, and quality settings are architectural contracts rather than later retrofits.

Trade-offs:

- The team must maintain clear contracts across TypeScript and Rust.
- WebView2 behavior and native Windows packaging require dedicated release validation.
- A production 3D engine still needs explicit resource ownership, worker strategy, and GPU profiling in Module 2.

## Rejected alternatives

- Electron: excellent ecosystem, but a heavier process and memory baseline for an always-on visualization product.
- WPF: mature Windows tooling, but less suitable for the selected modern rendering and product-interface stack.
- WinUI 3 only: strong Windows fidelity, but higher friction for the intended cross-disciplinary UI and globe ecosystem.
- Embedding live orbital computation directly in React: incompatible with predictable rendering performance and testable domain boundaries.
