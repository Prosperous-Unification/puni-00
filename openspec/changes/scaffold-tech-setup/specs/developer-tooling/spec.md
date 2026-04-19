## ADDED Requirements

### Requirement: ESLint 9 flat config at workspace root

The workspace MUST use ESLint 9 flat configuration (`eslint.config.js` at the root). Legacy `.eslintrc*` files SHALL NOT exist. The flat config MUST compose (at minimum) `@eslint/js` recommended, `typescript-eslint` `strictTypeChecked` + `stylisticTypeChecked`, `@nx/eslint-plugin` flat rules, and `eslint-config-prettier` (last) to disable stylistic rules that fight Prettier.

#### Scenario: Linting succeeds across the workspace after scaffold

- **WHEN** `nx run-many -t lint` runs on a freshly scaffolded workspace
- **THEN** it exits 0 with no warnings
- **AND** no `.eslintrc`, `.eslintrc.json`, or `.eslintrc.js` file exists anywhere in the workspace

#### Scenario: TypeScript-aware rules are active

- **WHEN** a developer writes `async function x() { return Promise.resolve(1) }` and never awaits the returned promise
- **THEN** ESLint reports `@typescript-eslint/no-floating-promises` at error severity

### Requirement: Prettier 3 with fixed project-wide config

A single `.prettierrc.json` at the workspace root MUST declare: `"semi": true`, `"singleQuote": true`, `"trailingComma": "all"`, `"printWidth": 100`, `"tabWidth": 2`, `"useTabs": false`, `"arrowParens": "always"`, `"endOfLine": "lf"`, `"bracketSameLine": false`. The `prettier-plugin-tailwindcss` plugin MUST be enabled. Per-project `.prettierrc*` overrides SHALL NOT exist.

#### Scenario: Formatting is idempotent after scaffold

- **WHEN** `nx format:check` runs on a freshly scaffolded workspace
- **THEN** it exits 0 (all files are already formatted)

#### Scenario: Tailwind classes are sorted

- **WHEN** a React component uses `className="text-white flex p-4"`
- **THEN** `nx format:write` rewrites it to the Tailwind-prescribed order (e.g., `"flex p-4 text-white"`)

### Requirement: Module-boundary rules enforce architectural scopes

The ESLint flat config MUST enforce `@nx/enforce-module-boundaries` rules that:
(a) forbid `apps/*` from importing from `tools/*`;
(b) forbid `runtime:browser`-tagged libraries from importing `runtime:bun`-tagged libraries and vice-versa;
(c) forbid circular dependencies in the project graph.

#### Scenario: App importing a tool is rejected

- **WHEN** `apps/be-01/src/main.ts` adds `import { … } from '@wbs/tool-deploy'`
- **THEN** `nx lint be-01` fails with a `scope` violation

### Requirement: Drizzle safety lint rules on `be-01`'s repository layer

The ESLint config MUST include `eslint-plugin-drizzle` with `enforceDeleteWithWhere` and `enforceUpdateWithWhere` rules applied to `apps/be-01/src/repository/**/*.ts`.

#### Scenario: Unsafe DELETE without WHERE is rejected

- **WHEN** `apps/be-01/src/repository/user.repo.ts` adds `await db.delete(users)` without a `.where(...)`
- **THEN** `nx lint be-01` fails with `drizzle/enforceDeleteWithWhere`

### Requirement: Pre-commit hook via lefthook, not husky

Pre-commit orchestration MUST use lefthook (not husky, lint-staged, or simple-git-hooks). A single `lefthook.yml` at the workspace root MUST declare the `pre-commit` and `commit-msg` stages. `tools/tool-git-hooks/src/install.ts` MUST be the Nx-invocable installer (`nx run tool-git-hooks:install`) that runs `bunx lefthook install`.

#### Scenario: Running the installer sets up git hooks

- **WHEN** `nx run tool-git-hooks:install` runs on a fresh clone
- **THEN** the `.git/hooks/pre-commit` and `.git/hooks/commit-msg` files are installed by lefthook
- **AND** `package.json` does NOT contain `husky` or `lint-staged` as dependencies

#### Scenario: Pre-commit runs lint on affected + formats staged files

- **WHEN** a developer runs `git commit` with one staged TypeScript file
- **THEN** lefthook invokes `bunx nx affected -t lint --uncommitted --fix` AND `bunx nx format:write --uncommitted`
- **AND** the affected files are re-staged before the commit message prompt

#### Scenario: Pre-commit rejects plaintext secret files

- **WHEN** a developer stages `tools/tool-secrets/src/production.env` (without `.sops`)
- **THEN** the pre-commit hook exits non-zero and aborts the commit

### Requirement: VS Code workspace settings ship

The repository MUST include `.vscode/settings.json` and `.vscode/extensions.json`. `.vscode/settings.json` MUST set `editor.defaultFormatter` to `esbenp.prettier-vscode`, enable format-on-save, enable ESLint flat config (`eslint.useFlatConfig: true`), and explicitly disable `source.organizeImports` (which fights `simple-import-sort`). `.vscode/extensions.json` MUST recommend `dbaeumer.vscode-eslint`, `esbenp.prettier-vscode`, `bradlc.vscode-tailwindcss`, and `nrwl.angular-console`. It MUST NOT recommend `biomejs.biome`.

#### Scenario: `.vscode/extensions.json` contains the expected recommendations

- **WHEN** `.vscode/extensions.json` is read
- **THEN** its `recommendations` array includes exactly `dbaeumer.vscode-eslint`, `esbenp.prettier-vscode`, `bradlc.vscode-tailwindcss`, and `nrwl.angular-console`
- **AND** its `unwantedRecommendations` array includes `biomejs.biome`

### Requirement: Lint and format Nx targets exist on every project

Every project under `apps/`, `libs/`, and `tools/` MUST declare a `lint` Nx target (using `@nx/eslint:lint`). The workspace root MUST expose `nx format:check` and `nx format:write` that delegate to Prettier. `nx run-many -t lint` and `nx affected -t lint` MUST succeed on a freshly scaffolded workspace.

#### Scenario: Every project has a lint target

- **WHEN** `nx show projects --type app,lib,tool` lists project names
- **THEN** each listed project has a `lint` target in its `project.json`

#### Scenario: `nx format:check` succeeds on scaffolded workspace

- **WHEN** `nx format:check` runs immediately after scaffolding
- **THEN** the exit code is 0

### Requirement: Biome is explicitly not used at this stage

Biome MUST NOT be declared as a dependency or referenced in the workspace's lint/format configuration. Revisiting this decision at a documented later milestone is permitted; this change ships ESLint + Prettier only.

#### Scenario: Biome is absent from dependencies

- **WHEN** the workspace `package.json` is inspected
- **THEN** no `@biomejs/biome`, `biome`, or `@nx/biome` entry exists in `dependencies` or `devDependencies`
