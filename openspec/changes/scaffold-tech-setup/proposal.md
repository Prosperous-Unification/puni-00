## Why

The WBS tool has no code yet — only an intent document (`init-spec-prompt.md`). Before any product feature work can begin, the repository needs a scaffolded foundation: a monorepo layout, a backend app, a frontend app, a shared library for cross-cutting code, and a minimal deployment path. Settling the tech foundation first lets all subsequent feature changes target a stable, known shape instead of renegotiating tooling per feature.

## What Changes

- Introduce an Nx monorepo at the repository root with three workspaces: `be-01` (backend), `fe-01` (frontend), and `shared-lib-01` (shared TypeScript code: validation schemas, domain types, utils).
- Add the backend application `be-01`: Bun runtime, TypeScript, ElysiaJS HTTP framework, Drizzle ORM (SQLite for local dev, driver-pluggable so the app is DB-agnostic at the repository-interface level), ArkType for request/response validation. Code is organized in `controller → service → repository` layers.
- Add the frontend application `fe-01`: React, TypeScript, Vite, TanStack Router (file-based routing), shadcn/ui component system, TanStack Table, d3, and TanStack DB wired for two data modes: local-only (browser-persisted) and server-backed.
- Add `shared-lib-01`: ArkType schemas, domain types, and utility functions consumable by both `be-01` and `fe-01` through Nx path aliases.
- Add a minimal deployment pipeline: `ssh` + `scp` scripts that ship built artifacts to a Hetzner host running k3s, with Caddy (or Traefik) fronting TLS and routing to the k3s service. No CI/CD platform; deploys are developer-triggered from the workstation.
- Establish the DB-agnostic contract at the repository layer so swapping SQLite for Postgres later requires only a new Drizzle driver + repository implementation, not service or controller changes.

## Capabilities

### New Capabilities

- `monorepo-structure`: Nx workspace layout, project generation conventions, path aliases, and build/test/lint orchestration across `be-01`, `fe-01`, and `shared-lib-01`.
- `backend-foundation`: `be-01` app skeleton — Bun + ElysiaJS bootstrap, Drizzle setup with a DB-agnostic repository interface, ArkType validation pipeline, and the controller/service/repository layering contract.
- `frontend-foundation`: `fe-01` app skeleton — Vite + React + TanStack Router bootstrap, shadcn/ui installation, TanStack Table + d3 wiring, and TanStack DB configured for local/server dual-mode operation.
- `shared-library`: `shared-lib-01` skeleton — the mechanism for sharing ArkType schemas, domain types, and utilities between backend and frontend without duplication.
- `deployment-pipeline`: `ssh`/`scp`-driven deploy scripts targeting a Hetzner host running k3s behind Caddy (or Traefik), plus the k3s manifests and ingress config needed for a first deploy.

### Modified Capabilities

_None — this is the initial scaffolding; no specs exist yet._

## Impact

- **Repository layout**: root becomes an Nx workspace; all future app code lives under `apps/` / `libs/` (exact Nx convention to be confirmed in design).
- **Tooling**: introduces Bun, Nx, Vite, Drizzle, ArkType, TanStack (Router/Table/DB), shadcn/ui, d3, and a local k3s target as baseline dependencies.
- **Developer workflow**: a single `nx` command surface for build/test/lint/serve; a deploy script shipped with the repo.
- **No product features yet**: this change intentionally adds no WBS domain behavior (no table, no estimates, no gantt). Those land in subsequent changes against the foundation established here.
- **DB-agnostic contract**: locks in the repository-layer abstraction early so the SQLite choice is reversible without touching services/controllers.
