# Brainstorm: scaffold-tech-setup

Post-hoc capture of the design exploration that produced `init-spec-prompt.md`. The user had already settled most tech choices before this change was opened; this document records the *why* behind those choices and flags the decisions still open.

## Problem / Opportunity

Build a WBS (Work Breakdown Structure) tool that is **local-first** (all state in the browser by default) with **optional server sync**. The core UX is a hybrid table + nested list: same columns per row (table discipline), but rows nest so sub-items aggregate into parents (outline discipline). On top of that: three-point estimates, dependencies between items, assignee config, and a d3 gantt chart driven by estimates + dependencies + assignees.

Before any of that, the repo has no code. This change is **only the tech foundation** — no WBS domain behavior.

## Context & Constraints

- Single-developer project; no existing infra, no team conventions to preserve.
- Must run cheaply on a single Hetzner box for the server-backed mode.
- Local-first means the browser is the source of truth by default; the server is opt-in sync.
- DB must be pluggable — start on SQLite, keep the option to move to Postgres without rewriting services/controllers.
- Shared validation between BE and FE is required (e.g., the same schema validates a POST body and a form input).
- Deploys should be dead-simple — developer workstation → Hetzner via `ssh`/`scp`. No CI platform yet.

## Approaches Considered

### Monorepo tooling: Nx vs Turborepo vs pnpm workspaces

- **Nx (chosen)**: strongest code-gen, project-graph, and target orchestration. Works with Bun. Heavier than pnpm workspaces but pays off once there's a shared lib and two apps.
- Turborepo: lighter, but less code-gen support and weaker plugin story for Drizzle/Vite integration.
- pnpm workspaces: simplest, but no task graph caching or generators.

### Backend runtime: Bun vs Node

- **Bun (chosen)**: faster cold start, built-in TS, built-in test runner, native SQLite. Good fit for Elysia.
- Node: safer default, more mature ecosystem, but the user explicitly wants Bun.

### HTTP framework: Elysia vs Hono vs Fastify

- **Elysia (chosen)**: first-class Bun support, strong typed-DI story, ArkType integration is clean.
- Hono: portable across runtimes, but DI and validator plugin story is thinner for ArkType.
- Fastify: mature, but Node-oriented and heavier on boilerplate.

### Validation: ArkType vs Zod vs Valibot

- **ArkType (chosen)**: fastest, shared cleanly between BE and FE, schema-as-TS-type ergonomics.
- Zod: most popular, but slower and larger.
- Valibot: small, but ecosystem integrations (Elysia, shadcn form) less mature.

### ORM / DB layer: Drizzle + DB-agnostic repositories

- **Drizzle (chosen)**: thin, TS-first, SQL-first. Driver-swappable (SQLite → Postgres) with minimal surface.
- Prisma: richer tooling, but the generator step and runtime weight don't fit the single-box goal.
- **Repository layer**: wrap Drizzle behind repository interfaces so services never see Drizzle types. This is the concrete mechanism for "DB-agnostic."

### Frontend router: TanStack Router vs React Router vs Next.js

- **TanStack Router (chosen)**: type-safe routes, file-based, first-class TanStack DB/Query integration. Matches a Vite SPA model.
- React Router: familiar but weaker types.
- Next.js: overkill for a local-first SPA; SSR isn't wanted.

### Local-first data layer: TanStack DB

- **TanStack DB (chosen)**: reactive client store with collections; pluggable sync engines for the eventual server mode. Lets "local" and "server" modes share the same query surface.
- Plain IndexedDB + custom sync: more work, no payoff.

### Deployment: k3s vs Docker Compose vs bare binaries + systemd

- **k3s + Caddy (tentative)**: gives a real k8s API on a single node, ingress/TLS via Caddy. Future-proof if a second node is ever added.
- Docker Compose: simplest, lowest ceremony, probably sufficient for a single-dev, single-box deploy. **Strong candidate to reconsider in design.**
- Bare binaries + systemd: lightest, but loses containerization benefits.

### Reverse proxy: Caddy vs Traefik

- **Caddy (leaning)**: zero-config TLS, simpler Caddyfile, excellent Hetzner story.
- Traefik: better k8s ingress integration, CRDs, dynamic config from labels. Wins if we commit to k3s.
- Open — design artifact resolves.

## Decisions (Locked)

1. **Nx monorepo** with three projects: `be-01`, `fe-01`, `shared-lib-01`.
2. **Backend**: Bun + TypeScript + ElysiaJS + Drizzle (SQLite dev driver) + ArkType.
3. **Backend layering**: `controller → service → repository`. Repositories define the DB-agnostic contract; Drizzle lives only inside repository implementations.
4. **Frontend**: React + TypeScript + Vite + TanStack Router + shadcn/ui + TanStack Table + d3 + TanStack DB (dual mode: local and server).
5. **Shared lib**: ArkType schemas + domain types + utils, imported by both BE and FE via Nx path aliases.
6. **Deploy transport**: `ssh`/`scp` from developer workstation (no CI platform in this change).
7. **No WBS domain features in this change** — scaffolding only.

## Open Questions (to resolve in design.md)

1. **k3s vs Docker Compose** for a single Hetzner box. k3s is more future-proof; compose is materially simpler. The "minimal infra" phrasing in `init-spec-prompt.md` argues for compose unless there's a concrete multi-node plan.
2. **Caddy vs Traefik** — depends on (1). Caddy if compose, Traefik if k3s.
3. **Nx project layout**: top-level `be-01/` `fe-01/` `shared-lib-01/` directories vs Nx conventional `apps/` + `libs/`. User's naming (`be-01` etc.) implies top-level; worth confirming.
4. **TanStack DB sync protocol** for server mode: HTTP polling vs WebSocket vs something else. Affects Elysia endpoint shape. Probably deferrable to the first feature change that actually enables server mode, but the foundation must not paint us into a corner.
5. **Bun + Drizzle + SQLite driver choice** (`bun:sqlite` vs `better-sqlite3` via node-compat). `bun:sqlite` is native and fast but tighter Bun coupling; does that conflict with "DB-agnostic"? (Probably not — the coupling is at the driver boundary, which is what the repository layer exists to hide.)
6. **Shadcn installation style** under Nx: does the shadcn CLI play well with Nx's generated tsconfig/path aliases, or do we vendor components manually?

## Next Artifact

`proposal.md` — extract Why / What Changes / Capabilities / Impact from the locked decisions above. Leave the open questions for `design.md`.
