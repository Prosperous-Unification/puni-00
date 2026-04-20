## ADDED Requirements

### Requirement: Three-directory Nx workspace layout

The repository root MUST be an Nx 18+ workspace with exactly three top-level directories for Nx projects: `apps/`, `libs/`, and `tools/`. No project code SHALL live outside these three directories (aside from workspace-level config files, `.sops.yaml` at repo root, and Nx's own `.nx/` cache).

#### Scenario: Workspace root contains only the sanctioned directories

- **WHEN** a developer lists the top-level entries of the repository
- **THEN** the entries include `apps/`, `libs/`, `tools/`, and standard workspace files (`package.json`, `nx.json`, `tsconfig.base.json`, `.sops.yaml`, `.gitignore`, `eslint.config.js`, `.prettierrc.json`, `.editorconfig`, `lefthook.yml`, `.vscode/`, `openspec/`)
- **AND** no `scripts/`, `infra/`, `dagger/`, or `secrets/` directory exists at the workspace root

#### Scenario: `nx graph` resolves all projects

- **WHEN** `nx graph --file=graph.json` runs at the workspace root
- **THEN** the output lists exactly three apps (`be-01`, `gw-01`, `fe-01`), seven libs (`validation`, `domain`, `contracts`, `observability`, `config`, `realtime`, `scripts`), and nine tool projects (`tool-deploy`, `tool-dagger`, `tool-compose`, `tool-observability-stack`, `tool-secrets`, `tool-bootstrap`, `tool-remote-scripts`, `tool-git-hooks`, `tool-smoke`)

### Requirement: Project naming conventions

Project names SHALL follow these fixed conventions, enforced by code review and project generators:

- Apps: `apps/<role>-NN` where `<role>` ∈ {`be`, `gw`, `fe`} and `NN` is a two-digit sequence (`01`, `02`, …).
- Libs: `libs/<name>` with package `name: "@wbs/<name>"` in `package.json` — no numeric suffix, semantic names only.
- Tools: `tools/tool-<name>` with `name: "@wbs/tool-<name>"`.

#### Scenario: Library uses a semantic name, not a numeric suffix

- **WHEN** a new library is generated
- **THEN** its directory is `libs/<semantic-name>/` (e.g., `libs/validation/`, not `libs/lib-02/`)
- **AND** its `package.json` `name` is `@wbs/<semantic-name>`

#### Scenario: App and tool names follow their conventions

- **WHEN** the workspace is inspected
- **THEN** every app under `apps/` matches `<be|gw|fe>-\d{2}`
- **AND** every tool under `tools/` is prefixed `tool-`

### Requirement: Nx tag-based module boundary enforcement

Every Nx project MUST declare tags from three dimensions — `scope:*`, `type:*`, `runtime:*` — in its `project.json`. The workspace's ESLint config MUST include `@nx/enforce-module-boundaries` rules that forbid cross-dimension violations (e.g., `scope:app` cannot import `scope:infra`; `runtime:browser` cannot import `runtime:bun`).

#### Scenario: Enforced tag violation fails lint

- **WHEN** code in `apps/be-01` imports a symbol from `tools/tool-deploy/src`
- **THEN** `nx lint be-01` fails with an `@nx/enforce-module-boundaries` violation
- **AND** the violation message names the scope-dimension conflict

#### Scenario: Every project declares the required tag set

- **WHEN** each `project.json` is inspected
- **THEN** it contains exactly one `scope:*` tag, exactly one `type:*` tag, and exactly one `runtime:*` tag

### Requirement: Bun as package manager and runtime

The workspace MUST use Bun as the package manager (lockfile `bun.lockb`) and as the runtime for `apps/be-01`, `apps/gw-01`, and all `tools/tool-*` Bun scripts. `fe-01` MAY use Bun for its dev server or Vite's default (both acceptable).

#### Scenario: Root install uses Bun

- **WHEN** `bun install` runs at the workspace root
- **THEN** it produces or updates `bun.lockb` (not `package-lock.json` or `pnpm-lock.yaml`)
- **AND** no `node_modules/.package-lock.json` appears

#### Scenario: Backend services boot under Bun

- **WHEN** `nx serve be-01` or `nx serve gw-01` runs
- **THEN** the process under `ps` is `bun`, not `node`

### Requirement: TypeScript project references and `@wbs/*` path aliases

A `tsconfig.base.json` at the workspace root MUST declare `paths` mapping every `@wbs/<name>` to `libs/<name>/src/index.ts` (and sub-path exports where defined). Every project's `tsconfig.json` MUST extend the base and declare `references` to its declared Nx dependencies.

#### Scenario: Importing `@wbs/validation` from an app resolves

- **WHEN** `apps/be-01/src/main.ts` writes `import { defineSchema } from '@wbs/validation'`
- **THEN** `nx typecheck be-01` succeeds
- **AND** `tsc` resolves the import to `libs/validation/src/index.ts`

#### Scenario: Circular reference in project references fails build

- **WHEN** a circular TypeScript project reference is introduced (lib A → lib B → lib A)
- **THEN** `nx build` fails with a TypeScript circular-reference error

### Requirement: Nx-native invocation for all infra operations

Every workstation or remote operation for infra — deploy, bootstrap, smoke tests, secrets handling, git-hooks installation — MUST be invoked as `nx run tool-<x>:<target>`. Free-standing scripts (e.g., `bun scripts/*.ts`, `bash scripts/*.sh`) SHALL NOT exist in the workspace. A top-level `package.json` alias MAY forward common operations (e.g., `"deploy": "nx run tool-deploy:deploy"`).

#### Scenario: Deploy is invoked via Nx

- **WHEN** a developer wants to deploy all tiers
- **THEN** the command is `nx run tool-deploy:deploy -- --all` (or the alias `bun deploy --all`)
- **AND** `scripts/deploy.ts` does not exist at the workspace root

#### Scenario: Every `tool-*` project declares its primary target

- **WHEN** each `tools/tool-*/project.json` is inspected
- **THEN** it declares the target named in design D1's table for that tool (e.g., `tool-deploy` has `deploy`, `deploy-be`, `deploy-gw`, `deploy-fe`)
