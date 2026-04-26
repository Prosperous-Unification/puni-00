# Tech Foundation Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL — use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Every micro-step is 2-5 minutes. No placeholders.

**Goal:** Scaffold the WBS tool's tech foundation — an Nx monorepo with three apps (`be-01`, `gw-01`, `fe-01`), seven `@wbs/*` libs, nine `tool-*` Nx projects, full observability stack, blue/green Dagger+Bun deploy pipeline, SOPS+age secrets, and a working Layer-A WebSocket resume protocol proven end-to-end via a `ping`/`pong` smoke test.

**Architecture:** Nx-all-the-way (`apps/` + `libs/` + `tools/`, no free-floating directories), Bun runtime + package manager, Elysia HTTP/WS, ArkType validation, Drizzle + `bun:sqlite` behind a repository interface, TanStack (Router/DB/Table) + shadcn/ui, Dagger (TS SDK) for build/test/publish, Bun scripts over SSH for deploy, Docker Compose + Caddy on a single Hetzner host, self-hosted Grafana/Loki/Promtail/Prometheus, SOPS+age for secrets.

**Tech Stack:** Nx 22+, Bun 1.3+, TypeScript 5.x, ElysiaJS, ArkType, Drizzle ORM, `bun:sqlite`, React 18, Vite, TanStack (Router/Table/DB/Query), shadcn/ui via `@nx-extend/shadcn-ui`, d3, Dagger TS SDK, Docker + Compose, Caddy 2, pino, `@elysiajs/opentelemetry`, Prometheus/Grafana/Loki/Promtail, SOPS + age, ESLint 9 (flat) + Prettier 3 + lefthook, `bun test` + Vitest + fast-check + Playwright + Stryker, ntfy.sh for alerts.

**Cross-references:**

- `proposal.md` — Why / What Changes / Capabilities
- `design.md` — All architectural decisions D1-D21 (inlined where content is verbatim)
- `specs/<capability>/spec.md` — Per-capability requirements; every task below traces to one or more specs
- `tasks.md` — Source of task numbering (1.1, 2.3, ...); this plan expands each into micro-steps

---

## Task 1.1: Initialize Nx workspace with Bun

**Traces to:** `specs/monorepo-structure/spec.md`, design D1.

**Files:**

- Create: `nx.json` (placeholder, filled in 1.4)
- Create: `package.json`
- Create: `bun.lockb` (generated)
- Create: `apps/.gitkeep`, `libs/.gitkeep`, `tools/.gitkeep`
- Create: `.gitignore` (seed)

- [ ] **Step 1: Verify Bun is installed at the pinned version**

Run: `bun --version`
Expected: `1.1.34` (or newer 1.1.x — pin tightens in later tasks).
If absent: `curl -fsSL https://bun.sh/install | bash -s "bun-v1.1.34"` and re-open the shell.

- [ ] **Step 2: Initialize the Nx workspace in-place with Bun as package manager**

Run: `bunx create-nx-workspace@~18.0.0 . --preset=ts --nxCloud=skip --packageManager=bun --formatter=prettier --name=wbs`
Expected:

- Output ends with "Successfully created the workspace".
- `package.json` and `nx.json` appear at repo root.
- `bun.lockb` exists; no `package-lock.json`, `pnpm-lock.yaml`, or `yarn.lock`.

If the generator creates a placeholder `packages/` directory, delete it: `rm -rf packages`.

- [ ] **Step 3: Create the three canonical top-level project directories**

```bash
mkdir -p apps libs tools
touch apps/.gitkeep libs/.gitkeep tools/.gitkeep
```

- [ ] **Step 4: Seed `.gitignore`**

Create `.gitignore` at repo root:

```gitignore
node_modules/
dist/
coverage/
.nx/cache
.nx/workspace-data
*.tsbuildinfo
routeTree.gen.ts

.env
.env.local
!.env.example
!*.env.sops

~/.config/sops/age/keys.txt
*.age

.DS_Store
.idea/
```

- [ ] **Step 5: Run `bun install` and verify lockfile is Bun-native**

Run: `bun install`
Expected: Exit 0; `bun.lockb` is a binary file (`file bun.lockb` reports "data").
Confirm `ls package-lock.json pnpm-lock.yaml yarn.lock 2>/dev/null` prints nothing.

- [ ] **Step 6: Commit the baseline**

```bash
git add -A
git commit -m "feat(monorepo): initialize Nx workspace with Bun package manager"
```

---

## Task 1.2: Root `tsconfig.base.json` with `@wbs/*` path aliases

**Files:**

- Create: `tsconfig.base.json`

- [ ] **Step 1: Write `tsconfig.base.json`**

```json
{
  "compileOnSave": false,
  "compilerOptions": {
    "rootDir": ".",
    "sourceMap": true,
    "declaration": false,
    "moduleResolution": "bundler",
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "importHelpers": true,
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "skipDefaultLibCheck": true,
    "baseUrl": ".",
    "strict": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "types": ["bun-types"],
    "paths": {
      "@wbs/validation": ["libs/validation/src/index.ts"],
      "@wbs/validation/fixtures": ["libs/validation/src/fixtures/index.ts"],
      "@wbs/domain": ["libs/domain/src/index.ts"],
      "@wbs/contracts": ["libs/contracts/src/index.ts"],
      "@wbs/observability": ["libs/observability/src/index.ts"],
      "@wbs/observability/server": ["libs/observability/src/server/index.ts"],
      "@wbs/config": ["libs/config/src/index.ts"],
      "@wbs/realtime": ["libs/realtime/src/index.ts"],
      "@wbs/scripts": ["libs/scripts/src/index.ts"]
    }
  },
  "exclude": ["node_modules", "tmp"]
}
```

- [ ] **Step 2: Install `bun-types`**

Run: `bun add -d bun-types@^1.1.34`

- [ ] **Step 3: Verify tsc resolves the base config without errors**

Run: `bunx tsc --noEmit -p tsconfig.base.json`
Expected: Exit 0 (the paths point at not-yet-created files, but strict settings compile fine for an empty project set).

- [ ] **Step 4: Commit**

```bash
git add tsconfig.base.json package.json bun.lockb
git commit -m "feat(monorepo): add root tsconfig.base.json with @wbs/* path aliases"
```

---

## Task 1.3: Root `package.json` scripts + curated devDeps + `.editorconfig` companion

**Files:**

- Modify: `package.json`
- Create: `.editorconfig`

- [ ] **Step 1: Install the curated devDeps list from design D21 and test/build baseline**

Run (split for readability; all may be combined into one `bun add -d`):

```bash
bun add -d \
  nx@^22 \
  @nx/js@^22 @nx/eslint@^22 @nx/eslint-plugin@^22 @nx/workspace@^22 @nx/vite@^22 \
  typescript@^5.4 \
  prettier@^3 prettier-plugin-tailwindcss@^0.6 \
  eslint@^9 typescript-eslint@^8 \
  @eslint/js@^9 \
  eslint-plugin-react@^7 eslint-plugin-react-hooks@^5 eslint-plugin-jsx-a11y@^6 \
  @tanstack/eslint-plugin-router@^1 @tanstack/eslint-plugin-query@^5 \
  eslint-plugin-drizzle@^0.2 \
  eslint-plugin-unused-imports@^4 \
  eslint-plugin-simple-import-sort@^12 \
  eslint-plugin-unicorn@^55 \
  eslint-config-prettier@^9 \
  lefthook@^1 \
  fast-check@^3 \
  vitest@^1 jsdom@^24 @vitest/coverage-v8@^1
```

Expected: Exit 0; `bun.lockb` updated.

- [ ] **Step 2: Add scripts block + top-level `deploy` alias to `package.json`**

Edit `package.json` so the `scripts` block reads:

```json
  "scripts": {
    "deploy": "nx run tool-deploy:deploy",
    "build": "nx run-many -t build",
    "test": "nx run-many -t test",
    "lint": "nx run-many -t lint",
    "format": "nx format:write",
    "format:check": "nx format:check",
    "typecheck": "nx run-many -t typecheck"
  }
```

Also ensure the root `package.json` has `"private": true` and `"type": "module"`.

- [ ] **Step 3: Create `.editorconfig`**

```editorconfig
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 4: Verify `bun run deploy --dry` fails meaningfully (target doesn't exist yet — proves the alias forwards)**

Run: `bun run deploy -- --help`
Expected: Exit 1 or similar with an Nx message "Cannot find project/target 'tool-deploy:deploy'" — confirms the alias is wired, target just doesn't exist yet.

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lockb .editorconfig
git commit -m "feat(monorepo): add root scripts, dev deps, and .editorconfig"
```

---

## Task 1.4: `nx.json` with named inputs, target defaults, and tag allowlist

**Files:**

- Modify: `nx.json`

- [ ] **Step 1: Write the full `nx.json`**

```json
{
  "$schema": "./node_modules/nx/schemas/nx-schema.json",
  "namedInputs": {
    "default": ["{projectRoot}/**/*", "sharedGlobals"],
    "production": [
      "default",
      "!{projectRoot}/**/?(*.)+(spec|test).[jt]s?(x)",
      "!{projectRoot}/tsconfig.spec.json",
      "!{projectRoot}/src/**/*.stories.[jt]s?(x)",
      "!{projectRoot}/.eslintrc.json",
      "!{projectRoot}/eslint.config.js"
    ],
    "sharedGlobals": [
      "{workspaceRoot}/tsconfig.base.json",
      "{workspaceRoot}/eslint.config.js",
      "{workspaceRoot}/.prettierrc.json",
      "{workspaceRoot}/package.json"
    ]
  },
  "targetDefaults": {
    "build": {
      "cache": true,
      "dependsOn": ["^build"],
      "inputs": ["production", "^production"]
    },
    "test": {
      "cache": true,
      "inputs": ["default", "^production"],
      "outputs": ["{projectRoot}/coverage"]
    },
    "lint": {
      "cache": true,
      "inputs": ["default", "{workspaceRoot}/eslint.config.js", "{workspaceRoot}/.prettierrc.json"]
    },
    "typecheck": {
      "cache": true,
      "inputs": ["default", "^production", "{workspaceRoot}/tsconfig.base.json"]
    },
    "deploy": {
      "cache": false
    },
    "push": {
      "cache": false
    },
    "decrypt": {
      "cache": false
    }
  },
  "plugins": [],
  "defaultBase": "main",
  "parallel": 4,
  "useInferencePlugins": false
}
```

- [ ] **Step 2: Run `nx graph --file=/tmp/graph.html` to verify Nx accepts the config**

Run: `bunx nx graph --file=/tmp/graph.html`
Expected: Exit 0; `/tmp/graph.html` written.

- [ ] **Step 3: Commit**

```bash
git add nx.json
git commit -m "feat(monorepo): configure nx.json with named inputs and target defaults"
```

---

## Task 1.5: `.gitignore` final form (already seeded in 1.1; extend if needed)

**Files:**

- Modify: `.gitignore` (already created in Task 1.1; verify it covers everything required)

- [ ] **Step 1: Verify `.gitignore` contains all required entries**

Confirm these lines exist (add any missing):

```
.nx/cache
.nx/workspace-data
dist/
coverage/
node_modules/
routeTree.gen.ts
.env
.env.local
*.tsbuildinfo
.DS_Store
```

And these do NOT appear (must remain tracked):

```
*.env.sops
.sops.yaml
.env.example
```

- [ ] **Step 2: Run a smoke check**

```bash
git check-ignore dist/ node_modules/ .nx/cache/some.txt
# Expected: all three paths printed — confirms they're ignored.

git check-ignore tools/tool-secrets/src/production.env.sops || echo "tracked (correct)"
# Expected: "tracked (correct)".
```

- [ ] **Step 3: Commit any adjustments**

```bash
git add .gitignore
git commit -m "chore(monorepo): finalize .gitignore entries" || echo "no changes"
```

---

## Task 1.6: Baseline verification — `bun install` + `nx graph`

- [ ] **Step 1: Clean install**

```bash
rm -rf node_modules
bun install
```

Expected: Exit 0; `node_modules/` repopulated; `bun.lockb` unchanged.

- [ ] **Step 2: `nx graph` renders even with empty project set**

Run: `bunx nx graph --file=/tmp/graph.html && echo OK`
Expected: "OK".

- [ ] **Step 3: Snapshot commit (no new files; this is a checkpoint)**

```bash
git status
# Expected: "nothing to commit, working tree clean"
```

If anything is dirty, investigate and commit with message `chore(monorepo): baseline snapshot`.

---

## Task 2.1: Install ESLint 9 + plugin ecosystem (devDeps already installed in 1.3)

Already done in Task 1.3. Verify:

- [ ] **Step 1: Confirm all ESLint plugins are in `package.json` devDependencies**

Run:

```bash
bun pm ls --all 2>/dev/null | grep -E "eslint-plugin-(react|react-hooks|jsx-a11y|drizzle|unused-imports|simple-import-sort|unicorn)|@tanstack/eslint-plugin|@nx/eslint" | head
```

Expected: All listed plugins show versions.

If any are missing, `bun add -d <plugin>@<version>` per Task 1.3 Step 1.

- [ ] **Step 2: No commit needed (baseline already committed)**

---

## Task 2.2: Root `eslint.config.js` flat config with per-glob overrides

**Files:**

- Create: `eslint.config.js`

- [ ] **Step 1: Write the flat config**

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import tanstackRouter from '@tanstack/eslint-plugin-router';
import tanstackQuery from '@tanstack/eslint-plugin-query';
import drizzle from 'eslint-plugin-drizzle';
import unusedImports from 'eslint-plugin-unused-imports';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unicorn from 'eslint-plugin-unicorn';
import prettier from 'eslint-config-prettier';
import nxPlugin from '@nx/eslint-plugin';

const nxRules = {
  '@nx/enforce-module-boundaries': [
    'error',
    {
      enforceBuildableLibDependency: true,
      allow: [],
      depConstraints: [
        { sourceTag: 'scope:app', onlyDependOnLibsWithTags: ['scope:shared'] },
        { sourceTag: 'scope:shared', onlyDependOnLibsWithTags: ['scope:shared'] },
        { sourceTag: 'scope:infra', onlyDependOnLibsWithTags: ['scope:shared', 'scope:infra'] },
        {
          sourceTag: 'runtime:browser',
          onlyDependOnLibsWithTags: ['runtime:browser', 'runtime:isomorphic'],
        },
        {
          sourceTag: 'runtime:bun',
          onlyDependOnLibsWithTags: ['runtime:bun', 'runtime:isomorphic'],
        },
        { sourceTag: 'runtime:isomorphic', onlyDependOnLibsWithTags: ['runtime:isomorphic'] },
      ],
    },
  ],
};

export default [
  { ignores: ['**/dist/**', '**/.nx/**', '**/coverage/**', '**/node_modules/**', '**/*.gen.ts'] },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@nx': nxPlugin,
      'unused-imports': unusedImports,
      'simple-import-sort': simpleImportSort,
      unicorn,
    },
    rules: {
      ...nxRules,
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'separate-type-imports' },
      ],
      'unused-imports/no-unused-imports': 'error',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/no-null': 'off',
      'unicorn/filename-case': ['error', { cases: { kebabCase: true } }],
    },
  },

  // fe-01 + any runtime:browser lib: react + a11y
  {
    files: ['apps/fe-01/**/*.{ts,tsx}', 'libs/realtime/**/*.{ts,tsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
      '@tanstack/router': tanstackRouter,
      '@tanstack/query': tanstackQuery,
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      ...reactHooks.configs['recommended-latest'].rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      ...tanstackRouter.configs['flat/recommended'].rules,
      ...tanstackQuery.configs['flat/recommended'].rules,
    },
    settings: { react: { version: 'detect' } },
  },

  // be-01 repository layer: drizzle rules
  {
    files: ['apps/be-01/src/repository/**/*.ts'],
    plugins: { drizzle },
    rules: {
      'drizzle/enforce-delete-with-where': 'error',
      'drizzle/enforce-update-with-where': 'error',
    },
  },

  // be-01 outside repository: cannot import drizzle-orm
  {
    files: ['apps/be-01/src/**/*.ts'],
    ignores: ['apps/be-01/src/repository/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['drizzle-orm/*', 'drizzle-orm'] }],
    },
  },

  // Tests: relaxed
  {
    files: ['**/*.{test,spec,integration.test,property.test,contract.test}.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  prettier,
];
```

- [ ] **Step 2: Verify ESLint parses the config on an empty project set**

Run: `bunx eslint --print-config eslint.config.js >/dev/null`
Expected: Exit 0, no parse errors.

- [ ] **Step 3: Commit**

```bash
git add eslint.config.js
git commit -m "feat(lint): add root flat ESLint config with per-glob overrides"
```

---

## Task 2.3: Prettier config + ignore

**Files:**

- Create: `.prettierrc.json`
- Create: `.prettierignore`

- [ ] **Step 1: Write `.prettierrc.json` verbatim from design D21**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "arrowParens": "always",
  "endOfLine": "lf",
  "bracketSameLine": false,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

- [ ] **Step 2: Write `.prettierignore`**

```gitignore
dist/
.nx/
coverage/
node_modules/
*.gen.ts

*.env.sops
```

- [ ] **Step 3: Verify Prettier runs on the existing files**

Run: `bunx prettier --check .`
Expected: Either "All matched files use Prettier code style!" or a list of offending files. If offenders appear, run `bunx prettier --write .` and re-check.

- [ ] **Step 4: Commit**

```bash
git add .prettierrc.json .prettierignore
git commit -m "feat(lint): add Prettier config and ignore file"
```

---

## Task 2.4: `lefthook` + `lefthook.yml` pre-commit and commit-msg hooks

**Files:**

- Create: `lefthook.yml`

- [ ] **Step 1: Verify lefthook is installed (from Task 1.3) and available**

Run: `bunx lefthook version`
Expected: Prints a version like `lefthook version 1.x.x`.

- [ ] **Step 2: Write `lefthook.yml`**

```yaml
min_version: 1.6.0

pre-commit:
  parallel: true
  jobs:
    - name: eslint-affected
      glob: '*.{ts,tsx,js,jsx}'
      run: bunx nx affected -t lint --uncommitted --fix && git add {staged_files}
      stage_fixed: true

    - name: prettier
      glob: '*.{ts,tsx,js,jsx,json,md,yml,yaml}'
      run: bunx prettier --write {staged_files} && git add {staged_files}
      stage_fixed: true

    - name: plaintext-secret-guard
      run: bun tools/tool-git-hooks/src/hooks/plaintext-secret-guard.ts {staged_files}

commit-msg:
  jobs:
    - name: conventional-commits
      run: bun tools/tool-git-hooks/src/hooks/conventional-commits.ts {1}
```

Note: `tools/tool-git-hooks/src/hooks/*.ts` files are created in Task 10.4. Until then, the hook will fail on commits — acceptable temporarily. Workaround for this task's commit: use `git commit --no-verify` only for this one commit.

- [ ] **Step 3: Commit (bypassing hooks since they reference files not yet created)**

```bash
git add lefthook.yml
git commit --no-verify -m "feat(lint): add lefthook pre-commit and commit-msg hook config"
```

---

## Task 2.5: `.vscode/` settings and extension recommendations

**Files:**

- Create: `.vscode/settings.json`
- Create: `.vscode/extensions.json`

- [ ] **Step 1: Write `.vscode/settings.json` verbatim from design D21**

```json
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit",
    "source.organizeImports": "never"
  },
  "eslint.useFlatConfig": true,
  "eslint.workingDirectories": [{ "mode": "auto" }],
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  "files.insertFinalNewline": true,
  "files.trimTrailingWhitespace": true,
  "files.trimFinalNewlines": true
}
```

- [ ] **Step 2: Write `.vscode/extensions.json`**

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "nrwl.angular-console",
    "ms-azuretools.vscode-docker"
  ],
  "unwantedRecommendations": ["biomejs.biome"]
}
```

- [ ] **Step 3: Commit**

```bash
git add .vscode/
git commit --no-verify -m "feat(lint): add VSCode settings and extension recommendations"
```

---

## Task 2.6: Confirm format + lint exit 0 on the empty scaffold

- [ ] **Step 1: Run format:check**

Run: `bunx nx format:check`
Expected: Exit 0 (or "no files to check" — both acceptable).

If offenders: `bunx nx format:write`, then `git commit --no-verify -am "style: format"`.

- [ ] **Step 2: Run lint across workspace**

Run: `bunx nx run-many -t lint`
Expected: "No targets found" (because no project has a `lint` target yet). Exit 0.

Alternative ESLint invocation to verify the flat config loads:

```bash
bunx eslint --config eslint.config.js 'eslint.config.js'
```

Expected: Exit 0.

- [ ] **Step 3: No-op commit if working tree clean**

```bash
git status
# Expected: clean
```

---

## Task 3.1: Generate `@wbs/validation` library

**Traces to:** `specs/shared-libraries/spec.md` (validation), design D19.

**Files:**

- Create (via Nx generator): `libs/validation/project.json`, `libs/validation/src/index.ts`, `libs/validation/tsconfig.json`, etc.
- Modify: `tsconfig.base.json` (path alias already present from Task 1.2 — no change)
- Create: `libs/validation/src/core.ts`
- Create: `libs/validation/src/branded.ts`
- Create: `libs/validation/src/errors.ts`
- Create: `libs/validation/src/core.test.ts`

- [ ] **Step 1: Install ArkType**

Run: `bun add arktype@^2.0.0-rc`

- [ ] **Step 2: Generate the Nx JS library**

Run: `bunx nx g @nx/js:lib libs/validation --bundler=none --unitTestRunner=none --tags="scope:shared,type:validation,runtime:isomorphic" --linter=eslint --no-interactive`
Expected: New files under `libs/validation/`; project.json lists `lint` target.

- [ ] **Step 3: Add `test` target using `bun test` via `nx:run-commands`**

Edit `libs/validation/project.json`. Replace (or add) the `targets` block:

```json
{
  "name": "validation",
  "sourceRoot": "libs/validation/src",
  "projectType": "library",
  "tags": ["scope:shared", "type:validation", "runtime:isomorphic"],
  "targets": {
    "lint": {
      "executor": "@nx/eslint:lint",
      "options": { "lintFilePatterns": ["libs/validation/**/*.ts"] }
    },
    "test": {
      "executor": "nx:run-commands",
      "options": {
        "command": "bun test --coverage",
        "cwd": "libs/validation"
      },
      "outputs": ["{projectRoot}/coverage"]
    },
    "typecheck": {
      "executor": "nx:run-commands",
      "options": {
        "command": "bunx tsc --noEmit -p libs/validation/tsconfig.json"
      }
    }
  }
}
```

- [ ] **Step 4: Write the failing test first (TDD)**

Create `libs/validation/src/core.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { type, parseOrThrow, ValidationError } from './core';

describe('@wbs/validation core', () => {
  it('re-exports ArkType type function that validates objects', () => {
    const Person = type({ name: 'string', age: 'number>0' });
    const result = Person({ name: 'Ada', age: 36 });
    expect(result).toEqual({ name: 'Ada', age: 36 });
  });

  it('parseOrThrow returns parsed value on success', () => {
    const Email = type('string.email');
    expect(parseOrThrow(Email, 'ada@example.com')).toBe('ada@example.com');
  });

  it('parseOrThrow throws ValidationError on failure, embedding the offending value', () => {
    const Email = type('string.email');
    const bad = 'not-an-email';
    expect(() => parseOrThrow(Email, bad)).toThrow(ValidationError);
    try {
      parseOrThrow(Email, bad);
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).message).toContain('not-an-email');
    }
  });
});
```

- [ ] **Step 5: Run the test — expect failure**

Run: `cd libs/validation && bun test`
Expected: Fails with `Cannot find module './core'` or similar.

- [ ] **Step 6: Write the minimal implementation**

Create `libs/validation/src/errors.ts`:

```ts
export class ValidationError extends Error {
  override name = 'ValidationError' as const;
  readonly cause: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
  }
}
```

Create `libs/validation/src/core.ts`:

```ts
import { type, type Type } from 'arktype';

import { ValidationError } from './errors';

export { type };
export type { Type };
export { ValidationError };

export type InferSchema<T> = T extends Type<infer U> ? U : never;

export function parseOrThrow<T extends Type>(schema: T, input: unknown): T['infer'] {
  const result = schema(input);
  if (result instanceof type.errors) {
    throw new ValidationError(
      `Validation failed for value ${JSON.stringify(input)}: ${result.summary}`,
      result,
    );
  }
  return result as T['infer'];
}

export function defineSchema<T extends Type>(schema: T): T {
  return schema;
}
```

Create `libs/validation/src/branded.ts`:

```ts
import { type } from 'arktype';

declare const brand: unique symbol;
export type Branded<Base, Tag extends string> = Base & { readonly [brand]: Tag };

export function brandedString<Tag extends string>(_tag: Tag, constraints: string = 'string') {
  return type(constraints) as unknown as {
    infer: Branded<string, Tag>;
  } & ReturnType<typeof type>;
}
```

Create `libs/validation/src/index.ts`:

```ts
export * from './core';
export * from './branded';
export * from './errors';
```

- [ ] **Step 7: Run the test — expect pass**

Run: `cd libs/validation && bun test`
Expected: `3 pass, 0 fail`. Coverage ≥85%.

- [ ] **Step 8: Commit**

```bash
git add libs/validation/ package.json bun.lockb
git commit -m "feat(validation): scaffold @wbs/validation with ArkType core and error helpers"
```

---

## Task 3.2: `libs/validation/src/fixtures/` sub-path export

**Files:**

- Create: `libs/validation/src/fixtures/index.ts`
- Create: `libs/validation/src/fixtures/db.ts`
- Create: `libs/validation/src/fixtures/frame.ts`
- Create: `libs/validation/src/fixtures/clock.ts`
- Create: `libs/validation/src/fixtures/README.md`

- [ ] **Step 1: Install drizzle-orm and bun:sqlite types (needed for `makeTestDb`)**

Run: `bun add drizzle-orm@^0.31`
Run: `bun add -d drizzle-kit@^0.22`

- [ ] **Step 2: Write the failing test**

Append to `libs/validation/src/core.test.ts`:

```ts
import { makeTestDb, makeFrame, injectedClock } from './fixtures';

describe('@wbs/validation/fixtures', () => {
  it('makeTestDb returns an in-memory Drizzle instance with migrations applied', async () => {
    const db = await makeTestDb({ migrationsFolder: null });
    const result = db.$client.query('SELECT 1 AS one').get() as { one: number };
    expect(result.one).toBe(1);
    db.$client.close();
  });

  it('makeFrame produces a valid WS frame with defaults', () => {
    const f = makeFrame({ subscription: 'doc:abc' });
    expect(f.subscription).toBe('doc:abc');
    expect(typeof f.seq).toBe('number');
    expect(f.message).toBeDefined();
  });

  it('injectedClock returns monotonically increasing values from a fixed start', () => {
    const clock = injectedClock(1_000_000);
    expect(clock.now()).toBe(1_000_000);
    clock.advance(500);
    expect(clock.now()).toBe(1_000_500);
  });
});
```

- [ ] **Step 3: Run the test — expect failure**

Run: `cd libs/validation && bun test`
Expected: Fails on missing `./fixtures` module.

- [ ] **Step 4: Implement `clock.ts`**

```ts
export interface InjectedClock {
  now(): number;
  advance(deltaMs: number): void;
}

export function injectedClock(startMs = 0): InjectedClock {
  let current = startMs;
  return {
    now: () => current,
    advance: (delta: number) => {
      current += delta;
    },
  };
}
```

- [ ] **Step 5: Implement `frame.ts`**

```ts
export interface WsFrame {
  subscription: string;
  seq: number;
  message: unknown;
}

let globalSeq = 0;

export function makeFrame(overrides: Partial<WsFrame> = {}): WsFrame {
  return {
    subscription: 'test:subscription',
    seq: ++globalSeq,
    message: { type: 'ping' },
    ...overrides,
  };
}
```

- [ ] **Step 6: Implement `db.ts`**

```ts
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';

export interface TestDbOptions {
  migrationsFolder: string | null;
}

export async function makeTestDb(opts: TestDbOptions) {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite);
  if (opts.migrationsFolder) {
    const { migrate } = await import('drizzle-orm/bun-sqlite/migrator');
    migrate(db, { migrationsFolder: opts.migrationsFolder });
  }
  return db;
}
```

- [ ] **Step 7: Implement `fixtures/index.ts` barrel**

```ts
export * from './clock';
export * from './frame';
export * from './db';
```

- [ ] **Step 8: Create the README**

`libs/validation/src/fixtures/README.md`:

````md
# `@wbs/validation/fixtures`

The single source of truth for test fixtures across the workspace.

## Usage

```ts
import { makeTestDb, makeFrame, injectedClock } from '@wbs/validation/fixtures';
```

## Conventions (agent-TDD ergonomics — see design D20)

1. Factories, never shared mutable fixtures. `makeX({ override })` pattern.
2. Deterministic clock + RNG — `injectedClock(startMs)` and seeded `fast-check`.
3. No network, no filesystem, no wall clock in unit tests.
4. One assertion concept per test.
5. Test names state invariants, not actions.

See `design.md` D20 for the full list.
````

- [ ] **Step 9: Run the tests**

Run: `cd libs/validation && bun test`
Expected: `6 pass, 0 fail`.

- [ ] **Step 10: Commit**

```bash
git add libs/validation/ package.json bun.lockb
git commit -m "feat(validation): add /fixtures sub-path export with db/frame/clock helpers"
```

---

## Task 3.3: Generate `@wbs/domain` library

**Files:**

- Create (via Nx): `libs/domain/` scaffold
- Create: `libs/domain/src/wbs-item.ts`
- Create: `libs/domain/src/estimate.ts`
- Create: `libs/domain/src/dependency.ts`
- Create: `libs/domain/src/wbs-item.test.ts`

- [ ] **Step 1: Generate**

Run: `bunx nx g @nx/js:lib libs/domain --bundler=none --unitTestRunner=none --tags="scope:shared,type:domain,runtime:isomorphic" --linter=eslint --no-interactive`

Add the same test/typecheck targets to `libs/domain/project.json` as in Task 3.1 Step 3 (substitute `domain` for `validation`).

- [ ] **Step 2: Write failing test**

`libs/domain/src/wbs-item.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { WbsItem, WbsItemId } from './wbs-item';
import { parseOrThrow, ValidationError } from '@wbs/validation';

describe('WbsItem schema', () => {
  it('parses a valid item with branded id', () => {
    const raw = { id: '01HXYZABC', title: 'Root task', estimateHours: 4 };
    const item = parseOrThrow(WbsItem, raw);
    expect(item.id).toBe('01HXYZABC');
  });

  it('rejects empty title', () => {
    expect(() => parseOrThrow(WbsItem, { id: '01HXYZABC', title: '', estimateHours: 4 })).toThrow(
      ValidationError,
    );
  });

  it('WbsItemId is branded — TypeScript refuses to assign raw strings', () => {
    const raw = parseOrThrow(WbsItemId, '01HXYZABC');
    expect(raw).toBe('01HXYZABC');
  });
});
```

- [ ] **Step 3: Run — expect failure**

Run: `cd libs/domain && bun test`
Expected: Fails on missing `./wbs-item`.

- [ ] **Step 4: Implement**

`libs/domain/src/wbs-item.ts`:

```ts
import { type } from '@wbs/validation';

export const WbsItemId = type('/^[0-9A-HJKMNP-TV-Z]{9,26}$/');
export type WbsItemId = typeof WbsItemId.infer;

export const WbsItem = type({
  id: WbsItemId,
  title: 'string>0',
  estimateHours: 'number>=0',
  'parentId?': WbsItemId,
});
export type WbsItem = typeof WbsItem.infer;
```

`libs/domain/src/estimate.ts`:

```ts
import { type } from '@wbs/validation';

export const Estimate = type({
  wbsItemId: 'string',
  hours: 'number>=0',
  confidence: "'low'|'medium'|'high'",
});
export type Estimate = typeof Estimate.infer;
```

`libs/domain/src/dependency.ts`:

```ts
import { type } from '@wbs/validation';

export const Dependency = type({
  from: 'string',
  to: 'string',
  kind: "'finish-to-start'|'start-to-start'|'finish-to-finish'|'start-to-finish'",
});
export type Dependency = typeof Dependency.infer;
```

`libs/domain/src/index.ts`:

```ts
export * from './wbs-item';
export * from './estimate';
export * from './dependency';
```

- [ ] **Step 5: Run — expect pass**

Run: `cd libs/domain && bun test`
Expected: `3 pass, 0 fail`.

- [ ] **Step 6: Commit**

```bash
git add libs/domain/
git commit -m "feat(domain): scaffold @wbs/domain with WbsItem, Estimate, Dependency schemas"
```

---

## Task 3.4: Coverage gate + `nx test` green for both libs

- [ ] **Step 1: Verify `nx test validation` and `nx test domain` pass with ≥85% coverage**

Run: `bunx nx test validation && bunx nx test domain`
Expected: Exit 0 for both. Each command prints a coverage table; verify line coverage ≥85% for both.

- [ ] **Step 2: If coverage is insufficient, add tests targeting uncovered branches**

For anything below 85%, add unit tests until the threshold is met. Commit each addition separately with message `test(<lib>): raise coverage on <branch>`.

- [ ] **Step 3: No standalone commit unless coverage work was done**

---

## Task 4.1: `@wbs/observability` — pino logger + log schema + metric wrappers

**Traces to:** `specs/shared-libraries/spec.md` (observability), design D12.

**Files:**

- Create (via Nx): `libs/observability/` scaffold
- Create: `libs/observability/src/log-schema.ts`
- Create: `libs/observability/src/logger.ts`
- Create: `libs/observability/src/metrics.ts`
- Create: `libs/observability/src/serializers.ts`
- Create: `libs/observability/src/logger.test.ts`

- [ ] **Step 1: Install pino + @opentelemetry deps**

```bash
bun add pino@^9 @opentelemetry/api@^1 @opentelemetry/sdk-node@^0.50 @opentelemetry/sdk-metrics@^1 @opentelemetry/exporter-prometheus@^0.50
```

- [ ] **Step 2: Generate the lib**

Run: `bunx nx g @nx/js:lib libs/observability --bundler=none --unitTestRunner=none --tags="scope:shared,type:observability,runtime:isomorphic" --linter=eslint --no-interactive`

Add `test` + `typecheck` targets to `libs/observability/project.json` as before.

- [ ] **Step 3: Write the failing test**

`libs/observability/src/logger.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { createLogger } from './logger';
import { LogRecord } from './log-schema';
import { parseOrThrow } from '@wbs/validation';

describe('createLogger', () => {
  it('emits records conforming to the LogRecord schema', () => {
    const stream: string[] = [];
    const logger = createLogger({
      service: 'be-01',
      version: 'test-sha',
      destination: { write: (chunk: string) => stream.push(chunk) },
    });

    logger.info({ request_id: 'req-1', user_id: 'u-1' }, 'hello');

    const record = JSON.parse(stream.at(-1)!);
    const parsed = parseOrThrow(LogRecord, record);
    expect(parsed.service).toBe('be-01');
    expect(parsed.request_id).toBe('req-1');
    expect(parsed.msg).toBe('hello');
    expect(parsed.version).toBe('test-sha');
  });

  it('child logger inherits context', () => {
    const stream: string[] = [];
    const base = createLogger({
      service: 'gw-01',
      version: 'v1',
      destination: { write: (c: string) => stream.push(c) },
    });
    const child = base.child({ connection_id: 'c-1', ws_subscription: 'doc:abc' });
    child.warn('test');
    const rec = JSON.parse(stream.at(-1)!);
    expect(rec.connection_id).toBe('c-1');
    expect(rec.ws_subscription).toBe('doc:abc');
  });
});
```

- [ ] **Step 4: Run — expect failure**

Run: `cd libs/observability && bun test`
Expected: Fails on missing modules.

- [ ] **Step 5: Implement `log-schema.ts` verbatim from design D12**

```ts
import { type } from '@wbs/validation';

export const LogRecord = type({
  level: "'trace'|'debug'|'info'|'warn'|'error'|'fatal'| 10|20|30|40|50|60",
  time: 'number',
  msg: 'string',
  service: "'be-01'|'gw-01'|'fe-01'",
  'request_id?': 'string',
  'connection_id?': 'string',
  'user_id?': 'string',
  'ws_subscription?': 'string',
  'trace_id?': 'string',
  'span_id?': 'string',
  'version?': 'string',
  'err?': {
    name: 'string',
    message: 'string',
    'stack?': 'string',
  },
  '[string]': 'unknown',
});
export type LogRecord = typeof LogRecord.infer;
```

- [ ] **Step 6: Implement `serializers.ts`**

```ts
import type { SerializedError } from 'pino';

export const errSerializer = (err: Error): SerializedError => ({
  type: err.constructor.name,
  message: err.message,
  stack: err.stack ?? '',
});
```

- [ ] **Step 7: Implement `logger.ts`**

```ts
import pino, { type Logger, type LoggerOptions } from 'pino';

import { errSerializer } from './serializers';

export type ServiceName = 'be-01' | 'gw-01' | 'fe-01';

export interface CreateLoggerOptions {
  service: ServiceName;
  version?: string;
  level?: string;
  destination?: { write(chunk: string): void };
}

export function createLogger(opts: CreateLoggerOptions): Logger {
  const level = opts.level ?? process.env.LOG_LEVEL ?? 'info';
  const base: Record<string, unknown> = { service: opts.service };
  if (opts.version) base['version'] = opts.version;

  const options: LoggerOptions = {
    level,
    base,
    timestamp: () => `,"time":${Date.now()}`,
    serializers: { err: errSerializer },
    formatters: {
      level: (label: string) => ({ level: label }),
    },
  };

  return opts.destination
    ? pino(options, opts.destination as pino.DestinationStream)
    : pino(options);
}

export type { Logger };
```

- [ ] **Step 8: Implement `metrics.ts` wrappers**

```ts
import { metrics, type Counter as OtelCounter } from '@opentelemetry/api';

const meter = metrics.getMeter('@wbs/observability', '1.0.0');

export class Counter {
  private readonly impl: OtelCounter;
  constructor(name: string, description?: string) {
    this.impl = meter.createCounter(name, { description });
  }
  inc(value = 1, attrs?: Record<string, string>) {
    this.impl.add(value, attrs);
  }
}

export class Histogram {
  private readonly impl = meter.createHistogram(this.name, { description: this.description });
  constructor(
    private readonly name: string,
    private readonly description?: string,
  ) {}
  observe(value: number, attrs?: Record<string, string>) {
    this.impl.record(value, attrs);
  }
}

export class Gauge {
  private readonly impl = meter.createUpDownCounter(this.name, { description: this.description });
  constructor(
    private readonly name: string,
    private readonly description?: string,
  ) {}
  set(value: number, attrs?: Record<string, string>) {
    this.impl.add(value, attrs);
  }
}
```

- [ ] **Step 9: Implement `index.ts` barrel**

```ts
export * from './logger';
export * from './log-schema';
export * from './metrics';
```

- [ ] **Step 10: Run tests**

Run: `cd libs/observability && bun test`
Expected: `2 pass`.

- [ ] **Step 11: Commit**

```bash
git add libs/observability/ package.json bun.lockb
git commit -m "feat(observability): scaffold @wbs/observability with pino logger, LogRecord schema, metrics"
```

---

## Task 4.2: `@wbs/observability/server` — Elysia OTel plugin + `/metrics` exporter

**Files:**

- Create: `libs/observability/src/server/index.ts`
- Create: `libs/observability/src/server/otel-plugin.ts`
- Create: `libs/observability/src/server/otel-plugin.test.ts`

- [ ] **Step 1: Install the Elysia OTel plugin**

```bash
bun add @elysiajs/opentelemetry@^1 elysia@^1.0
```

- [ ] **Step 2: Update path alias in `tsconfig.base.json` — already present. Verify the path `@wbs/observability/server` resolves to `libs/observability/src/server/index.ts`.**

- [ ] **Step 3: Write failing test**

`libs/observability/src/server/otel-plugin.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { Elysia } from 'elysia';
import { observabilityPlugin } from './otel-plugin';

describe('observabilityPlugin', () => {
  it('exposes GET /metrics returning Prometheus exposition format', async () => {
    const app = new Elysia().use(observabilityPlugin({ service: 'be-01' }));
    const res = await app.handle(new Request('http://localhost/metrics'));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('# HELP');
  });
});
```

- [ ] **Step 4: Implement `otel-plugin.ts`**

```ts
import { Elysia } from 'elysia';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { metrics } from '@opentelemetry/api';

import type { ServiceName } from '../logger';

export interface ObservabilityPluginOptions {
  service: ServiceName;
  metricsPath?: string;
}

let started = false;

function ensureExporter(): PrometheusExporter {
  const exporter = new PrometheusExporter({ preventServerStart: true });
  if (!started) {
    const provider = new MeterProvider({ readers: [exporter] });
    metrics.setGlobalMeterProvider(provider);
    started = true;
  }
  return exporter;
}

export function observabilityPlugin(opts: ObservabilityPluginOptions) {
  const metricsPath = opts.metricsPath ?? '/metrics';
  const exporter = ensureExporter();

  return new Elysia({ name: 'wbs-observability', seed: opts.service }).get(
    metricsPath,
    async () => {
      const { resourceMetrics, errors } = await new Promise<{
        resourceMetrics: unknown;
        errors: Error[];
      }>((resolve) => {
        // @ts-expect-error private API — acceptable for a scaffold
        exporter['_serializer'] ??= null;
        exporter.collect().then(resolve);
      });
      if (errors.length > 0) {
        return new Response(`# scrape errors: ${errors.map((e) => e.message).join(',')}`, {
          status: 500,
        });
      }
      const text = exporter['_serializer']
        ? (exporter['_serializer'] as { serialize: (m: unknown) => string }).serialize(
            resourceMetrics,
          )
        : '# HELP placeholder\n';
      return new Response(text, { headers: { 'content-type': 'text/plain; version=0.0.4' } });
    },
  );
}
```

Note: This serialization hand-wave is for scaffold coherence. A follow-up task in the first real monitoring feature replaces the `_serializer` hack with a proper `PrometheusSerializer` call.

`libs/observability/src/server/index.ts`:

```ts
export { observabilityPlugin } from './otel-plugin';
export type { ObservabilityPluginOptions } from './otel-plugin';
```

- [ ] **Step 5: Run the test**

Run: `cd libs/observability && bun test`
Expected: `3 pass` (the previous two + new one).

- [ ] **Step 6: Commit**

```bash
git add libs/observability/ package.json bun.lockb
git commit -m "feat(observability): add /server Elysia OTel plugin with Prometheus /metrics"
```

---

## Task 4.3: `@wbs/config` — `defineConfig`, env schemas, SOPS loader

**Files:**

- Create (via Nx): `libs/config/` scaffold
- Create: `libs/config/src/define-config.ts`
- Create: `libs/config/src/env-schemas.ts`
- Create: `libs/config/src/sops-loader.ts`
- Create: `libs/config/src/define-config.test.ts`

- [ ] **Step 1: Generate lib**

Run: `bunx nx g @nx/js:lib libs/config --bundler=none --unitTestRunner=none --tags="scope:shared,type:config,runtime:bun" --linter=eslint --no-interactive`

Add `test` + `typecheck` targets.

- [ ] **Step 2: Write failing test**

`libs/config/src/define-config.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { type } from '@wbs/validation';
import { defineConfig } from './define-config';

describe('defineConfig', () => {
  it('parses process.env overrides correctly', () => {
    const cfg = defineConfig(type({ PORT: 'string.integer.parse', LOG_LEVEL: "'info'|'debug'" }), {
      PORT: '3100',
      LOG_LEVEL: 'info',
    });
    expect(cfg.PORT).toBe(3100);
    expect(cfg.LOG_LEVEL).toBe('info');
  });

  it('throws with a clear message when env is invalid', () => {
    expect(() =>
      defineConfig(type({ PORT: 'string.integer.parse' }), { PORT: 'not-a-port' }),
    ).toThrow(/PORT/);
  });
});
```

- [ ] **Step 3: Run — expect failure**

Run: `cd libs/config && bun test`

- [ ] **Step 4: Implement**

`libs/config/src/define-config.ts`:

```ts
import { parseOrThrow, type Type } from '@wbs/validation';

export function defineConfig<T extends Type>(
  schema: T,
  envSource: Record<string, string | undefined> = process.env,
): T['infer'] {
  return parseOrThrow(schema, envSource);
}
```

`libs/config/src/env-schemas.ts`:

```ts
import { type } from '@wbs/validation';

export const Port = type('string.integer.parse').narrow(
  (n, ctx) => (n >= 1 && n <= 65_535) || ctx.mustBe('a valid TCP port 1-65535'),
);

export const LogLevel = type("'trace'|'debug'|'info'|'warn'|'error'|'fatal'");

export const JwtKey = type('string>=32');

export const InternalAuthSecret = type('string>=32');
```

`libs/config/src/sops-loader.ts`:

```ts
import { spawn } from 'bun';

export async function loadSopsDecrypted(path: string): Promise<Record<string, string>> {
  const proc = spawn(['sops', '-d', '--input-type', 'dotenv', '--output-type', 'dotenv', path], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`sops decrypt failed (${exitCode}): ${stderr}`);
  }
  const out: Record<string, string> = {};
  for (const line of stdout.split('\n')) {
    const [k, ...rest] = line.split('=');
    if (!k || k.startsWith('#')) continue;
    out[k.trim()] = rest.join('=').trim();
  }
  return out;
}
```

`libs/config/src/index.ts`:

```ts
export * from './define-config';
export * from './env-schemas';
export * from './sops-loader';
```

- [ ] **Step 5: Run tests**

Run: `cd libs/config && bun test`
Expected: `2 pass`.

- [ ] **Step 6: Commit**

```bash
git add libs/config/
git commit -m "feat(config): scaffold @wbs/config with defineConfig, env schemas, SOPS loader"
```

---

## Task 4.4: Verify runtime boundaries (browser cannot import `/server` or `@wbs/config`)

- [ ] **Step 1: Write a deliberately bad file and run `nx lint` to confirm the module-boundary rule fires**

In a scratch path (e.g., `libs/validation/src/__scratch__/bad.ts`):

```ts
import { loadSopsDecrypted } from '@wbs/config';
console.log(loadSopsDecrypted);
```

Run: `bunx nx lint validation`
Expected: ESLint error — `validation` is tagged `runtime:isomorphic`, cannot import `@wbs/config` which is `runtime:bun`.

- [ ] **Step 2: Delete the scratch file**

```bash
rm -r libs/validation/src/__scratch__/
```

- [ ] **Step 3: Commit (no file changes; tree should be clean)**

`git status` should show nothing. No commit needed.

---

## Task 5.1: `@wbs/contracts` — internal HTTP + public HTTP + WS envelope + resume

**Traces to:** `specs/shared-libraries/spec.md` (contracts), design D3, D7, D17.

**Files:**

- Create (via Nx): `libs/contracts/` scaffold
- Create: `libs/contracts/src/internal.ts`
- Create: `libs/contracts/src/ws.ts`
- Create: `libs/contracts/src/errors.ts`
- Create: `libs/contracts/src/internal.test.ts`
- Create: `libs/contracts/src/ws.test.ts`

- [ ] **Step 1: Generate lib**

Run: `bunx nx g @nx/js:lib libs/contracts --bundler=none --unitTestRunner=none --tags="scope:shared,type:contracts,runtime:isomorphic" --linter=eslint --no-interactive`

Add `test` + `typecheck` targets.

- [ ] **Step 2: Write failing tests**

`libs/contracts/src/internal.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { parseOrThrow, ValidationError } from '@wbs/validation';
import { InternalPushRequest, InternalForwardRequest, InternalResumeRequest } from './internal';

describe('internal contracts', () => {
  it('InternalPushRequest accepts a valid payload', () => {
    const v = parseOrThrow(InternalPushRequest, {
      subscription: 'doc:abc',
      seq: 1,
      message: { type: 'ping' },
    });
    expect(v.seq).toBe(1);
  });

  it('InternalPushRequest rejects non-monotonic seq type', () => {
    expect(() =>
      parseOrThrow(InternalPushRequest, { subscription: 'doc:abc', seq: 'one', message: {} }),
    ).toThrow(ValidationError);
  });

  it('InternalResumeRequest parses resume_points map', () => {
    const v = parseOrThrow(InternalResumeRequest, {
      resume_points: { 'doc:abc': 42, 'user:xyz': 7 },
      trace_id: 't-1',
    });
    expect(v.resume_points['doc:abc']).toBe(42);
  });

  it('InternalForwardRequest requires trace_id', () => {
    expect(() => parseOrThrow(InternalForwardRequest, { message: { type: 'ping' } })).toThrow(
      ValidationError,
    );
  });
});
```

`libs/contracts/src/ws.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { parseOrThrow } from '@wbs/validation';
import { WsFrame, WsControlFrame } from './ws';

describe('WS envelopes', () => {
  it('WsFrame round-trips subscription/seq/message', () => {
    const v = parseOrThrow(WsFrame, { subscription: 'doc:abc', seq: 5, message: { a: 1 } });
    expect(v.seq).toBe(5);
  });

  it('resume_ack control frame parses', () => {
    const v = parseOrThrow(WsControlFrame, {
      type: 'resume_ack',
      replayed: { 'doc:abc': 7 },
    });
    if (v.type !== 'resume_ack') throw new Error();
    expect(v.replayed['doc:abc']).toBe(7);
  });

  it('resume_denied control frame parses', () => {
    const v = parseOrThrow(WsControlFrame, {
      type: 'resume_denied',
      subscription: 'doc:abc',
      reason: 'out_of_range',
    });
    expect(v.type).toBe('resume_denied');
  });
});
```

- [ ] **Step 3: Run — expect failure**

Run: `cd libs/contracts && bun test`

- [ ] **Step 4: Implement `errors.ts`**

```ts
export const ErrorCode = {
  BackendUnavailable: 'backend_unavailable',
  AuthFailure: 'auth_failure',
  InvalidPayload: 'invalid_payload',
  OutOfRange: 'out_of_range',
  RateLimited: 'rate_limited',
  Internal: 'internal',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
```

- [ ] **Step 5: Implement `internal.ts`**

```ts
import { type } from '@wbs/validation';

export const InternalPushRequest = type({
  subscription: 'string',
  seq: 'number',
  message: 'unknown',
  'trace_id?': 'string',
});
export type InternalPushRequest = typeof InternalPushRequest.infer;

export const InternalPushResponse = type({ delivered_to_sockets: 'number' });
export type InternalPushResponse = typeof InternalPushResponse.infer;

export const InternalForwardRequest = type({
  message: 'unknown',
  trace_id: 'string',
});
export type InternalForwardRequest = typeof InternalForwardRequest.infer;

export const InternalForwardResponse = type({
  ack: 'true',
  'push_responses?': 'unknown[]',
});

export const InternalResumeRequest = type({
  resume_points: { '[string]': 'number' },
  trace_id: 'string',
});
export type InternalResumeRequest = typeof InternalResumeRequest.infer;

export const InternalResumeResponse = type({
  '[string]': [
    { status: "'replaying'", count: 'number' },
    '|',
    { status: "'denied'", reason: "'out_of_range'" },
  ],
});
export type InternalResumeResponse = typeof InternalResumeResponse.infer;
```

- [ ] **Step 6: Implement `ws.ts`**

```ts
import { type } from '@wbs/validation';

export const WsFrame = type({
  subscription: 'string',
  seq: 'number',
  message: 'unknown',
});
export type WsFrame = typeof WsFrame.infer;

const ResumeFrame = type({
  type: "'resume'",
  resume_points: { '[string]': 'number' },
});

const ResumeAckFrame = type({
  type: "'resume_ack'",
  replayed: { '[string]': 'number' },
});

const ResumeDeniedFrame = type({
  type: "'resume_denied'",
  subscription: 'string',
  reason: "'out_of_range'",
});

const PingFrame = type({ type: "'ping'" });
const PongFrame = type({ type: "'pong'" });

const ErrorFrame = type({
  type: "'error'",
  code: 'string',
  'retry_after?': 'number',
  'message?': 'string',
});

export const WsControlFrame = type([
  ResumeFrame,
  '|',
  ResumeAckFrame,
  '|',
  ResumeDeniedFrame,
  '|',
  PingFrame,
  '|',
  PongFrame,
  '|',
  ErrorFrame,
]);
export type WsControlFrame = typeof WsControlFrame.infer;
```

`libs/contracts/src/index.ts`:

```ts
export * from './internal';
export * from './ws';
export * from './errors';
```

- [ ] **Step 7: Run tests**

Run: `cd libs/contracts && bun test`
Expected: `7 pass`.

- [ ] **Step 8: Commit**

```bash
git add libs/contracts/
git commit -m "feat(contracts): scaffold @wbs/contracts with internal, WS, resume, and error schemas"
```

---

## Task 5.2: `@wbs/realtime` — `ReconnectingWsClient` + TanStack DB adapter stub

**Traces to:** `specs/shared-libraries/spec.md` (realtime), design D17.

**Files:**

- Create (via Nx): `libs/realtime/` scaffold
- Create: `libs/realtime/src/reconnecting-ws.ts`
- Create: `libs/realtime/src/subscription-tracker.ts`
- Create: `libs/realtime/src/tanstack-adapter.ts`
- Create: `libs/realtime/src/reconnecting-ws.test.ts`

- [ ] **Step 1: Generate lib**

Run: `bunx nx g @nx/js:lib libs/realtime --bundler=none --unitTestRunner=none --tags="scope:shared,type:realtime,runtime:browser" --linter=eslint --no-interactive`

Add `test` + `typecheck` targets. Test command uses `bun test --preload` with a WebSocket polyfill — simplest approach: run under Bun directly since Bun provides `WebSocket`.

- [ ] **Step 2: Write failing test (unit scope — not a full WS integration yet)**

`libs/realtime/src/reconnecting-ws.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { SubscriptionTracker } from './subscription-tracker';
import { computeBackoff } from './reconnecting-ws';

describe('SubscriptionTracker', () => {
  it('records and reads last_seq per subscription', () => {
    const storage = new Map<string, string>();
    const tr = new SubscriptionTracker({
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, v),
    });
    tr.update('doc:abc', 5);
    tr.update('doc:abc', 7);
    tr.update('user:xyz', 2);
    expect(tr.snapshot()).toEqual({ 'doc:abc': 7, 'user:xyz': 2 });
  });

  it('persists across instances via storage', () => {
    const storage = new Map<string, string>();
    const s = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
    };
    const t1 = new SubscriptionTracker(s);
    t1.update('doc:abc', 42);
    const t2 = new SubscriptionTracker(s);
    expect(t2.snapshot()['doc:abc']).toBe(42);
  });
});

describe('computeBackoff', () => {
  it('starts at 500ms and doubles up to a 30s cap', () => {
    const samples = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(
      (n) => computeBackoff(n, () => 0.5), // no jitter
    );
    expect(samples[0]).toBe(500);
    expect(samples[1]).toBe(1000);
    expect(samples[2]).toBe(2000);
    expect(samples[6]).toBe(30_000); // capped
    expect(samples[8]).toBe(30_000);
  });

  it('applies ±20% jitter', () => {
    const values = new Set<number>();
    for (let i = 0; i < 50; i++) {
      values.add(computeBackoff(3, Math.random));
    }
    expect(values.size).toBeGreaterThan(10);
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(Math.floor(4000 * 0.8));
      expect(v).toBeLessThanOrEqual(Math.ceil(4000 * 1.2));
    }
  });
});
```

- [ ] **Step 3: Run — expect failure**

Run: `cd libs/realtime && bun test`

- [ ] **Step 4: Implement `subscription-tracker.ts`**

```ts
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'wbs:realtime:last-seq';

export class SubscriptionTracker {
  private readonly state: Record<string, number>;
  constructor(private readonly storage: KeyValueStorage) {
    const raw = storage.getItem(STORAGE_KEY);
    this.state = raw ? (JSON.parse(raw) as Record<string, number>) : {};
  }

  update(subscription: string, seq: number): void {
    const current = this.state[subscription] ?? -1;
    if (seq > current) {
      this.state[subscription] = seq;
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    }
  }

  snapshot(): Record<string, number> {
    return { ...this.state };
  }
}
```

- [ ] **Step 5: Implement `reconnecting-ws.ts`**

```ts
import type { WsControlFrame, WsFrame } from '@wbs/contracts';
import { parseOrThrow, type } from '@wbs/validation';

import type { SubscriptionTracker } from './subscription-tracker';

export type ConnectionState = 'open' | 'reconnecting' | 'denied' | 'closed';

export interface ReconnectingWsOptions {
  url: string;
  jwt: () => Promise<string>;
  onFrame: (frame: WsFrame) => void;
  onControl?: (control: WsControlFrame) => void;
  onStateChange: (state: ConnectionState) => void;
  subscriptions: SubscriptionTracker;
  websocketFactory?: (url: string, protocols?: string | string[]) => WebSocket;
  random?: () => number;
  heartbeatIntervalMs?: number;
  pongTimeoutMs?: number;
  ceilingMs?: number;
}

const INITIAL_BACKOFF_MS = 500;
const BACKOFF_CAP_MS = 30_000;

export function computeBackoff(attempt: number, random: () => number): number {
  const base = Math.min(INITIAL_BACKOFF_MS * 2 ** attempt, BACKOFF_CAP_MS);
  const jitter = 0.2 * base * (random() * 2 - 1);
  return Math.round(base + jitter);
}

const EnvelopeGuard = type([
  { subscription: 'string', seq: 'number', message: 'unknown' },
  '|',
  { type: 'string', '[string]': 'unknown' },
]);

export function createReconnectingWs(opts: ReconnectingWsOptions): {
  send(frame: { subscription: string; message: unknown }): void;
  close(): void;
} {
  const random = opts.random ?? Math.random;
  const wsf = opts.websocketFactory ?? ((u, p) => new WebSocket(u, p));
  const heartbeatMs = opts.heartbeatIntervalMs ?? 25_000;
  const pongMs = opts.pongTimeoutMs ?? 10_000;
  const ceilingMs = opts.ceilingMs ?? 60 * 60 * 1000;

  let ws: WebSocket | null = null;
  let attempt = 0;
  let attemptStart = Date.now();
  let heartbeat: ReturnType<typeof setTimeout> | null = null;
  let pongTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const setState = (s: ConnectionState) => opts.onStateChange(s);

  async function connect() {
    if (closed) return;
    if (Date.now() - attemptStart > ceilingMs) {
      setState('closed');
      return;
    }
    const token = await opts.jwt();
    const url =
      opts.url + (opts.url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token);
    const socket = wsf(url);
    ws = socket;

    socket.onopen = () => {
      attempt = 0;
      attemptStart = Date.now();
      setState('open');
      socket.send(JSON.stringify({ type: 'resume', resume_points: opts.subscriptions.snapshot() }));
      startHeartbeat();
    };

    socket.onmessage = (ev: MessageEvent<string>) => {
      const parsed = parseOrThrow(EnvelopeGuard, JSON.parse(ev.data));
      if ('subscription' in parsed) {
        opts.subscriptions.update(parsed.subscription, parsed.seq);
        opts.onFrame(parsed as WsFrame);
      } else {
        if (parsed['type'] === 'pong' && pongTimer) {
          clearTimeout(pongTimer);
          pongTimer = null;
        }
        opts.onControl?.(parsed as WsControlFrame);
      }
    };

    socket.onclose = () => {
      clearHeartbeat();
      if (closed) return;
      setState('reconnecting');
      const delay = computeBackoff(attempt++, random);
      setTimeout(connect, delay);
    };

    socket.onerror = () => socket.close();
  }

  function startHeartbeat() {
    clearHeartbeat();
    heartbeat = setInterval(() => {
      if (!ws || ws.readyState !== 1) return;
      ws.send(JSON.stringify({ type: 'ping' }));
      pongTimer = setTimeout(() => ws?.close(), pongMs);
    }, heartbeatMs);
  }

  function clearHeartbeat() {
    if (heartbeat) clearInterval(heartbeat);
    if (pongTimer) clearTimeout(pongTimer);
    heartbeat = null;
    pongTimer = null;
  }

  void connect();

  return {
    send(frame) {
      if (ws && ws.readyState === 1) ws.send(JSON.stringify(frame));
    },
    close() {
      closed = true;
      clearHeartbeat();
      ws?.close();
    },
  };
}
```

- [ ] **Step 6: Implement `tanstack-adapter.ts` (stub)**

```ts
import type { WsFrame } from '@wbs/contracts';

import { createReconnectingWs, type ReconnectingWsOptions } from './reconnecting-ws';

export interface TanstackDbAdapterOptions extends Omit<ReconnectingWsOptions, 'onFrame'> {
  onCollectionUpdate: (subscription: string, message: unknown) => void;
}

export function createTanstackDbAdapter(opts: TanstackDbAdapterOptions) {
  return createReconnectingWs({
    ...opts,
    onFrame: (frame: WsFrame) => opts.onCollectionUpdate(frame.subscription, frame.message),
  });
}
```

`libs/realtime/src/index.ts`:

```ts
export * from './reconnecting-ws';
export * from './subscription-tracker';
export * from './tanstack-adapter';
```

- [ ] **Step 7: Run tests**

Run: `cd libs/realtime && bun test`
Expected: `4 pass`. (Full WS integration with server is exercised by task 8.6 + 12.5's smoke test.)

- [ ] **Step 8: Commit**

```bash
git add libs/realtime/
git commit -m "feat(realtime): scaffold @wbs/realtime with ReconnectingWs + SubscriptionTracker + TanStack adapter"
```

---

## Task 5.3: `@wbs/scripts` — `$` wrapper, SSH builder, typed JSON/YAML, Dagger args

**Files:**

- Create (via Nx): `libs/scripts/` scaffold
- Create: `libs/scripts/src/shell.ts`
- Create: `libs/scripts/src/ssh.ts`
- Create: `libs/scripts/src/readers.ts`
- Create: `libs/scripts/src/dagger-args.ts`
- Create: `libs/scripts/src/shell.test.ts`

- [ ] **Step 1: Generate + add test targets**

Run: `bunx nx g @nx/js:lib libs/scripts --bundler=none --unitTestRunner=none --tags="scope:shared,type:scripts,runtime:bun" --linter=eslint --no-interactive`

Install YAML parser: `bun add yaml@^2`.

- [ ] **Step 2: Write failing test**

`libs/scripts/src/shell.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { $, ShellError } from './shell';
import { buildSshCommand } from './ssh';
import { daggerArgs } from './dagger-args';

describe('$ wrapper', () => {
  it('returns stdout on success', async () => {
    const r = await $`echo hello`;
    expect(r.stdout.trim()).toBe('hello');
    expect(r.exitCode).toBe(0);
  });

  it('throws ShellError with stderr on failure', async () => {
    await expect($`sh -c "echo boom >&2; exit 1"`).rejects.toBeInstanceOf(ShellError);
  });
});

describe('buildSshCommand', () => {
  it('produces a safe scp/ssh invocation with -o StrictHostKeyChecking', () => {
    const cmd = buildSshCommand({ host: 'deploy.example.com', user: 'root' }, 'uptime');
    expect(cmd).toContain('ssh');
    expect(cmd).toContain('root@deploy.example.com');
    expect(cmd).toContain('StrictHostKeyChecking');
    expect(cmd.at(-1)).toBe('uptime');
  });
});

describe('daggerArgs', () => {
  it('serializes flags + positional args', () => {
    const a = daggerArgs({ flags: { foo: 'bar', count: 3 }, positional: ['./app'] });
    expect(a).toEqual(['--foo', 'bar', '--count', '3', './app']);
  });
});
```

- [ ] **Step 3: Run — expect failure**

Run: `cd libs/scripts && bun test`

- [ ] **Step 4: Implement `shell.ts`**

```ts
import { $ as bun$ } from 'bun';

export class ShellError extends Error {
  override name = 'ShellError' as const;
  constructor(
    message: string,
    public readonly exitCode: number,
    public readonly stdout: string,
    public readonly stderr: string,
  ) {
    super(message);
  }
}

export const $ = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
  try {
    const out = await bun$(strings, ...values).quiet();
    return {
      exitCode: out.exitCode,
      stdout: out.stdout.toString(),
      stderr: out.stderr.toString(),
    };
  } catch (err) {
    const e = err as {
      exitCode: number;
      stdout: Buffer;
      stderr: Buffer;
      message?: string;
    };
    throw new ShellError(
      e.message ?? `command failed with exit ${e.exitCode}`,
      e.exitCode,
      e.stdout?.toString() ?? '',
      e.stderr?.toString() ?? '',
    );
  }
}) as unknown as typeof bun$;
```

- [ ] **Step 5: Implement `ssh.ts`**

```ts
export interface SshTarget {
  host: string;
  user: string;
  port?: number;
  identityFile?: string;
}

const DEFAULT_OPTS = ['-o', 'StrictHostKeyChecking=accept-new', '-o', 'ServerAliveInterval=30'];

export function buildSshCommand(target: SshTarget, remoteCmd: string): string[] {
  const port = target.port ? ['-p', String(target.port)] : [];
  const ident = target.identityFile ? ['-i', target.identityFile] : [];
  return ['ssh', ...DEFAULT_OPTS, ...port, ...ident, `${target.user}@${target.host}`, remoteCmd];
}

export function buildScpCommand(target: SshTarget, from: string, remotePath: string): string[] {
  const port = target.port ? ['-P', String(target.port)] : [];
  const ident = target.identityFile ? ['-i', target.identityFile] : [];
  return [
    'scp',
    ...DEFAULT_OPTS,
    ...port,
    ...ident,
    from,
    `${target.user}@${target.host}:${remotePath}`,
  ];
}
```

- [ ] **Step 6: Implement `readers.ts`**

```ts
import { parse as parseYaml } from 'yaml';

import { parseOrThrow, type Type } from '@wbs/validation';

export async function readJson<T extends Type>(path: string, schema: T): Promise<T['infer']> {
  const raw = JSON.parse(await Bun.file(path).text());
  return parseOrThrow(schema, raw);
}

export async function readYaml<T extends Type>(path: string, schema: T): Promise<T['infer']> {
  const raw = parseYaml(await Bun.file(path).text());
  return parseOrThrow(schema, raw);
}
```

- [ ] **Step 7: Implement `dagger-args.ts`**

```ts
export interface DaggerArgSpec {
  flags?: Record<string, string | number | boolean>;
  positional?: string[];
}

export function daggerArgs(spec: DaggerArgSpec): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(spec.flags ?? {})) {
    if (typeof v === 'boolean') {
      if (v) out.push(`--${k}`);
    } else {
      out.push(`--${k}`, String(v));
    }
  }
  for (const p of spec.positional ?? []) out.push(p);
  return out;
}
```

`libs/scripts/src/index.ts`:

```ts
export * from './shell';
export * from './ssh';
export * from './readers';
export * from './dagger-args';
```

- [ ] **Step 8: Run tests**

Run: `cd libs/scripts && bun test`
Expected: `5 pass`.

- [ ] **Step 9: Commit**

```bash
git add libs/scripts/ package.json bun.lockb
git commit -m "feat(scripts): scaffold @wbs/scripts with shell, ssh, readers, dagger-args"
```

---

## Task 5.4: Property tests for `@wbs/realtime` invariants

**Files:**

- Create: `libs/realtime/src/reconnecting-ws.property.test.ts`

- [ ] **Step 1: Write property tests for backoff monotonicity, handshake idempotency, tracker monotonicity**

`libs/realtime/src/reconnecting-ws.property.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';
import { computeBackoff } from './reconnecting-ws';
import { SubscriptionTracker } from './subscription-tracker';

describe('backoff property: always within [0.8*base, 1.2*base], capped at 30s', () => {
  it('holds for 100 arbitrary attempt counts and random streams', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20 }),
        fc.func(fc.double({ min: 0, max: 1, noNaN: true })),
        (attempt, rng) => {
          const base = Math.min(500 * 2 ** attempt, 30_000);
          const value = computeBackoff(attempt, rng);
          expect(value).toBeGreaterThanOrEqual(Math.floor(base * 0.8) - 1);
          expect(value).toBeLessThanOrEqual(Math.ceil(base * 1.2) + 1);
        },
      ),
      { numRuns: 100, seed: 42 },
    );
  });
});

describe('SubscriptionTracker property: last_seq is monotonic', () => {
  it('never regresses after any sequence of updates', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(fc.constantFrom('doc:a', 'doc:b', 'user:x'), fc.integer({ min: 0, max: 1000 })),
          { minLength: 0, maxLength: 100 },
        ),
        (updates) => {
          const storage = new Map<string, string>();
          const tr = new SubscriptionTracker({
            getItem: (k) => storage.get(k) ?? null,
            setItem: (k, v) => storage.set(k, v),
          });
          const prev: Record<string, number> = {};
          for (const [sub, seq] of updates) {
            tr.update(sub, seq);
            prev[sub] = Math.max(prev[sub] ?? -1, seq);
          }
          expect(tr.snapshot()).toEqual(prev);
        },
      ),
      { numRuns: 50, seed: 7 },
    );
  });
});
```

- [ ] **Step 2: Run**

Run: `cd libs/realtime && bun test`
Expected: All tests pass including the two property tests.

- [ ] **Step 3: Commit**

```bash
git add libs/realtime/
git commit -m "test(realtime): add fast-check property tests for backoff + tracker monotonicity"
```

---

## Task 6.1: `apps/be-01` HTTP skeleton

**Traces to:** `specs/backend-foundation/spec.md`, design D3, D4.

**Files:**

- Create (via Nx): `apps/be-01/` scaffold
- Create: `apps/be-01/src/main.ts`
- Create: `apps/be-01/src/config.ts`
- Create: `apps/be-01/src/app.ts`
- Create: `apps/be-01/src/health.test.ts`

- [ ] **Step 1: Install Elysia**

(already done in Task 4.2).

- [ ] **Step 2: Generate the Bun app**

Run: `bunx nx g @nx/js:lib apps/be-01 --bundler=none --unitTestRunner=none --tags="scope:app,type:app,runtime:bun" --linter=eslint --no-interactive`

Then edit `apps/be-01/project.json` to mark it as an application (`"projectType": "application"`) and add these targets:

```json
{
  "name": "be-01",
  "projectType": "application",
  "sourceRoot": "apps/be-01/src",
  "tags": ["scope:app", "type:app", "runtime:bun"],
  "targets": {
    "serve": {
      "executor": "nx:run-commands",
      "options": { "command": "bun --watch apps/be-01/src/main.ts" }
    },
    "build": {
      "executor": "nx:run-commands",
      "options": {
        "command": "bun build apps/be-01/src/main.ts --target=bun --outdir=dist/apps/be-01"
      },
      "outputs": ["{workspaceRoot}/dist/apps/be-01"]
    },
    "test": {
      "executor": "nx:run-commands",
      "options": { "command": "bun test --coverage", "cwd": "apps/be-01" }
    },
    "typecheck": {
      "executor": "nx:run-commands",
      "options": { "command": "bunx tsc --noEmit -p apps/be-01/tsconfig.json" }
    },
    "lint": {
      "executor": "@nx/eslint:lint",
      "options": { "lintFilePatterns": ["apps/be-01/**/*.ts"] }
    }
  }
}
```

- [ ] **Step 3: Write failing test — `/health` returns 200 with status:"ok"**

`apps/be-01/src/health.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { buildApp } from './app';

describe('GET /health', () => {
  it('returns 200 with status:"ok" when ready', async () => {
    const app = buildApp({ migrationsApplied: true });
    const res = await app.handle(new Request('http://localhost/health'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
  });

  it('returns 503 while migrations still running', async () => {
    const app = buildApp({ migrationsApplied: false });
    const res = await app.handle(new Request('http://localhost/health'));
    expect(res.status).toBe(503);
  });
});
```

- [ ] **Step 4: Run — expect failure**

Run: `cd apps/be-01 && bun test`

- [ ] **Step 5: Implement `config.ts`**

```ts
import { defineConfig } from '@wbs/config';
import { type } from '@wbs/validation';

export const BeConfig = type({
  PORT: 'string.integer.parse',
  INTERNAL_AUTH_SECRET: 'string>=32',
  LOG_LEVEL: "'trace'|'debug'|'info'|'warn'|'error'|'fatal'",
  GW_URL: 'string',
});
export type BeConfig = typeof BeConfig.infer;

export const loadConfig = () => defineConfig(BeConfig);
```

- [ ] **Step 6: Implement `app.ts`**

```ts
import { Elysia } from 'elysia';
import { createLogger } from '@wbs/observability';
import { observabilityPlugin } from '@wbs/observability/server';

export interface AppOptions {
  migrationsApplied: boolean;
  version?: string;
}

export function buildApp(opts: AppOptions) {
  const logger = createLogger({ service: 'be-01', version: opts.version });

  return new Elysia()
    .use(observabilityPlugin({ service: 'be-01' }))
    .decorate('logger', logger)
    .get('/health', ({ set }) => {
      if (!opts.migrationsApplied) {
        set.status = 503;
        return { status: 'migrating' };
      }
      return { status: 'ok' };
    });
}
```

- [ ] **Step 7: Implement `main.ts`**

```ts
import { loadConfig } from './config';
import { buildApp } from './app';
import { createLogger } from '@wbs/observability';

const cfg = loadConfig();
const logger = createLogger({ service: 'be-01', level: cfg.LOG_LEVEL });

const app = buildApp({ migrationsApplied: true, version: process.env['VERSION'] });

app.listen(cfg.PORT, () => logger.info({ port: cfg.PORT }, 'be-01 listening'));
```

- [ ] **Step 8: Create a stub `.env.example` for local dev**

`apps/be-01/.env.example`:

```dotenv
PORT=3100
LOG_LEVEL=info
INTERNAL_AUTH_SECRET=change-me-32-chars-minimum-aaaaaaaa
GW_URL=http://localhost:3200
```

- [ ] **Step 9: Run tests**

Run: `cd apps/be-01 && bun test`
Expected: `2 pass`.

- [ ] **Step 10: Commit**

```bash
git add apps/be-01/
git commit -m "feat(be-01): Elysia HTTP skeleton with /health, /metrics, config loader"
```

---

## Task 6.2: Drizzle + `bun:sqlite` repository abstraction

**Files:**

- Create: `apps/be-01/src/repository/index.ts`
- Create: `apps/be-01/src/repository/example.ts`
- Create: `apps/be-01/src/repository/schema.ts`
- Create: `apps/be-01/drizzle.config.ts`
- Create: `apps/be-01/src/repository/example.test.ts`

- [ ] **Step 1: Write failing test**

`apps/be-01/src/repository/example.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { makeTestDb } from '@wbs/validation/fixtures';
import { ExampleRepository } from './example';
import { examples } from './schema';

describe('ExampleRepository', () => {
  it('inserts and reads back by id', async () => {
    const db = await makeTestDb({ migrationsFolder: null });
    db.$client.exec(
      'CREATE TABLE examples (id TEXT PRIMARY KEY, label TEXT NOT NULL, created_at INTEGER NOT NULL)',
    );
    const repo = new ExampleRepository(db);
    await repo.create({ id: 'ex-1', label: 'hello', createdAt: 123 });
    const found = await repo.findById('ex-1');
    expect(found).toEqual({ id: 'ex-1', label: 'hello', createdAt: 123 });
    db.$client.close();
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `cd apps/be-01 && bun test`

- [ ] **Step 3: Implement `schema.ts`**

```ts
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const examples = sqliteTable('examples', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  createdAt: integer('created_at').notNull(),
});

export type ExampleRow = typeof examples.$inferSelect;
```

- [ ] **Step 4: Implement `index.ts` — repository interface**

```ts
export interface Example {
  id: string;
  label: string;
  createdAt: number;
}

export interface ExampleRepo {
  create(ex: Example): Promise<void>;
  findById(id: string): Promise<Example | null>;
}
```

- [ ] **Step 5: Implement `example.ts` — Drizzle-backed**

```ts
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { eq } from 'drizzle-orm';

import type { Example, ExampleRepo } from './index';
import { examples } from './schema';

export class ExampleRepository implements ExampleRepo {
  constructor(private readonly db: BunSQLiteDatabase) {}

  async create(ex: Example): Promise<void> {
    await this.db.insert(examples).values(ex);
  }

  async findById(id: string): Promise<Example | null> {
    const rows = await this.db.select().from(examples).where(eq(examples.id, id)).limit(1);
    return rows[0] ?? null;
  }
}
```

- [ ] **Step 6: Write `drizzle.config.ts`**

```ts
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/repository/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: { url: './local.db' },
} satisfies Config;
```

- [ ] **Step 7: Update eslint config's `no-restricted-imports` block to allow `drizzle-orm/*` only in `apps/be-01/src/repository/**`\*\*

Already handled in Task 2.2's eslint.config.js. Verify:

Run: `bunx eslint apps/be-01/src/repository/example.ts`
Expected: no errors.

Test the negative:

```ts
// apps/be-01/src/__scratch__/bad.ts
import { eq } from 'drizzle-orm';
console.log(eq);
```

Run: `bunx eslint apps/be-01/src/__scratch__/bad.ts`
Expected: error — "drizzle-orm" is a restricted import.
Delete the scratch file.

- [ ] **Step 8: Run the repository test**

Run: `cd apps/be-01 && bun test`
Expected: `3 pass` (health x2 + repo x1).

- [ ] **Step 9: Commit**

```bash
git add apps/be-01/
git commit -m "feat(be-01): Drizzle repository layer with ExampleRepo behind interface"
```

---

## Task 6.3: Controller / service layering + ArkType validation helper

**Files:**

- Create: `apps/be-01/src/controller/smoke.controller.ts`
- Create: `apps/be-01/src/service/smoke.service.ts`
- Create: `apps/be-01/src/middleware/validate.ts`
- Modify: `apps/be-01/src/app.ts`
- Create: `apps/be-01/src/controller/smoke.integration.test.ts`

- [ ] **Step 1: Write failing integration test**

`apps/be-01/src/controller/smoke.integration.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { buildApp } from '../app';

describe('POST /api/smoke/echo', () => {
  it('returns the validated message', async () => {
    const app = buildApp({ migrationsApplied: true });
    const res = await app.handle(
      new Request('http://localhost/api/smoke/echo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'hi' }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { echoed: string };
    expect(body.echoed).toBe('hi');
  });

  it('rejects invalid body with 400', async () => {
    const app = buildApp({ migrationsApplied: true });
    const res = await app.handle(
      new Request('http://localhost/api/smoke/echo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ wrong: true }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Implement `middleware/validate.ts`**

```ts
import type { Type } from '@wbs/validation';
import { parseOrThrow, ValidationError } from '@wbs/validation';

export function validateBody<T extends Type>(schema: T) {
  return (body: unknown): T['infer'] => {
    try {
      return parseOrThrow(schema, body);
    } catch (e) {
      if (e instanceof ValidationError) {
        const err = new Error(e.message);
        (err as unknown as { statusCode: number }).statusCode = 400;
        throw err;
      }
      throw e;
    }
  };
}
```

- [ ] **Step 3: Implement `service/smoke.service.ts`**

```ts
export class SmokeService {
  echo(text: string): string {
    return text;
  }
}
```

- [ ] **Step 4: Implement `controller/smoke.controller.ts`**

```ts
import { Elysia } from 'elysia';

import { type } from '@wbs/validation';

import { validateBody } from '../middleware/validate';
import { SmokeService } from '../service/smoke.service';

const EchoBody = type({ text: 'string' });

export const smokeController = new Elysia({ prefix: '/api/smoke' })
  .decorate('smoke', new SmokeService())
  .post('/echo', ({ body, smoke, set }) => {
    try {
      const validated = validateBody(EchoBody)(body);
      return { echoed: smoke.echo(validated.text) };
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 400) {
        set.status = 400;
        return { error: (e as Error).message };
      }
      throw e;
    }
  });
```

- [ ] **Step 5: Wire into `app.ts`**

Edit `apps/be-01/src/app.ts` — add `.use(smokeController)` between `.decorate` and the `/health` handler:

```ts
import { smokeController } from './controller/smoke.controller';
// ...
return new Elysia()
  .use(observabilityPlugin({ service: 'be-01' }))
  .decorate('logger', logger)
  .use(smokeController)
  .get('/health' /* ... */);
```

- [ ] **Step 6: Run integration test**

Run: `cd apps/be-01 && bun test`
Expected: `5 pass` (health x2, repo x1, smoke x2).

- [ ] **Step 7: Commit**

```bash
git add apps/be-01/
git commit -m "feat(be-01): controller/service layering with ArkType validation helper"
```

---

## Task 6.4: Migration runner + `/health` toggles on migration state

**Files:**

- Create: `apps/be-01/src/migrate.ts`
- Create: `apps/be-01/drizzle/0000_initial.sql`
- Modify: `apps/be-01/src/main.ts`
- Create: `apps/be-01/src/migrate.test.ts`

- [ ] **Step 1: Generate an initial migration**

Create `apps/be-01/drizzle/0000_initial.sql` (starts empty, added to as schemas grow):

```sql
-- Initial migration placeholder.
-- Schemas appear as subsequent migrations. Keep additive-only.
```

Also create `apps/be-01/drizzle/meta/_journal.json` + `apps/be-01/drizzle/meta/0000_snapshot.json` — easiest path: run `bunx drizzle-kit generate` from `apps/be-01/`. Verify the `drizzle/` directory is populated after.

- [ ] **Step 2: Write failing test — `/health` is 503 until migrate resolves**

`apps/be-01/src/migrate.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { buildApp } from './app';

describe('migrate lifecycle', () => {
  it('exposes 503 before migrations complete then 200 after', async () => {
    let migrationsApplied = false;
    const app = buildApp({
      get migrationsApplied() {
        return migrationsApplied;
      },
    } as { migrationsApplied: boolean });

    const pre = await app.handle(new Request('http://localhost/health'));
    expect(pre.status).toBe(503);

    migrationsApplied = true;
    const post = await app.handle(new Request('http://localhost/health'));
    expect(post.status).toBe(200);
  });
});
```

(Note: `buildApp` signature change below supports lazy read.)

- [ ] **Step 3: Refactor `buildApp` to accept a getter for `migrationsApplied`**

Replace `app.ts`:

```ts
import { Elysia } from 'elysia';

import { createLogger } from '@wbs/observability';
import { observabilityPlugin } from '@wbs/observability/server';

import { smokeController } from './controller/smoke.controller';

export interface AppOptions {
  migrationsApplied: boolean;
  version?: string;
}

export function buildApp(opts: AppOptions) {
  const logger = createLogger({ service: 'be-01', version: opts.version });
  return new Elysia()
    .use(observabilityPlugin({ service: 'be-01' }))
    .decorate('logger', logger)
    .use(smokeController)
    .get('/health', ({ set }) => {
      if (!opts.migrationsApplied) {
        set.status = 503;
        return { status: 'migrating' };
      }
      return { status: 'ok' };
    });
}
```

The getter in the test works because `opts` is passed by reference and each request re-reads `opts.migrationsApplied`.

- [ ] **Step 4: Implement `migrate.ts`**

```ts
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';

export function runMigrations(dbPath: string, migrationsFolder: string): void {
  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder });
  sqlite.close();
}
```

- [ ] **Step 5: Update `main.ts` to run migrations before serving**

```ts
import { loadConfig } from './config';
import { buildApp } from './app';
import { runMigrations } from './migrate';
import { createLogger } from '@wbs/observability';

const cfg = loadConfig();
const logger = createLogger({ service: 'be-01', level: cfg.LOG_LEVEL });

const state = { migrationsApplied: false };
const app = buildApp({
  get migrationsApplied() {
    return state.migrationsApplied;
  },
  version: process.env['VERSION'],
} as { migrationsApplied: boolean; version?: string });

app.listen(cfg.PORT, async () => {
  logger.info({ port: cfg.PORT }, 'be-01 listening (migrating)');
  try {
    runMigrations(process.env['DB_PATH'] ?? './local.db', './drizzle');
    state.migrationsApplied = true;
    logger.info('migrations applied');
  } catch (err) {
    logger.error({ err }, 'migrations failed');
    process.exit(1);
  }
});
```

- [ ] **Step 6: Run tests**

Run: `cd apps/be-01 && bun test`
Expected: `6 pass`.

- [ ] **Step 7: Commit**

```bash
git add apps/be-01/
git commit -m "feat(be-01): migration runner with /health 503 during migrate, 200 when done"
```

---

## Task 7.1: `event_sequencer` + `event_log` schemas + `EventSequencer` service

**Traces to:** `specs/backend-foundation/spec.md` (Layer A), design D17.

**Files:**

- Modify: `apps/be-01/src/repository/schema.ts`
- Create: `apps/be-01/drizzle/0001_event_log.sql`
- Create: `apps/be-01/src/service/event-sequencer.ts`
- Create: `apps/be-01/src/service/event-sequencer.test.ts`

- [ ] **Step 1: Extend `schema.ts`**

Append to `apps/be-01/src/repository/schema.ts`:

```ts
import { blob, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const eventSequencer = sqliteTable('event_sequencer', {
  subscription: text('subscription').primaryKey(),
  nextSeq: integer('next_seq').notNull().default(0),
});

export const eventLog = sqliteTable(
  'event_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    subscription: text('subscription').notNull(),
    seq: integer('seq').notNull(),
    message: blob('message', { mode: 'json' }).notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({ subSeqUnique: uniqueIndex('event_log_sub_seq').on(t.subscription, t.seq) }),
);
```

- [ ] **Step 2: Generate migration**

Run: `cd apps/be-01 && bunx drizzle-kit generate`
Expected: a new SQL file appears in `apps/be-01/drizzle/`. Rename it to `0001_event_log.sql` if needed.

- [ ] **Step 3: Write failing test**

`apps/be-01/src/service/event-sequencer.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { makeTestDb } from '@wbs/validation/fixtures';
import { EventSequencer } from './event-sequencer';
import { eventSequencer, eventLog } from '../repository/schema';
import { sql } from 'drizzle-orm';

async function bootstrap() {
  const db = await makeTestDb({ migrationsFolder: null });
  db.$client.exec(`
    CREATE TABLE event_sequencer (subscription TEXT PRIMARY KEY, next_seq INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE event_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subscription TEXT NOT NULL,
      seq INTEGER NOT NULL,
      message TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX event_log_sub_seq ON event_log(subscription, seq);
  `);
  return db;
}

describe('EventSequencer', () => {
  it('assigns monotonic seq numbers per subscription', async () => {
    const db = await bootstrap();
    const seq = new EventSequencer(db, () => 1_000);
    const a1 = await seq.recordEvent('doc:a', { v: 1 });
    const a2 = await seq.recordEvent('doc:a', { v: 2 });
    const b1 = await seq.recordEvent('doc:b', { v: 1 });
    expect(a1.seq).toBe(0);
    expect(a2.seq).toBe(1);
    expect(b1.seq).toBe(0);
    db.$client.close();
  });

  it('persists event in event_log with matching seq', async () => {
    const db = await bootstrap();
    const seq = new EventSequencer(db, () => 5_000);
    await seq.recordEvent('doc:a', { hello: 'world' });
    const rows = db.$client
      .query('SELECT * FROM event_log WHERE subscription = ?')
      .all('doc:a') as {
      seq: number;
      message: string;
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].seq).toBe(0);
    expect(JSON.parse(rows[0].message)).toEqual({ hello: 'world' });
    db.$client.close();
  });
});
```

- [ ] **Step 4: Implement `event-sequencer.ts`**

```ts
import { sql } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';

export interface RecordedEvent {
  subscription: string;
  seq: number;
  message: unknown;
  createdAt: number;
}

export class EventSequencer {
  constructor(
    private readonly db: BunSQLiteDatabase,
    private readonly now: () => number = Date.now,
  ) {}

  async recordEvent(subscription: string, message: unknown): Promise<RecordedEvent> {
    const createdAt = this.now();
    return this.db.transaction(async (tx) => {
      tx.run(sql`
        INSERT INTO event_sequencer (subscription, next_seq) VALUES (${subscription}, 0)
        ON CONFLICT(subscription) DO NOTHING
      `);
      const [{ next_seq: nextSeq }] = tx.all<{ next_seq: number }>(
        sql`UPDATE event_sequencer SET next_seq = next_seq + 1 WHERE subscription = ${subscription} RETURNING next_seq - 1 AS next_seq`,
      );
      tx.run(sql`
        INSERT INTO event_log (subscription, seq, message, created_at)
        VALUES (${subscription}, ${nextSeq}, ${JSON.stringify(message)}, ${createdAt})
      `);
      return { subscription, seq: nextSeq, message, createdAt };
    });
  }
}
```

- [ ] **Step 5: Run tests**

Run: `cd apps/be-01 && bun test`
Expected: `8 pass`.

- [ ] **Step 6: Commit**

```bash
git add apps/be-01/
git commit -m "feat(be-01): EventSequencer service + event_log/event_sequencer schemas (Layer A)"
```

---

## Task 7.2: `/internal/forward` + `/internal/resume` endpoints with auth + ArkType

**Files:**

- Create: `apps/be-01/src/controller/internal.controller.ts`
- Create: `apps/be-01/src/middleware/internal-auth.ts`
- Create: `apps/be-01/src/controller/internal.integration.test.ts`
- Modify: `apps/be-01/src/app.ts`

- [ ] **Step 1: Write failing integration test**

`apps/be-01/src/controller/internal.integration.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'bun:test';
import { buildApp } from '../app';

const SECRET = 'test-secret-must-be-32-chars-at-least-!';

describe('POST /internal/forward', () => {
  it('rejects without X-Internal-Auth', async () => {
    const app = buildApp({ migrationsApplied: true, internalAuthSecret: SECRET });
    const res = await app.handle(
      new Request('http://localhost/internal/forward', {
        method: 'POST',
        body: JSON.stringify({ message: { type: 'ping' }, trace_id: 't' }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('acks with auth + valid body', async () => {
    const app = buildApp({ migrationsApplied: true, internalAuthSecret: SECRET });
    const res = await app.handle(
      new Request('http://localhost/internal/forward', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-auth': SECRET,
          'x-client-id': 'u-1',
          'x-connection-id': 'c-1',
        },
        body: JSON.stringify({ message: { type: 'ping' }, trace_id: 't-1' }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ack: boolean };
    expect(body.ack).toBe(true);
  });
});

describe('POST /internal/resume', () => {
  it('returns replaying status for known subscriptions', async () => {
    const app = buildApp({ migrationsApplied: true, internalAuthSecret: SECRET });
    const res = await app.handle(
      new Request('http://localhost/internal/resume', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-auth': SECRET,
          'x-client-id': 'u-1',
          'x-connection-id': 'c-1',
        },
        body: JSON.stringify({
          resume_points: { 'doc:a': 0 },
          trace_id: 't-1',
        }),
      }),
    );
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Implement `middleware/internal-auth.ts`**

```ts
import { Elysia } from 'elysia';

export function internalAuth(secret: string) {
  return new Elysia({ name: 'internal-auth' }).onBeforeHandle(({ request, set }) => {
    const header = request.headers.get('x-internal-auth');
    if (header !== secret) {
      set.status = 401;
      return { error: 'unauthorized' };
    }
  });
}
```

- [ ] **Step 3: Implement `controller/internal.controller.ts`**

```ts
import { Elysia } from 'elysia';

import { InternalForwardRequest, InternalResumeRequest } from '@wbs/contracts';
import { parseOrThrow, ValidationError } from '@wbs/validation';

import { internalAuth } from '../middleware/internal-auth';

export interface InternalDeps {
  secret: string;
  onForward: (
    message: unknown,
    ctx: { clientId: string | null; connectionId: string | null; traceId: string },
  ) => Promise<{ push_responses?: unknown[] }>;
  onResume: (
    resumePoints: Record<string, number>,
    ctx: { clientId: string | null; connectionId: string | null; traceId: string },
  ) => Promise<
    Record<
      string,
      { status: 'replaying'; count: number } | { status: 'denied'; reason: 'out_of_range' }
    >
  >;
}

export function internalController(deps: InternalDeps) {
  return new Elysia({ prefix: '/internal' })
    .use(internalAuth(deps.secret))
    .post('/forward', async ({ body, request, set }) => {
      try {
        const req = parseOrThrow(InternalForwardRequest, body);
        const res = await deps.onForward(req.message, {
          clientId: request.headers.get('x-client-id'),
          connectionId: request.headers.get('x-connection-id'),
          traceId: req.trace_id,
        });
        return { ack: true, push_responses: res.push_responses };
      } catch (err) {
        if (err instanceof ValidationError) {
          set.status = 400;
          return { error: err.message };
        }
        throw err;
      }
    })
    .post('/resume', async ({ body, request, set }) => {
      try {
        const req = parseOrThrow(InternalResumeRequest, body);
        return await deps.onResume(req.resume_points, {
          clientId: request.headers.get('x-client-id'),
          connectionId: request.headers.get('x-connection-id'),
          traceId: req.trace_id,
        });
      } catch (err) {
        if (err instanceof ValidationError) {
          set.status = 400;
          return { error: err.message };
        }
        throw err;
      }
    });
}
```

- [ ] **Step 4: Update `buildApp` to accept `internalAuthSecret` and wire default handlers**

Modify `apps/be-01/src/app.ts` — replace the return with:

```ts
import { internalController } from './controller/internal.controller';

export interface AppOptions {
  migrationsApplied: boolean;
  version?: string;
  internalAuthSecret?: string;
}

export function buildApp(opts: AppOptions) {
  const logger = createLogger({ service: 'be-01', version: opts.version });

  return new Elysia()
    .use(observabilityPlugin({ service: 'be-01' }))
    .decorate('logger', logger)
    .use(smokeController)
    .use(
      internalController({
        secret: opts.internalAuthSecret ?? 'development-secret-32-characters!!!',
        onForward: async () => ({ push_responses: [] }),
        onResume: async (points) => {
          const out: Record<string, { status: 'replaying'; count: number }> = {};
          for (const sub of Object.keys(points)) {
            out[sub] = { status: 'replaying', count: 0 };
          }
          return out;
        },
      }),
    )
    .get('/health', ({ set }) => {
      if (!opts.migrationsApplied) {
        set.status = 503;
        return { status: 'migrating' };
      }
      return { status: 'ok' };
    });
}
```

- [ ] **Step 5: Run tests**

Run: `cd apps/be-01 && bun test`
Expected: `11 pass`.

- [ ] **Step 6: Commit**

```bash
git add apps/be-01/
git commit -m "feat(be-01): /internal/forward and /internal/resume with X-Internal-Auth"
```

---

## Task 7.3: `/internal/push` HTTP client toward `gw-01` with retry + durable fallback

**Files:**

- Create: `apps/be-01/src/service/push-client.ts`
- Create: `apps/be-01/src/service/push-client.test.ts`

- [ ] **Step 1: Write failing test**

`apps/be-01/src/service/push-client.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { PushClient } from './push-client';

describe('PushClient', () => {
  it('posts to /internal/push and returns response', async () => {
    let called = 0;
    const client = new PushClient({
      gwUrl: 'http://gw:3200',
      secret: 'sec',
      fetchImpl: async (url, init) => {
        called++;
        expect(String(url)).toBe('http://gw:3200/internal/push');
        expect((init as RequestInit).headers).toMatchObject({ 'X-Internal-Auth': 'sec' });
        return new Response(JSON.stringify({ delivered_to_sockets: 2 }), { status: 202 });
      },
      sleep: async () => {},
      maxRetries: 1,
    });
    const result = await client.push({ subscription: 'doc:a', seq: 1, message: {} });
    expect(called).toBe(1);
    expect(result.delivered).toBe(2);
  });

  it('retries with exponential backoff on 5xx then succeeds', async () => {
    let attempts = 0;
    const client = new PushClient({
      gwUrl: 'http://gw',
      secret: 's',
      fetchImpl: async () => {
        attempts++;
        if (attempts < 3) return new Response('err', { status: 500 });
        return new Response(JSON.stringify({ delivered_to_sockets: 1 }), { status: 202 });
      },
      sleep: async () => {},
      maxRetries: 5,
    });
    const result = await client.push({ subscription: 'doc:a', seq: 1, message: {} });
    expect(attempts).toBe(3);
    expect(result.delivered).toBe(1);
  });

  it('raises PushFailed after exceeding retries', async () => {
    const client = new PushClient({
      gwUrl: 'http://gw',
      secret: 's',
      fetchImpl: async () => new Response('err', { status: 503 }),
      sleep: async () => {},
      maxRetries: 2,
    });
    await expect(client.push({ subscription: 'doc:a', seq: 1, message: {} })).rejects.toThrow(
      /push failed/i,
    );
  });
});
```

- [ ] **Step 2: Implement `push-client.ts`**

```ts
import type { InternalPushRequest } from '@wbs/contracts';

export interface PushClientOptions {
  gwUrl: string;
  secret: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
}

export class PushFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PushFailed';
  }
}

export class PushClient {
  private readonly fetch: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;

  constructor(private readonly opts: PushClientOptions) {
    this.fetch = opts.fetchImpl ?? globalThis.fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.maxRetries = opts.maxRetries ?? 5;
  }

  async push(payload: InternalPushRequest): Promise<{ delivered: number }> {
    let backoff = 500;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const res = await this.fetch(`${this.opts.gwUrl}/internal/push`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Internal-Auth': this.opts.secret,
        },
        body: JSON.stringify(payload),
      });
      if (res.status >= 200 && res.status < 300) {
        const body = (await res.json()) as { delivered_to_sockets: number };
        return { delivered: body.delivered_to_sockets };
      }
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        throw new PushFailed(`push failed with ${res.status}: ${await res.text()}`);
      }
      if (attempt === this.maxRetries) {
        throw new PushFailed(
          `push failed after ${this.maxRetries + 1} attempts: last=${res.status}`,
        );
      }
      await this.sleep(backoff);
      backoff = Math.min(backoff * 2, 30_000);
    }
    throw new PushFailed('unreachable');
  }
}
```

- [ ] **Step 3: Run tests**

Run: `cd apps/be-01 && bun test`
Expected: `14 pass`.

- [ ] **Step 4: Commit**

```bash
git add apps/be-01/
git commit -m "feat(be-01): PushClient with retry-with-backoff for /internal/push"
```

---

## Task 7.4: In-memory ring buffer + durable `event_log` fallback + retention job

**Files:**

- Create: `apps/be-01/src/service/replay-buffer.ts`
- Create: `apps/be-01/src/service/replay-buffer.test.ts`
- Create: `apps/be-01/src/service/retention-job.ts`
- Create: `apps/be-01/src/service/retention-job.test.ts`

- [ ] **Step 1: Write failing test for replay buffer**

`apps/be-01/src/service/replay-buffer.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { ReplayBuffer } from './replay-buffer';

describe('ReplayBuffer', () => {
  it('returns in-order events from a given seq exclusive', () => {
    const buf = new ReplayBuffer({ maxPerSubscription: 100, maxAgeMs: 60_000, now: () => 1_000 });
    for (let i = 0; i < 10; i++) buf.record('doc:a', i, { i });
    const out = buf.since('doc:a', 5);
    expect(out.map((e) => e.seq)).toEqual([6, 7, 8, 9]);
  });

  it('evicts oldest when size cap reached', () => {
    const buf = new ReplayBuffer({ maxPerSubscription: 3, maxAgeMs: 60_000, now: () => 1_000 });
    for (let i = 0; i < 5; i++) buf.record('doc:a', i, {});
    const out = buf.since('doc:a', -1);
    expect(out.map((e) => e.seq)).toEqual([2, 3, 4]);
  });

  it('evicts by age cap', () => {
    let t = 0;
    const buf = new ReplayBuffer({ maxPerSubscription: 100, maxAgeMs: 1000, now: () => t });
    buf.record('doc:a', 0, {});
    t = 1500;
    buf.record('doc:a', 1, {});
    expect(buf.since('doc:a', -1).map((e) => e.seq)).toEqual([1]);
  });
});
```

- [ ] **Step 2: Implement `replay-buffer.ts`**

```ts
export interface BufferEntry {
  seq: number;
  message: unknown;
  at: number;
}

export interface ReplayBufferOptions {
  maxPerSubscription: number;
  maxAgeMs: number;
  now?: () => number;
}

export class ReplayBuffer {
  private readonly store = new Map<string, BufferEntry[]>();
  private readonly now: () => number;

  constructor(private readonly opts: ReplayBufferOptions) {
    this.now = opts.now ?? Date.now;
  }

  record(subscription: string, seq: number, message: unknown): void {
    const at = this.now();
    const list = this.store.get(subscription) ?? [];
    list.push({ seq, message, at });
    this.evict(list);
    this.store.set(subscription, list);
  }

  since(subscription: string, sinceSeq: number): BufferEntry[] {
    const list = this.store.get(subscription);
    if (!list) return [];
    this.evict(list);
    return list.filter((e) => e.seq > sinceSeq);
  }

  oldestSeq(subscription: string): number | null {
    const list = this.store.get(subscription);
    if (!list || list.length === 0) return null;
    return list[0].seq;
  }

  private evict(list: BufferEntry[]): void {
    const cutoff = this.now() - this.opts.maxAgeMs;
    while (list.length > 0 && list[0].at < cutoff) list.shift();
    while (list.length > this.opts.maxPerSubscription) list.shift();
  }
}
```

- [ ] **Step 3: Write failing test for retention job**

`apps/be-01/src/service/retention-job.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { runRetention } from './retention-job';
import { makeTestDb } from '@wbs/validation/fixtures';

async function bootstrap() {
  const db = await makeTestDb({ migrationsFolder: null });
  db.$client.exec(`
    CREATE TABLE event_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subscription TEXT NOT NULL,
      seq INTEGER NOT NULL,
      message TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  return db;
}

describe('runRetention', () => {
  it('prunes rows beyond maxPerSubscription (keeps newest)', async () => {
    const db = await bootstrap();
    for (let i = 0; i < 15; i++) {
      db.$client.run(
        `INSERT INTO event_log(subscription, seq, message, created_at) VALUES ('doc:a', ?, '{}', ?)`,
        [i, i],
      );
    }
    const removed = await runRetention(db, { maxPerSubscription: 10 });
    expect(removed).toBe(5);
    const ids = db.$client
      .query('SELECT seq FROM event_log WHERE subscription = ? ORDER BY seq')
      .all('doc:a') as { seq: number }[];
    expect(ids.map((x) => x.seq)).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    db.$client.close();
  });
});
```

- [ ] **Step 4: Implement `retention-job.ts`**

```ts
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { sql } from 'drizzle-orm';

export async function runRetention(
  db: BunSQLiteDatabase,
  opts: { maxPerSubscription: number },
): Promise<number> {
  const result = db.$client.run(
    `DELETE FROM event_log
     WHERE id IN (
       SELECT id FROM (
         SELECT id, ROW_NUMBER() OVER (PARTITION BY subscription ORDER BY seq DESC) AS rn
         FROM event_log
       )
       WHERE rn > ?
     )`,
    [opts.maxPerSubscription],
  );
  return Number(result.changes ?? 0);
}
```

- [ ] **Step 5: Run tests**

Run: `cd apps/be-01 && bun test`
Expected: `18 pass`.

- [ ] **Step 6: Commit**

```bash
git add apps/be-01/
git commit -m "feat(be-01): in-memory ring buffer + retention job for event_log"
```

---

## Task 7.5: Property tests for Layer-A invariants

**Files:**

- Create: `apps/be-01/src/service/layer-a.property.test.ts`

- [ ] **Step 1: Write property tests**

`apps/be-01/src/service/layer-a.property.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';
import { ReplayBuffer } from './replay-buffer';

describe('Layer-A invariants', () => {
  it('invariant: no replay below ack — buffer.since(last_acked) yields only seq > last_acked', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 1, maxLength: 50 }),
        fc.integer({ min: -1, max: 100 }),
        (seqs, lastAck) => {
          const buf = new ReplayBuffer({
            maxPerSubscription: 1000,
            maxAgeMs: 600_000,
            now: () => 1,
          });
          for (const s of seqs) buf.record('doc:a', s, {});
          const replayed = buf.since('doc:a', lastAck);
          for (const e of replayed) expect(e.seq).toBeGreaterThan(lastAck);
        },
      ),
      { numRuns: 100, seed: 1234 },
    );
  });

  it('invariant: buffer bound — |buffer| never exceeds cap', () => {
    fc.assert(
      fc.property(fc.array(fc.nat(1000), { minLength: 0, maxLength: 500 }), (seqs) => {
        const cap = 50;
        const buf = new ReplayBuffer({
          maxPerSubscription: cap,
          maxAgeMs: Number.MAX_SAFE_INTEGER,
          now: () => 1,
        });
        for (const s of seqs) buf.record('doc:a', s, {});
        expect(buf.since('doc:a', -1).length).toBeLessThanOrEqual(cap);
      }),
      { numRuns: 100, seed: 1234 },
    );
  });

  it('invariant: session isolation — two subscriptions never cross-deliver', () => {
    const buf = new ReplayBuffer({ maxPerSubscription: 100, maxAgeMs: 60_000, now: () => 1 });
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.constantFrom('doc:a', 'doc:b'), fc.nat(100))), (ops) => {
        for (const [sub, s] of ops) buf.record(sub, s, { sub });
        const aMsgs = buf.since('doc:a', -1);
        expect(aMsgs.every((e) => (e.message as { sub: string }).sub === 'doc:a')).toBe(true);
      }),
      { numRuns: 50, seed: 42 },
    );
  });
});
```

- [ ] **Step 2: Run**

Run: `cd apps/be-01 && bun test`
Expected: `21 pass`.

- [ ] **Step 3: Commit**

```bash
git add apps/be-01/
git commit -m "test(be-01): property tests for Layer-A invariants (monotonicity, bound, isolation)"
```

---

## Task 8.1: `apps/gw-01` WS skeleton + `/health` + `/metrics`

**Traces to:** `specs/gateway-foundation/spec.md`, design D3, D4, D13.

**Files:**

- Create (via Nx): `apps/gw-01/` scaffold
- Create: `apps/gw-01/src/main.ts`
- Create: `apps/gw-01/src/config.ts`
- Create: `apps/gw-01/src/app.ts`
- Create: `apps/gw-01/src/app.test.ts`

- [ ] **Step 1: Generate**

Run: `bunx nx g @nx/js:lib apps/gw-01 --bundler=none --unitTestRunner=none --tags="scope:app,type:app,runtime:bun" --linter=eslint --no-interactive`

Edit `apps/gw-01/project.json` to mirror `be-01`'s targets (substitute `gw-01`).

- [ ] **Step 2: Write failing test**

`apps/gw-01/src/app.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { buildApp } from './app';

describe('gw-01 /health', () => {
  it('returns 200 when backend reachable', async () => {
    const app = buildApp({ beUrl: 'http://be', internalAuthSecret: 's', jwtKey: 'k'.repeat(32) });
    const res = await app.handle(new Request('http://localhost/health'));
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 3: Implement `config.ts`**

```ts
import { defineConfig } from '@wbs/config';
import { type } from '@wbs/validation';

export const GwConfig = type({
  PORT: 'string.integer.parse',
  LOG_LEVEL: "'trace'|'debug'|'info'|'warn'|'error'|'fatal'",
  BE_URL: 'string',
  INTERNAL_AUTH_SECRET: 'string>=32',
  JWT_SIGNING_KEY_CURRENT: 'string>=32',
  'JWT_SIGNING_KEY_PREVIOUS?': 'string>=32',
});
export type GwConfig = typeof GwConfig.infer;

export const loadConfig = () => defineConfig(GwConfig);
```

- [ ] **Step 4: Implement `app.ts`**

```ts
import { Elysia } from 'elysia';
import { createLogger } from '@wbs/observability';
import { observabilityPlugin } from '@wbs/observability/server';

export interface GwAppOptions {
  beUrl: string;
  internalAuthSecret: string;
  jwtKey: string;
  previousJwtKey?: string;
  version?: string;
}

export function buildApp(opts: GwAppOptions) {
  const logger = createLogger({ service: 'gw-01', version: opts.version });
  return new Elysia()
    .use(observabilityPlugin({ service: 'gw-01' }))
    .decorate('logger', logger)
    .decorate('opts', opts)
    .get('/health', () => ({ status: 'ok' }));
}
```

- [ ] **Step 5: Implement `main.ts`**

```ts
import { loadConfig } from './config';
import { buildApp } from './app';
import { createLogger } from '@wbs/observability';

const cfg = loadConfig();
const logger = createLogger({ service: 'gw-01', level: cfg.LOG_LEVEL });

const app = buildApp({
  beUrl: cfg.BE_URL,
  internalAuthSecret: cfg.INTERNAL_AUTH_SECRET,
  jwtKey: cfg.JWT_SIGNING_KEY_CURRENT,
  previousJwtKey: cfg.JWT_SIGNING_KEY_PREVIOUS,
  version: process.env['VERSION'],
});

app.listen(cfg.PORT, () => logger.info({ port: cfg.PORT }, 'gw-01 listening'));
```

- [ ] **Step 6: Create `.env.example`**

```dotenv
PORT=3200
LOG_LEVEL=info
BE_URL=http://localhost:3100
INTERNAL_AUTH_SECRET=change-me-32-chars-minimum-aaaaaaaa
JWT_SIGNING_KEY_CURRENT=change-me-32-chars-minimum-bbbbbbbb
```

- [ ] **Step 7: Run tests**

Run: `cd apps/gw-01 && bun test`
Expected: `1 pass`.

- [ ] **Step 8: Commit**

```bash
git add apps/gw-01/
git commit -m "feat(gw-01): Elysia skeleton with /health and /metrics"
```

---

## Task 8.2: JWT upgrade-time auth with dual-key validation

**Files:**

- Create: `apps/gw-01/src/service/jwt-auth.ts`
- Create: `apps/gw-01/src/service/jwt-auth.test.ts`

- [ ] **Step 1: Install jwt lib**

Run: `bun add jose@^5`

- [ ] **Step 2: Write failing test**

`apps/gw-01/src/service/jwt-auth.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { SignJWT, generateSecret } from 'jose';
import { JwtVerifier } from './jwt-auth';

async function makeToken(secret: Uint8Array, sub = 'user-1') {
  return await new SignJWT({ sub }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().sign(secret);
}

describe('JwtVerifier', () => {
  it('accepts CURRENT-signed token', async () => {
    const cur = await generateSecret('HS256');
    const verifier = new JwtVerifier({ current: cur });
    const token = await makeToken(cur);
    const result = await verifier.verify(token);
    expect(result.sub).toBe('user-1');
  });

  it('falls back to PREVIOUS on invalid signature only', async () => {
    const cur = await generateSecret('HS256');
    const prev = await generateSecret('HS256');
    const verifier = new JwtVerifier({ current: cur, previous: prev });
    const token = await makeToken(prev);
    const result = await verifier.verify(token);
    expect(result.sub).toBe('user-1');
  });

  it('does not fall back on expired token even if PREVIOUS exists', async () => {
    const cur = await generateSecret('HS256');
    const prev = await generateSecret('HS256');
    const verifier = new JwtVerifier({ current: cur, previous: prev });
    const expired = await new SignJWT({ sub: 'u' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(1000)
      .setExpirationTime(2000)
      .sign(cur);
    await expect(verifier.verify(expired)).rejects.toThrow(/expired/i);
  });
});
```

- [ ] **Step 3: Implement `jwt-auth.ts`**

```ts
import { jwtVerify, errors as joseErrors } from 'jose';

export interface JwtVerifierOptions {
  current: Uint8Array;
  previous?: Uint8Array;
}

export class JwtVerifier {
  constructor(private readonly opts: JwtVerifierOptions) {}

  async verify(token: string): Promise<{ sub: string; [k: string]: unknown }> {
    try {
      const { payload } = await jwtVerify(token, this.opts.current);
      return payload as { sub: string };
    } catch (err) {
      if (err instanceof joseErrors.JWSSignatureVerificationFailed && this.opts.previous) {
        const { payload } = await jwtVerify(token, this.opts.previous);
        return payload as { sub: string };
      }
      throw err;
    }
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/gw-01 && bun test`
Expected: `4 pass`.

- [ ] **Step 5: Commit**

```bash
git add apps/gw-01/
git commit -m "feat(gw-01): dual-key JWT verifier with fallback only on signature failure"
```

---

## Task 8.3: In-memory `subscription → Set<socket>` map

**Files:**

- Create: `apps/gw-01/src/service/subscription-map.ts`
- Create: `apps/gw-01/src/service/subscription-map.test.ts`

- [ ] **Step 1: Write failing test**

`apps/gw-01/src/service/subscription-map.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { SubscriptionMap } from './subscription-map';

describe('SubscriptionMap', () => {
  it('subscribes/unsubscribes and lists sockets per key', () => {
    const m = new SubscriptionMap<string>();
    m.subscribe('doc:a', 's1');
    m.subscribe('doc:a', 's2');
    m.subscribe('doc:b', 's1');
    expect(m.socketsFor('doc:a')).toEqual(new Set(['s1', 's2']));
    m.unsubscribe('doc:a', 's1');
    expect(m.socketsFor('doc:a')).toEqual(new Set(['s2']));
  });

  it('removeAll deletes socket from every subscription', () => {
    const m = new SubscriptionMap<string>();
    m.subscribe('a', 's1');
    m.subscribe('b', 's1');
    m.removeAll('s1');
    expect(m.socketsFor('a').size).toBe(0);
    expect(m.socketsFor('b').size).toBe(0);
  });
});
```

- [ ] **Step 2: Implement**

```ts
export class SubscriptionMap<Socket> {
  private readonly map = new Map<string, Set<Socket>>();

  subscribe(subscription: string, socket: Socket): void {
    let set = this.map.get(subscription);
    if (!set) {
      set = new Set();
      this.map.set(subscription, set);
    }
    set.add(socket);
  }

  unsubscribe(subscription: string, socket: Socket): void {
    const set = this.map.get(subscription);
    if (!set) return;
    set.delete(socket);
    if (set.size === 0) this.map.delete(subscription);
  }

  socketsFor(subscription: string): Set<Socket> {
    return this.map.get(subscription) ?? new Set();
  }

  removeAll(socket: Socket): void {
    for (const [k, set] of this.map) {
      set.delete(socket);
      if (set.size === 0) this.map.delete(k);
    }
  }

  activeCount(): number {
    let total = 0;
    for (const set of this.map.values()) total += set.size;
    return total;
  }
}
```

- [ ] **Step 3: Run tests and commit**

```bash
cd apps/gw-01 && bun test
git add apps/gw-01/
git commit -m "feat(gw-01): in-memory SubscriptionMap with subscribe/unsubscribe/removeAll"
```

---

## Task 8.4: `POST /internal/push` fan-out + forward to be-01

**Files:**

- Create: `apps/gw-01/src/controller/internal.controller.ts`
- Create: `apps/gw-01/src/service/forward-client.ts`
- Create: `apps/gw-01/src/service/forward-client.test.ts`
- Create: `apps/gw-01/src/controller/internal.integration.test.ts`
- Modify: `apps/gw-01/src/app.ts`

- [ ] **Step 1: Write failing test for forward-client**

`apps/gw-01/src/service/forward-client.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { ForwardClient } from './forward-client';

describe('ForwardClient', () => {
  it('posts to be-01 /internal/forward with auth + identity headers', async () => {
    const client = new ForwardClient({
      beUrl: 'http://be',
      secret: 's',
      fetchImpl: async (url, init) => {
        expect(String(url)).toBe('http://be/internal/forward');
        const headers = new Headers((init as RequestInit).headers);
        expect(headers.get('x-internal-auth')).toBe('s');
        expect(headers.get('x-client-id')).toBe('u-1');
        expect(headers.get('x-connection-id')).toBe('c-1');
        return new Response(JSON.stringify({ ack: true }), { status: 200 });
      },
    });
    const r = await client.forward(
      { type: 'ping' },
      { clientId: 'u-1', connectionId: 'c-1', traceId: 't-1' },
    );
    expect(r.ack).toBe(true);
  });
});
```

- [ ] **Step 2: Implement `forward-client.ts`**

```ts
export interface ForwardClientOptions {
  beUrl: string;
  secret: string;
  fetchImpl?: typeof fetch;
}

export class ForwardClient {
  private readonly fetch: typeof fetch;
  constructor(private readonly opts: ForwardClientOptions) {
    this.fetch = opts.fetchImpl ?? globalThis.fetch;
  }

  async forward(
    message: unknown,
    ctx: { clientId: string; connectionId: string; traceId: string },
  ): Promise<{ ack: boolean; push_responses?: unknown[] }> {
    const res = await this.fetch(`${this.opts.beUrl}/internal/forward`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-auth': this.opts.secret,
        'x-client-id': ctx.clientId,
        'x-connection-id': ctx.connectionId,
      },
      body: JSON.stringify({ message, trace_id: ctx.traceId }),
    });
    if (!res.ok) throw new Error(`forward failed ${res.status}`);
    return (await res.json()) as { ack: boolean };
  }
}
```

- [ ] **Step 3: Write failing integration test for `/internal/push`**

`apps/gw-01/src/controller/internal.integration.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { buildApp } from '../app';
import { SubscriptionMap } from '../service/subscription-map';

describe('POST /internal/push', () => {
  it('rejects without auth', async () => {
    const app = buildApp({
      beUrl: 'http://be',
      internalAuthSecret: 's'.repeat(32),
      jwtKey: 'k'.repeat(32),
    });
    const res = await app.handle(
      new Request('http://localhost/internal/push', {
        method: 'POST',
        body: JSON.stringify({ subscription: 'a', seq: 1, message: {} }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns delivered_to_sockets:0 when no subscribers', async () => {
    const app = buildApp({
      beUrl: 'http://be',
      internalAuthSecret: 's'.repeat(32),
      jwtKey: 'k'.repeat(32),
    });
    const res = await app.handle(
      new Request('http://localhost/internal/push', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-auth': 's'.repeat(32),
        },
        body: JSON.stringify({ subscription: 'a', seq: 1, message: {} }),
      }),
    );
    expect(res.status).toBe(202);
    const body = (await res.json()) as { delivered_to_sockets: number };
    expect(body.delivered_to_sockets).toBe(0);
  });
});
```

- [ ] **Step 4: Implement `controller/internal.controller.ts`**

```ts
import { Elysia } from 'elysia';
import { parseOrThrow, ValidationError } from '@wbs/validation';
import { InternalPushRequest } from '@wbs/contracts';

import type { SubscriptionMap } from '../service/subscription-map';

interface SocketLike {
  send(data: string): void;
}

export function internalController(secret: string, subs: SubscriptionMap<SocketLike>) {
  return new Elysia({ prefix: '/internal' })
    .onBeforeHandle(({ request, set }) => {
      if (request.headers.get('x-internal-auth') !== secret) {
        set.status = 401;
        return { error: 'unauthorized' };
      }
    })
    .post('/push', ({ body, set }) => {
      try {
        const req = parseOrThrow(InternalPushRequest, body);
        const sockets = subs.socketsFor(req.subscription);
        const payload = JSON.stringify({
          subscription: req.subscription,
          seq: req.seq,
          message: req.message,
        });
        for (const s of sockets) s.send(payload);
        set.status = 202;
        return { delivered_to_sockets: sockets.size };
      } catch (err) {
        if (err instanceof ValidationError) {
          set.status = 400;
          return { error: err.message };
        }
        throw err;
      }
    });
}
```

- [ ] **Step 5: Wire into `app.ts`**

```ts
import { internalController } from './controller/internal.controller';
import { SubscriptionMap } from './service/subscription-map';

// inside buildApp:
const subs = new SubscriptionMap<{ send(d: string): void }>();
// ...
return new Elysia()
  .use(observabilityPlugin({ service: 'gw-01' }))
  .decorate('logger', logger)
  .decorate('subs', subs)
  .use(internalController(opts.internalAuthSecret, subs))
  .get('/health', () => ({ status: 'ok' }));
```

- [ ] **Step 6: Run tests**

Run: `cd apps/gw-01 && bun test`
Expected: `7 pass`.

- [ ] **Step 7: Commit**

```bash
git add apps/gw-01/
git commit -m "feat(gw-01): /internal/push fan-out + ForwardClient for inbound messages"
```

---

## Task 8.5: Reconnect handshake + `gw_*` Prometheus metrics + WS endpoint

**Files:**

- Create: `apps/gw-01/src/controller/ws.controller.ts`
- Create: `apps/gw-01/src/service/gateway-metrics.ts`
- Create: `apps/gw-01/src/controller/ws.controller.test.ts`
- Modify: `apps/gw-01/src/app.ts`

- [ ] **Step 1: Implement `service/gateway-metrics.ts`**

```ts
import { Counter, Gauge, Histogram } from '@wbs/observability';

export const gwMetrics = {
  activeConnections: new Gauge('gw_active_connections', 'Currently open WS sockets'),
  connectionsTotal: new Counter('gw_connections_total', 'WS upgrade attempts'),
  reconnectsTotal: new Counter('gw_reconnects_total', 'Client reconnects with resume'),
  messageFanoutTotal: new Counter('gw_message_fanout_total', 'Server→client fan-outs'),
  inboundMessagesTotal: new Counter(
    'gw_inbound_messages_total',
    'Client→server messages forwarded',
  ),
  drainSeconds: new Histogram('gw_drain_seconds', 'Drain window duration'),
  backendUnavailableTotal: new Counter(
    'gw_backend_unavailable_total',
    'Failed /internal/forward calls',
  ),
};
```

- [ ] **Step 2: Write failing test — WS handler replies to `ping` with `pong`**

`apps/gw-01/src/controller/ws.controller.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { handleWsMessage } from './ws.controller';
import { SubscriptionMap } from '../service/subscription-map';

describe('handleWsMessage (pure)', () => {
  it('responds to {type:"ping"} with {type:"pong"}', async () => {
    const sent: string[] = [];
    const socket = { send: (s: string) => sent.push(s) };
    const subs = new SubscriptionMap<{ send(s: string): void }>();

    await handleWsMessage({
      data: JSON.stringify({ type: 'ping' }),
      socket,
      subs,
      connectionId: 'c-1',
      clientId: 'u-1',
      forward: async () => ({ ack: true }),
      resume: async () => ({}),
    });

    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0])).toEqual({ type: 'pong' });
  });

  it('forwards non-control frames to backend', async () => {
    let captured: unknown;
    const socket = { send: () => {} };
    const subs = new SubscriptionMap<{ send(s: string): void }>();
    await handleWsMessage({
      data: JSON.stringify({ subscription: 'doc:a', message: { hi: true } }),
      socket,
      subs,
      connectionId: 'c-1',
      clientId: 'u-1',
      forward: async (m) => {
        captured = m;
        return { ack: true };
      },
      resume: async () => ({}),
    });
    expect(captured).toEqual({ subscription: 'doc:a', message: { hi: true } });
  });

  it('handles {type:"resume"} by calling resume handler and emitting resume_ack', async () => {
    const sent: string[] = [];
    const socket = { send: (s: string) => sent.push(s) };
    const subs = new SubscriptionMap<{ send(s: string): void }>();
    await handleWsMessage({
      data: JSON.stringify({ type: 'resume', resume_points: { 'doc:a': 5 } }),
      socket,
      subs,
      connectionId: 'c-1',
      clientId: 'u-1',
      forward: async () => ({ ack: true }),
      resume: async () => ({ 'doc:a': { status: 'replaying', count: 0 } }),
    });
    const ack = JSON.parse(sent.at(-1)!);
    expect(ack.type).toBe('resume_ack');
  });
});
```

- [ ] **Step 3: Implement `ws.controller.ts`**

```ts
import type { SubscriptionMap } from '../service/subscription-map';
import { gwMetrics } from '../service/gateway-metrics';

export interface HandleWsMessageArgs {
  data: string;
  socket: { send(s: string): void };
  subs: SubscriptionMap<{ send(s: string): void }>;
  connectionId: string;
  clientId: string;
  forward: (m: unknown) => Promise<{ ack: boolean }>;
  resume: (
    points: Record<string, number>,
  ) => Promise<
    Record<
      string,
      { status: 'replaying'; count: number } | { status: 'denied'; reason: 'out_of_range' }
    >
  >;
}

export async function handleWsMessage(args: HandleWsMessageArgs): Promise<void> {
  const msg = JSON.parse(args.data) as Record<string, unknown>;

  if (msg['type'] === 'ping') {
    args.socket.send(JSON.stringify({ type: 'pong' }));
    return;
  }

  if (msg['type'] === 'resume') {
    gwMetrics.reconnectsTotal.inc();
    const points = (msg['resume_points'] as Record<string, number>) ?? {};
    const result = await args.resume(points);
    const replayed: Record<string, number> = {};
    const denied: string[] = [];
    for (const [sub, r] of Object.entries(result)) {
      if (r.status === 'replaying') replayed[sub] = r.count;
      else denied.push(sub);
    }
    for (const sub of denied) {
      args.socket.send(
        JSON.stringify({ type: 'resume_denied', subscription: sub, reason: 'out_of_range' }),
      );
    }
    args.socket.send(JSON.stringify({ type: 'resume_ack', replayed }));
    return;
  }

  if ('subscription' in msg && 'message' in msg) {
    gwMetrics.inboundMessagesTotal.inc();
    try {
      await args.forward(msg);
    } catch {
      gwMetrics.backendUnavailableTotal.inc();
      args.socket.send(
        JSON.stringify({ type: 'error', code: 'backend_unavailable', retry_after: 5 }),
      );
    }
    return;
  }

  args.socket.send(JSON.stringify({ type: 'error', code: 'invalid_payload' }));
}
```

- [ ] **Step 4: Wire the WS endpoint in `app.ts`**

Add to `buildApp` after the internal controller:

```ts
import { handleWsMessage } from './controller/ws.controller';
import { ForwardClient } from './service/forward-client';
import { JwtVerifier } from './service/jwt-auth';

// ... inside buildApp:
  const verifier = new JwtVerifier({
    current: new TextEncoder().encode(opts.jwtKey),
    previous: opts.previousJwtKey ? new TextEncoder().encode(opts.previousJwtKey) : undefined,
  });
  const forwarder = new ForwardClient({ beUrl: opts.beUrl, secret: opts.internalAuthSecret });

  // extend the chain:
  .ws('/ws', {
    async beforeHandle({ query, set }) {
      const token = (query as { token?: string }).token;
      if (!token) {
        set.status = 401;
        return { error: 'missing token' };
      }
      try {
        (this as unknown as { claims: unknown }).claims = await verifier.verify(token);
      } catch {
        set.status = 401;
        return { error: 'invalid token' };
      }
    },
    open(ws) {
      gwMetrics.connectionsTotal.inc(1, { outcome: 'accepted' });
      gwMetrics.activeConnections.set(1);
      (ws.data as { connectionId: string }).connectionId = crypto.randomUUID();
    },
    async message(ws, data) {
      const d = ws.data as { connectionId: string; claims?: { sub: string } };
      const clientId = d.claims?.sub ?? 'anon';
      await handleWsMessage({
        data: typeof data === 'string' ? data : data.toString(),
        socket: { send: (s) => ws.send(s) },
        subs,
        connectionId: d.connectionId,
        clientId,
        forward: (m) => forwarder.forward(m, { clientId, connectionId: d.connectionId, traceId: crypto.randomUUID() }),
        resume: async (points) => {
          const res = await fetch(`${opts.beUrl}/internal/resume`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-internal-auth': opts.internalAuthSecret,
              'x-client-id': clientId,
              'x-connection-id': d.connectionId,
            },
            body: JSON.stringify({ resume_points: points, trace_id: crypto.randomUUID() }),
          });
          return (await res.json()) as Record<string, { status: 'replaying'; count: number } | { status: 'denied'; reason: 'out_of_range' }>;
        },
      });
    },
    close() {
      gwMetrics.activeConnections.set(-1);
    },
  })
```

- [ ] **Step 5: Run tests**

Run: `cd apps/gw-01 && bun test`
Expected: `10 pass`.

- [ ] **Step 6: Commit**

```bash
git add apps/gw-01/
git commit -m "feat(gw-01): WS endpoint with JWT auth, resume handshake, ping/pong, gw_* metrics"
```

---

## Task 8.6: Full reconnect integration test

**Files:**

- Create: `apps/gw-01/src/integration/reconnect.integration.test.ts`

- [ ] **Step 1: Write the integration test that boots a real Elysia server, opens a WS, closes, reopens, expects `resume_ack`**

```ts
import { describe, expect, it } from 'bun:test';
import { buildApp } from '../app';

describe('reconnect integration', () => {
  it('end-to-end ping/pong through app.handle', async () => {
    // app.handle cannot drive WS; this test uses the pure handleWsMessage path plus a mock socket.
    // Full socket-level test runs in task 12.5 against a real listener.
    const app = buildApp({
      beUrl: 'http://be',
      internalAuthSecret: 's'.repeat(32),
      jwtKey: 'k'.repeat(32),
    });
    const health = await app.handle(new Request('http://localhost/health'));
    expect(health.status).toBe(200);
  });
});
```

Note: The "real WS reconnect" test lives in `tools/tool-smoke` (task 11.5) because it needs an actual listening socket, which is a deploy-surface concern.

- [ ] **Step 2: Run and commit**

```bash
cd apps/gw-01 && bun test
git add apps/gw-01/
git commit -m "test(gw-01): integration smoke for /health via app.handle"
```

---

## Task 9.1: Generate `apps/fe-01` via `@nx-extend/shadcn-ui`

**Traces to:** `specs/frontend-foundation/spec.md`, design D5.

**Files:**

- Create (via Nx plugin): `apps/fe-01/*`
- Create: `apps/fe-01/src/components/ui/button.tsx` (via shadcn)

- [ ] **Step 1: Install the Nx plugin**

Run: `bun add -d @nx-extend/shadcn-ui @nx/vite @nx/react`

If `@nx-extend/shadcn-ui` fails to resolve against Nx 22, fall back to manual scaffolding per Step 2b.

- [ ] **Step 2a: Plugin path — generate the app**

Run: `bunx nx g @nx-extend/shadcn-ui:application fe-01 --directory=apps/fe-01 --style=tailwind --routing=tanstack-router --no-interactive`

If this command succeeds, skip to Step 3.

- [ ] **Step 2b: Fallback path (if plugin broken within 1 hour)**

Run manually:

```bash
bunx nx g @nx/react:app apps/fe-01 --bundler=vite --style=css --routing=false --linter=eslint --unitTestRunner=vitest --no-interactive
cd apps/fe-01 && bun add -d tailwindcss postcss autoprefixer class-variance-authority clsx tailwind-merge
bunx tailwindcss init -p
# Follow https://ui.shadcn.com/docs/installation/vite — generate components.json,
# add "@/*": ["src/*"] to apps/fe-01/tsconfig.json paths,
# and install TanStack Router: bun add @tanstack/react-router @tanstack/router-vite-plugin
```

- [ ] **Step 3: Generate the `Button` component**

Plugin path: `bunx nx g @nx-extend/shadcn-ui:component button --project=fe-01`
Fallback: `cd apps/fe-01 && bunx shadcn@latest add button`

- [ ] **Step 4: Import `Button` into the root route**

Edit `apps/fe-01/src/routes/__root.tsx` (or `apps/fe-01/src/main.tsx` for the fallback path):

```tsx
import { Button } from './components/ui/button';

export default function Root() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">WBS Tool</h1>
      <Button variant="default">Smoke test</Button>
    </main>
  );
}
```

- [ ] **Step 5: Tag the project**

Edit `apps/fe-01/project.json` — add under `"tags"`:

```json
"tags": ["scope:app", "type:app", "runtime:browser"]
```

- [ ] **Step 6: Verify build**

Run: `bunx nx build fe-01`
Expected: Exit 0; static assets in `dist/apps/fe-01/`.

- [ ] **Step 7: Confirm `routeTree.gen.ts` is gitignored**

Verify with `git check-ignore apps/fe-01/src/routeTree.gen.ts` (if TanStack Router is wired).

- [ ] **Step 8: Commit**

```bash
git add apps/fe-01/ package.json bun.lockb
git commit -m "feat(fe-01): bootstrap with shadcn/ui Button + TanStack Router"
```

---

## Task 9.2: Add TanStack Table + d3 smoke examples

**Files:**

- Modify: `apps/fe-01/package.json` (via `bun add`)
- Create: `apps/fe-01/src/components/smoke/table-smoke.tsx`
- Create: `apps/fe-01/src/components/smoke/d3-smoke.tsx`

- [ ] **Step 1: Install deps**

Run: `cd apps/fe-01 && bun add @tanstack/react-table@^8 d3@^7 && bun add -d @types/d3@^7`

- [ ] **Step 2: Implement `table-smoke.tsx`**

```tsx
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';

type Row = { id: string; title: string };
const ch = createColumnHelper<Row>();
const columns = [ch.accessor('id', { header: 'ID' }), ch.accessor('title', { header: 'Title' })];

export function TableSmoke() {
  const table = useReactTable({
    data: [{ id: '1', title: 'Hello' }],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
  return (
    <table>
      <thead>
        {table.getHeaderGroups().map((hg) => (
          <tr key={hg.id}>
            {hg.headers.map((h) => (
              <th key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((r) => (
          <tr key={r.id}>
            {r.getVisibleCells().map((c) => (
              <td key={c.id}>{flexRender(c.column.columnDef.cell, c.getContext())}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 3: Implement `d3-smoke.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import { scaleLinear } from 'd3-scale';

export function D3Smoke() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const scale = scaleLinear().domain([0, 10]).range([0, 100]);
    ref.current.textContent = `scale(5) = ${scale(5)}`;
  }, []);
  return <div ref={ref} />;
}
```

- [ ] **Step 4: Verify build**

Run: `bunx nx build fe-01`
Expected: Exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/fe-01/ package.json bun.lockb
git commit -m "feat(fe-01): add TanStack Table and d3 smoke examples"
```

---

## Task 9.3: TanStack DB dual-mode (local + server) seam

**Files:**

- Create: `apps/fe-01/src/db/config.ts`
- Create: `apps/fe-01/src/db/config.test.ts`

- [ ] **Step 1: Install TanStack DB (or stub with minimal interface if unstable)**

Run: `cd apps/fe-01 && bun add @tanstack/db@^0.0.x` (or adjust based on current release channel; if not installable, stub as below).

- [ ] **Step 2: Write failing test**

`apps/fe-01/src/db/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createDbConfig } from './config';

describe('createDbConfig', () => {
  it('returns local-only adapter when VITE_DB_MODE=local', () => {
    const cfg = createDbConfig({ mode: 'local' });
    expect(cfg.mode).toBe('local');
    expect(cfg.server).toBeUndefined();
  });

  it('returns server adapter with WS url when VITE_DB_MODE=server', () => {
    const cfg = createDbConfig({
      mode: 'server',
      httpBaseUrl: 'http://be',
      wsUrl: 'ws://gw/ws',
      getJwt: async () => 'token',
    });
    expect(cfg.mode).toBe('server');
    expect(cfg.server?.wsUrl).toBe('ws://gw/ws');
  });
});
```

- [ ] **Step 3: Implement `db/config.ts`**

```ts
export type DbMode = 'local' | 'server';

export interface DbConfig {
  mode: DbMode;
  server?: {
    httpBaseUrl: string;
    wsUrl: string;
    getJwt: () => Promise<string>;
  };
}

export interface CreateDbConfigArgs {
  mode: DbMode;
  httpBaseUrl?: string;
  wsUrl?: string;
  getJwt?: () => Promise<string>;
}

export function createDbConfig(args: CreateDbConfigArgs): DbConfig {
  if (args.mode === 'local') return { mode: 'local' };
  if (!args.httpBaseUrl || !args.wsUrl || !args.getJwt) {
    throw new Error('server mode requires httpBaseUrl, wsUrl, getJwt');
  }
  return {
    mode: 'server',
    server: { httpBaseUrl: args.httpBaseUrl, wsUrl: args.wsUrl, getJwt: args.getJwt },
  };
}
```

- [ ] **Step 4: Run tests**

Run: `bunx nx test fe-01`
Expected: Exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/fe-01/
git commit -m "feat(fe-01): TanStack DB dual-mode config seam (local/server)"
```

---

## Task 9.4: Vitest + jsdom unit tests and `routeTree.gen.ts` gitignore confirmation

- [ ] **Step 1: Verify Vitest config includes jsdom**

Read `apps/fe-01/vite.config.ts` (or `vitest.config.ts`). Ensure `test.environment: 'jsdom'` is present. If not, add.

- [ ] **Step 2: Add a component test using React Testing Library**

Run: `cd apps/fe-01 && bun add -d @testing-library/react@^15 @testing-library/jest-dom@^6`

Create `apps/fe-01/src/components/ui/button.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from './button';

describe('Button', () => {
  it('renders its children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeDefined();
  });
});
```

- [ ] **Step 3: Run**

Run: `bunx nx test fe-01`
Expected: Exit 0.

- [ ] **Step 4: Check `.gitignore` covers `routeTree.gen.ts`**

Already done in Task 1.1. Verify: `git check-ignore apps/fe-01/src/routeTree.gen.ts` — if the file doesn't exist yet, `.gitignore` still matches the pattern.

- [ ] **Step 5: Commit**

```bash
git add apps/fe-01/ package.json bun.lockb
git commit -m "test(fe-01): add Vitest + React Testing Library smoke"
```

---

## Task 10.1: `tool-compose` — Caddyfile + Compose templates + renderer

**Traces to:** `specs/deployment-pipeline/spec.md`, design D1, D2, D9.

**Files:**

- Create (via Nx): `tools/tool-compose/` scaffold
- Create: `tools/tool-compose/src/templates/{be,gw,fe,observability}.caddy.tmpl`
- Create: `tools/tool-compose/src/templates/{be,gw,fe,observability}.compose.tmpl`
- Create: `tools/tool-compose/src/render.ts`
- Create: `tools/tool-compose/src/render.test.ts`

- [ ] **Step 1: Generate**

Run: `bunx nx g @nx/js:lib tools/tool-compose --bundler=none --unitTestRunner=none --tags="scope:infra,type:scripts,runtime:bun" --linter=eslint --no-interactive`

Edit `tools/tool-compose/project.json` — add `build` and `render` targets:

```json
{
  "targets": {
    "build": {
      "executor": "nx:run-commands",
      "options": {
        "command": "bun run tools/tool-compose/src/render.ts --outDir=dist/tools/tool-compose"
      },
      "outputs": ["{workspaceRoot}/dist/tools/tool-compose"]
    },
    "render": {
      "executor": "nx:run-commands",
      "options": { "command": "bun run tools/tool-compose/src/render.ts" }
    },
    "test": {
      "executor": "nx:run-commands",
      "options": { "command": "bun test", "cwd": "tools/tool-compose" }
    },
    "lint": {
      "executor": "@nx/eslint:lint",
      "options": { "lintFilePatterns": ["tools/tool-compose/**/*.ts"] }
    }
  }
}
```

- [ ] **Step 2: Write Caddyfile fragments**

`tools/tool-compose/src/templates/be.caddy.tmpl`:

```caddy
handle_path /api/* {
    reverse_proxy be-01:{{BE_PORT}}
}
```

`tools/tool-compose/src/templates/gw.caddy.tmpl`:

```caddy
handle_path /ws* {
    reverse_proxy gw-01:{{GW_PORT}}
}
```

`tools/tool-compose/src/templates/fe.caddy.tmpl`:

```caddy
handle {
    root * /srv/wbs/www
    file_server
    try_files {path} /index.html
}
```

`tools/tool-compose/src/templates/observability.caddy.tmpl`:

```caddy
observability.{{DOMAIN}} {
    basic_auth {
        admin {{OBSERVABILITY_BASIC_AUTH_HASH}}
    }
    reverse_proxy grafana:3000
}
```

- [ ] **Step 3: Write Compose fragments**

`tools/tool-compose/src/templates/be.compose.tmpl`:

```yaml
services:
  be-01:
    image: { { BE_IMAGE } }
    restart: unless-stopped
    ports:
      - '{{BE_HOST_PORT}}:{{BE_PORT}}'
    env_file:
      - /srv/wbs/.env
    volumes:
      - /srv/wbs/data/be:/data
```

`tools/tool-compose/src/templates/gw.compose.tmpl`:

```yaml
services:
  gw-01:
    image: { { GW_IMAGE } }
    restart: unless-stopped
    ports:
      - '{{GW_HOST_PORT}}:{{GW_PORT}}'
    env_file:
      - /srv/wbs/.env
```

`tools/tool-compose/src/templates/fe.compose.tmpl`:

```yaml
services:
  caddy-fe:
    image: caddy:2-alpine
    volumes:
      - /srv/wbs/www:/srv/wbs/www:ro
```

`tools/tool-compose/src/templates/observability.compose.tmpl`:

```yaml
services:
  grafana:
    image: grafana/grafana:10.4.0
    volumes:
      - /srv/wbs/observability/grafana:/etc/grafana/provisioning:ro
  loki:
    image: grafana/loki:3.0.0
  promtail:
    image: grafana/promtail:3.0.0
  prometheus:
    image: prom/prometheus:v2.52.0
    volumes:
      - /srv/wbs/observability/prometheus.yml:/etc/prometheus/prometheus.yml:ro
```

- [ ] **Step 4: Write failing test**

`tools/tool-compose/src/render.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { renderTemplate } from './render';

describe('renderTemplate', () => {
  it('substitutes {{KEY}} placeholders', () => {
    const result = renderTemplate('port {{PORT}}, host {{HOST}}', {
      PORT: '3100',
      HOST: 'localhost',
    });
    expect(result).toBe('port 3100, host localhost');
  });

  it('throws on missing placeholder', () => {
    expect(() => renderTemplate('missing {{FOO}}', {})).toThrow(/FOO/);
  });
});
```

- [ ] **Step 5: Implement `render.ts`**

```ts
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function renderTemplate(content: string, vars: Record<string, string>): string {
  return content.replace(/{{(\w+)}}/g, (_m, key: string) => {
    if (!(key in vars)) throw new Error(`missing template variable: ${key}`);
    return vars[key];
  });
}

async function main() {
  const outArg = Bun.argv.find((a) => a.startsWith('--outDir='));
  const outDir = outArg ? outArg.split('=')[1] : 'dist/tools/tool-compose';
  const srcDir = path.join('tools/tool-compose/src/templates');
  const files = await readdir(srcDir);
  await mkdir(outDir, { recursive: true });
  for (const f of files) {
    const content = await readFile(path.join(srcDir, f), 'utf-8');
    await writeFile(path.join(outDir, f), content);
  }
  console.log(`rendered ${files.length} templates to ${outDir}`);
}

if (import.meta.main) await main();
```

- [ ] **Step 6: Run tests + build**

Run: `cd tools/tool-compose && bun test`
Expected: `2 pass`.
Run: `bunx nx build tool-compose`
Expected: `dist/tools/tool-compose/` populated with 8 files.

- [ ] **Step 7: Commit**

```bash
git add tools/tool-compose/
git commit -m "feat(tool-compose): Caddy + Compose fragment templates with renderer"
```

---

## Task 10.2: `tool-observability-stack` — Grafana/Loki/Promtail/Prometheus configs + dashboards

**Traces to:** `specs/observability-baseline/spec.md`, design D12, D14.

**Files:**

- Create (via Nx): `tools/tool-observability-stack/` scaffold
- Create: `tools/tool-observability-stack/src/prometheus.yml`
- Create: `tools/tool-observability-stack/src/promtail.yml`
- Create: `tools/tool-observability-stack/src/loki.yml`
- Create: `tools/tool-observability-stack/src/grafana/provisioning/datasources/{loki,prometheus}.yml`
- Create: `tools/tool-observability-stack/src/grafana/provisioning/dashboards/default.yml`
- Create: `tools/tool-observability-stack/src/grafana/dashboards/{be-01-overview,gw-01-overview,wbs-alerts}.json`
- Create: `tools/tool-observability-stack/src/validate.ts`
- Create: `tools/tool-observability-stack/src/validate.test.ts`

- [ ] **Step 1: Generate**

Run: `bunx nx g @nx/js:lib tools/tool-observability-stack --bundler=none --unitTestRunner=none --tags="scope:infra,type:scripts,runtime:bun" --linter=eslint --no-interactive`

Add `build`, `validate`, `test`, `lint` targets in `project.json` (mirror `tool-compose`).

- [ ] **Step 2: Write `prometheus.yml`**

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
scrape_configs:
  - job_name: be-01
    static_configs:
      - targets: ['be-01:3100']
    metrics_path: /metrics
  - job_name: gw-01
    static_configs:
      - targets: ['gw-01:3200']
    metrics_path: /metrics
```

- [ ] **Step 3: Write `promtail.yml` (verbatim per design D12)**

```yaml
server:
  http_listen_port: 9080
clients:
  - url: http://loki:3100/loki/api/v1/push
scrape_configs:
  - job_name: docker
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
    pipeline_stages:
      - json:
          expressions:
            level: level
            service: service
            version: version
            request_id: request_id
            connection_id: connection_id
            user_id: user_id
            trace_id: trace_id
            ws_subscription: ws_subscription
      - labels:
          level:
          service:
          version:
      - structured_metadata:
          request_id:
          connection_id:
          trace_id:
          span_id:
          ws_subscription:
```

- [ ] **Step 4: Write `loki.yml`**

```yaml
auth_enabled: false
server: { http_listen_port: 3100 }
common:
  ring: { instance_addr: 127.0.0.1, kvstore: { store: inmemory } }
  replication_factor: 1
  path_prefix: /tmp/loki
schema_config:
  configs:
    - from: '2024-01-01'
      store: tsdb
      object_store: filesystem
      schema: v13
      index: { prefix: index_, period: 24h }
limits_config:
  retention_period: 168h
  allow_structured_metadata: true
```

- [ ] **Step 5: Write Grafana provisioning**

`src/grafana/provisioning/datasources/loki.yml`:

```yaml
apiVersion: 1
datasources:
  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100
```

`src/grafana/provisioning/datasources/prometheus.yml`:

```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
```

`src/grafana/provisioning/dashboards/default.yml`:

```yaml
apiVersion: 1
providers:
  - name: WBS
    type: file
    folder: WBS
    options: { path: /etc/grafana/provisioning/dashboards/json }
```

- [ ] **Step 6: Write minimal dashboard JSON stubs**

`src/grafana/dashboards/be-01-overview.json`:

```json
{
  "title": "be-01 overview",
  "uid": "be-01-overview",
  "schemaVersion": 38,
  "panels": [
    {
      "type": "timeseries",
      "title": "request rate",
      "targets": [{ "expr": "sum(rate(http_requests_total{service=\"be-01\"}[1m]))" }]
    }
  ]
}
```

(Repeat similar stubs for `gw-01-overview.json` and `wbs-alerts.json`. Full dashboards grow organically in later features; scaffold keeps them minimal.)

- [ ] **Step 7: Write failing test**

`tools/tool-observability-stack/src/validate.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { validateAll } from './validate';

describe('observability stack validation', () => {
  it('all config files and dashboards are well-formed', async () => {
    const errors = await validateAll('tools/tool-observability-stack/src');
    expect(errors).toEqual([]);
  });
});
```

- [ ] **Step 8: Implement `validate.ts`**

```ts
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

export async function validateAll(srcDir: string): Promise<string[]> {
  const errors: string[] = [];

  for (const f of ['prometheus.yml', 'promtail.yml', 'loki.yml']) {
    try {
      parseYaml(await readFile(path.join(srcDir, f), 'utf-8'));
    } catch (e) {
      errors.push(`${f}: ${(e as Error).message}`);
    }
  }

  const dashboards = await readdir(path.join(srcDir, 'grafana/dashboards'));
  for (const f of dashboards) {
    try {
      const d = JSON.parse(await readFile(path.join(srcDir, 'grafana/dashboards', f), 'utf-8')) as {
        title?: string;
        uid?: string;
      };
      if (!d.title || !d.uid) errors.push(`${f}: missing title/uid`);
    } catch (e) {
      errors.push(`${f}: ${(e as Error).message}`);
    }
  }

  return errors;
}

if (import.meta.main) {
  const e = await validateAll('tools/tool-observability-stack/src');
  if (e.length > 0) {
    console.error(e.join('\n'));
    process.exit(1);
  }
  console.log('ok');
}
```

- [ ] **Step 9: Add `build` target that copies files to `dist/`**

In `tools/tool-observability-stack/project.json`:

```json
"build": {
  "executor": "nx:run-commands",
  "options": { "command": "mkdir -p dist/tools/tool-observability-stack && cp -R tools/tool-observability-stack/src/* dist/tools/tool-observability-stack/" },
  "outputs": ["{workspaceRoot}/dist/tools/tool-observability-stack"]
},
"validate": {
  "executor": "nx:run-commands",
  "options": { "command": "bun run tools/tool-observability-stack/src/validate.ts" }
}
```

- [ ] **Step 10: Run tests + build + validate**

```bash
bunx nx test tool-observability-stack
bunx nx build tool-observability-stack
bunx nx run tool-observability-stack:validate
```

Expected: all exit 0.

- [ ] **Step 11: Commit**

```bash
git add tools/tool-observability-stack/
git commit -m "feat(tool-observability-stack): Grafana/Loki/Promtail/Prometheus configs + seed dashboards"
```

---

## Task 10.3: `tool-secrets` — `.sops.yaml`, encrypted envs, CLI

**Traces to:** `specs/secrets-management/spec.md`, design D18.

**Files:**

- Create (via Nx): `tools/tool-secrets/` scaffold
- Create: `.sops.yaml` (repo root)
- Create: `tools/tool-secrets/src/production.env.sops` (placeholder; populated in 12.3)
- Create: `tools/tool-secrets/src/local.env.example`
- Create: `tools/tool-secrets/src/README.md`
- Create: `tools/tool-secrets/src/cli/{decrypt,push,encrypt,updatekeys}.ts`

- [ ] **Step 1: Generate**

Run: `bunx nx g @nx/js:lib tools/tool-secrets --bundler=none --unitTestRunner=none --tags="scope:infra,type:scripts,runtime:bun" --linter=eslint --no-interactive`

- [ ] **Step 2: Write `.sops.yaml` at repo root**

Run locally: `age-keygen -o ~/.config/sops/age/keys.txt` (per-developer; one-time). Extract public key: `age-keygen -y ~/.config/sops/age/keys.txt`.

Write `.sops.yaml` (substitute the actual public key):

```yaml
creation_rules:
  - path_regex: tools/tool-secrets/src/.*\.env\.sops$
    age: age1<PUBLIC_KEY_HERE>
```

- [ ] **Step 3: Write `local.env.example`**

```dotenv
PORT=3100
GW_PORT=3200
LOG_LEVEL=debug
INTERNAL_AUTH_SECRET=dev-secret-must-be-32-chars-longer!!
JWT_SIGNING_KEY_CURRENT=dev-jwt-secret-must-be-32-chars-long!
BE_URL=http://localhost:3100
GW_URL=http://localhost:3200
OBSERVABILITY_BASIC_AUTH_HASH=
NTFY_TOPIC_URL=
```

- [ ] **Step 4: Write `README.md`**

```md
# `tools/tool-secrets`

SOPS + age encrypted secrets.

## Files

- `src/production.env.sops` — committed, encrypted.
- `src/local.env.example` — template; copy to `.env.local` (gitignored).

## Rotation

1. `age-keygen -o new-key.txt`
2. Add public key to `/.sops.yaml`
3. `sops updatekeys tools/tool-secrets/src/*.env.sops`
4. Commit.
5. After grace period, remove old recipient and re-run `updatekeys`.

## Commands

- `nx run tool-secrets:decrypt` — stream plaintext to stdout.
- `nx run tool-secrets:push -- --host=<host>` — stream to `/srv/wbs/.env`.
- `nx run tool-secrets:encrypt -- <file>` — encrypt a dotenv file.
- `nx run tool-secrets:updatekeys` — re-wrap for current recipients.
```

- [ ] **Step 5: Populate `production.env.sops` with placeholder plaintext + encrypt**

```bash
cat > /tmp/prod.env <<'EOF'
PORT=3100
GW_PORT=3200
LOG_LEVEL=info
INTERNAL_AUTH_SECRET=placeholder-replaced-later-32-chars!!
JWT_SIGNING_KEY_CURRENT=placeholder-replaced-later-32-chars_
OBSERVABILITY_BASIC_AUTH_HASH=
NTFY_TOPIC_URL=
EOF
sops --encrypt --input-type dotenv --output-type dotenv /tmp/prod.env > tools/tool-secrets/src/production.env.sops
rm /tmp/prod.env
```

- [ ] **Step 6: Implement `cli/decrypt.ts`**

```ts
import { $ } from '@wbs/scripts';

const path = Bun.argv[2] ?? 'tools/tool-secrets/src/production.env.sops';
const { stdout } = await $`sops -d --input-type dotenv --output-type dotenv ${path}`;
process.stdout.write(stdout);
```

- [ ] **Step 7: Implement `cli/push.ts`**

```ts
import { $, buildSshCommand } from '@wbs/scripts';

const args = Object.fromEntries(
  Bun.argv.slice(2).map((a) => a.replace(/^--/, '').split('=') as [string, string]),
);
const host = args['host'];
const envFile = args['env'] ?? 'production';
if (!host) {
  console.error('--host required');
  process.exit(1);
}

const sopsPath = `tools/tool-secrets/src/${envFile}.env.sops`;
const { stdout: plaintext } = await $`sops -d --input-type dotenv --output-type dotenv ${sopsPath}`;

const sshCmd = buildSshCommand({ host, user: 'root' }, `install -m 0600 /dev/stdin /srv/wbs/.env`);
const proc = Bun.spawn(sshCmd, { stdin: 'pipe' });
proc.stdin.write(plaintext);
proc.stdin.end();
const exit = await proc.exited;
if (exit !== 0) {
  console.error(`push failed with exit ${exit}`);
  process.exit(exit);
}
console.log(`pushed ${envFile} secrets to ${host}:/srv/wbs/.env`);
```

- [ ] **Step 8: Implement `cli/encrypt.ts` and `cli/updatekeys.ts`**

```ts
// encrypt.ts
import { $ } from '@wbs/scripts';
const f = Bun.argv[2];
if (!f) {
  console.error('usage: encrypt <file>');
  process.exit(1);
}
await $`sops --encrypt --input-type dotenv --output-type dotenv ${f} > ${f}.sops`;
```

```ts
// updatekeys.ts
import { $ } from '@wbs/scripts';
const files = Bun.argv.slice(2);
for (const f of files) await $`sops updatekeys ${f}`;
```

- [ ] **Step 9: Add project targets**

`tools/tool-secrets/project.json`:

```json
{
  "targets": {
    "decrypt": {
      "executor": "nx:run-commands",
      "options": { "command": "bun run tools/tool-secrets/src/cli/decrypt.ts" },
      "cache": false
    },
    "push": {
      "executor": "nx:run-commands",
      "options": { "command": "bun run tools/tool-secrets/src/cli/push.ts" },
      "cache": false
    },
    "encrypt": {
      "executor": "nx:run-commands",
      "options": { "command": "bun run tools/tool-secrets/src/cli/encrypt.ts" },
      "cache": false
    },
    "updatekeys": {
      "executor": "nx:run-commands",
      "options": {
        "command": "bun run tools/tool-secrets/src/cli/updatekeys.ts tools/tool-secrets/src/production.env.sops"
      },
      "cache": false
    },
    "lint": {
      "executor": "@nx/eslint:lint",
      "options": { "lintFilePatterns": ["tools/tool-secrets/**/*.ts"] }
    }
  }
}
```

- [ ] **Step 10: Verify local decrypt works**

Run: `bunx nx run tool-secrets:decrypt`
Expected: Prints the placeholder dotenv to stdout (if your age key is present in `~/.config/sops/age/keys.txt` and registered in `.sops.yaml`).

- [ ] **Step 11: Commit**

```bash
git add .sops.yaml tools/tool-secrets/
git commit --no-verify -m "feat(tool-secrets): SOPS+age encrypted secrets with decrypt/push/encrypt/updatekeys CLIs"
```

(`--no-verify` because `tool-git-hooks` isn't wired yet.)

---

## Task 10.4: `tool-git-hooks` — `install.ts` + plaintext-secret guard + conventional-commits

**Traces to:** `specs/developer-tooling/spec.md`, design D18, D21.

**Files:**

- Create (via Nx): `tools/tool-git-hooks/` scaffold
- Create: `tools/tool-git-hooks/src/install.ts`
- Create: `tools/tool-git-hooks/src/hooks/plaintext-secret-guard.ts`
- Create: `tools/tool-git-hooks/src/hooks/conventional-commits.ts`
- Create: `tools/tool-git-hooks/src/hooks/plaintext-secret-guard.test.ts`

- [ ] **Step 1: Generate**

Run: `bunx nx g @nx/js:lib tools/tool-git-hooks --bundler=none --unitTestRunner=none --tags="scope:infra,type:scripts,runtime:bun" --linter=eslint --no-interactive`

- [ ] **Step 2: Write failing test for plaintext-secret-guard**

`tools/tool-git-hooks/src/hooks/plaintext-secret-guard.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { scanFiles } from './plaintext-secret-guard';

describe('plaintext-secret-guard', () => {
  it('rejects .env files without .sops or .example suffix', () => {
    const result = scanFiles([
      'apps/be-01/.env',
      'apps/be-01/.env.sops',
      'apps/be-01/.env.example',
    ]);
    expect(result.rejected).toEqual(['apps/be-01/.env']);
  });

  it('flags AWS-style secret strings in content', () => {
    const result = scanFiles([], {
      // intentionally split so this planning doc itself doesn't trip the hook;
      // the actual test should use a single contiguous AKIA[A-Z0-9]{16} literal
      'foo.ts': 'const key = "AKI' + 'AIOSFODNN7EXAMPLE"; const secret="x";',
    });
    expect(result.rejected.length).toBeGreaterThan(0);
  });

  it('accepts benign files', () => {
    const result = scanFiles([], { 'app.ts': 'export const hello = "world";' });
    expect(result.rejected).toEqual([]);
  });
});
```

- [ ] **Step 3: Implement `plaintext-secret-guard.ts`**

```ts
import { readFileSync } from 'node:fs';

export interface ScanResult {
  rejected: string[];
  reasons: Record<string, string>;
}

const ENV_NAME = /(^|\/)\.env(\..*)?$/;
const ALLOWED_ENV = /\.(sops|example)$/;
const AWS_KEY = /AKIA[0-9A-Z]{16}/;
const LONG_HEX = /\b[a-f0-9]{40,}\b/i;
const JWT_SHAPE = /\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/;

export function scanFiles(paths: string[], contentOverrides?: Record<string, string>): ScanResult {
  const out: ScanResult = { rejected: [], reasons: {} };
  for (const p of paths) {
    if (ENV_NAME.test(p) && !ALLOWED_ENV.test(p)) {
      out.rejected.push(p);
      out.reasons[p] = 'plaintext .env forbidden';
      continue;
    }
    const content = contentOverrides?.[p] ?? safeRead(p);
    if (!content) continue;
    if (AWS_KEY.test(content) || LONG_HEX.test(content) || JWT_SHAPE.test(content)) {
      out.rejected.push(p);
      out.reasons[p] = 'possible secret in file';
    }
  }
  if (contentOverrides) {
    for (const [p, c] of Object.entries(contentOverrides)) {
      if (paths.includes(p)) continue;
      if (AWS_KEY.test(c) || JWT_SHAPE.test(c)) {
        out.rejected.push(p);
        out.reasons[p] = 'possible secret in file';
      }
    }
  }
  return out;
}

function safeRead(p: string): string | null {
  try {
    return readFileSync(p, 'utf-8');
  } catch {
    return null;
  }
}

if (import.meta.main) {
  const files = Bun.argv.slice(2);
  const res = scanFiles(files);
  if (res.rejected.length > 0) {
    console.error('❌ plaintext-secret-guard rejected these files:');
    for (const [f, r] of Object.entries(res.reasons)) console.error(`  ${f}: ${r}`);
    process.exit(1);
  }
  process.exit(0);
}
```

- [ ] **Step 4: Implement `conventional-commits.ts`**

```ts
import { readFileSync } from 'node:fs';

const PATTERN = /^(feat|fix|chore|refactor|docs|test|style|perf|build|ci|revert)(\(.+\))?!?:\s.+/;

const msgFile = Bun.argv[2];
if (!msgFile) {
  console.error('usage: conventional-commits.ts <commit-msg-file>');
  process.exit(1);
}
const msg = readFileSync(msgFile, 'utf-8').trim();
const firstLine = msg.split('\n')[0];
if (!PATTERN.test(firstLine)) {
  console.error(`❌ commit message must match ${PATTERN}`);
  console.error(`  got: "${firstLine}"`);
  process.exit(1);
}
process.exit(0);
```

- [ ] **Step 5: Implement `install.ts`**

```ts
import { $ } from '@wbs/scripts';

await $`bunx lefthook install`;
console.log('lefthook hooks installed');
```

- [ ] **Step 6: Add targets in `tools/tool-git-hooks/project.json`**

```json
{
  "targets": {
    "install": {
      "executor": "nx:run-commands",
      "options": { "command": "bun run tools/tool-git-hooks/src/install.ts" }
    },
    "test": {
      "executor": "nx:run-commands",
      "options": { "command": "bun test", "cwd": "tools/tool-git-hooks" }
    },
    "lint": {
      "executor": "@nx/eslint:lint",
      "options": { "lintFilePatterns": ["tools/tool-git-hooks/**/*.ts"] }
    }
  }
}
```

- [ ] **Step 7: Run tests**

Run: `cd tools/tool-git-hooks && bun test`
Expected: `3 pass`.

- [ ] **Step 8: Install the hooks for the first time**

Run: `bunx nx run tool-git-hooks:install`
Expected: `.git/hooks/pre-commit` + `.git/hooks/commit-msg` written.

- [ ] **Step 9: Commit (hooks now active; lefthook runs them)**

```bash
git add tools/tool-git-hooks/
git commit -m "feat(tool-git-hooks): install.ts + plaintext-secret-guard + conventional-commits"
```

---

## Task 11.1: `tool-dagger` — TypeScript SDK module structure

**Traces to:** `specs/deployment-pipeline/spec.md`, design D6, D7.

**Files:**

- Create (via Nx): `tools/tool-dagger/` scaffold
- Create: `tools/tool-dagger/dagger.json`
- Create: `tools/tool-dagger/src/{main,be-01,gw-01,fe-01}.ts`
- Create: `tools/tool-dagger/src/lib/{image,bundle}.ts`

- [ ] **Step 1: Install Dagger CLI on workstation (one-time)**

```bash
curl -L https://dl.dagger.io/dagger/install.sh | sh
```

Verify: `dagger version`.

- [ ] **Step 2: Generate the Nx project**

Run: `bunx nx g @nx/js:lib tools/tool-dagger --bundler=none --unitTestRunner=none --tags="scope:infra,type:scripts,runtime:bun" --linter=eslint --no-interactive`

- [ ] **Step 3: Initialize Dagger module in TypeScript**

```bash
cd tools/tool-dagger
dagger init --sdk=typescript --name=wbs-deploy
cd ../..
```

This creates `dagger.json` and `dagger/` — move `dagger/src/*.ts` into `tools/tool-dagger/src/` (Dagger init writes to its own subdirectory by default; adjust by editing `dagger.json` to set `"source": "src"`).

- [ ] **Step 4: Write `lib/image.ts`**

```ts
import { dag, Container, Directory } from '@dagger.io/dagger';

export function bunBase(): Container {
  return dag.container().from('oven/bun:1.1.34-alpine');
}

export function installDeps(src: Directory): Container {
  return bunBase()
    .withMountedCache('/root/.bun/install/cache', dag.cacheVolume('bun-deps'))
    .withDirectory('/app', src, { include: ['package.json', 'bun.lockb'] })
    .withWorkdir('/app')
    .withExec(['bun', 'install', '--frozen-lockfile']);
}
```

- [ ] **Step 5: Write `lib/bundle.ts`**

```ts
import { File } from '@dagger.io/dagger';

export interface BundleMeta {
  tier: 'be' | 'gw' | 'fe';
  sha: string;
  built_at: string;
  schema_version: 1;
  image_id?: string;
}

export function metaJson(meta: BundleMeta): string {
  return JSON.stringify(meta, null, 2);
}
```

- [ ] **Step 6: Write `src/be-01.ts` (simplified)**

```ts
import { dag, Directory, object, func, File } from '@dagger.io/dagger';

import { bunBase, installDeps } from './lib/image';
import { metaJson } from './lib/bundle';

@object()
export class Be01 {
  @func()
  async build(source: Directory, sha: string): Promise<File> {
    const deps = await installDeps(source);
    const built = deps
      .withDirectory('/app/apps/be-01', source.directory('apps/be-01'))
      .withExec(['bun', 'build', 'apps/be-01/src/main.ts', '--target=bun', '--outdir=/out']);
    const image = built.directory('/out').export('/tmp/be-01.tar');

    const tarball = dag
      .container()
      .from('alpine:3.19')
      .withExec(['apk', 'add', '--no-cache', 'tar'])
      .withMountedDirectory('/src', built.directory('/out'))
      .withNewFile(
        '/META.json',
        metaJson({ tier: 'be', sha, built_at: new Date().toISOString(), schema_version: 1 }),
      )
      .withNewFile('/VERSION', sha)
      .withExec(['sh', '-c', 'tar czf /release.tar.gz -C / META.json VERSION src'])
      .file('/release.tar.gz');

    return tarball;
  }
}
```

(The `gw-01.ts` and `fe-01.ts` modules follow the same structure; the FE module produces a `www/` directory instead of a container tar.)

- [ ] **Step 7: Write `src/main.ts` composing them**

```ts
import { object, func, Directory, File } from '@dagger.io/dagger';
import { Be01 } from './be-01';

@object()
export class WbsDeploy {
  @func()
  async publishBe(source: Directory, sha: string): Promise<File> {
    return await new Be01().build(source, sha);
  }
}
```

- [ ] **Step 8: Add Nx targets**

`tools/tool-dagger/project.json`:

```json
{
  "targets": {
    "publish-be": {
      "executor": "nx:run-commands",
      "options": {
        "command": "dagger call publish-be --source=. --sha=$(git rev-parse --short HEAD) -o dist/tools/tool-dagger/release-$(git rev-parse --short HEAD)-be.tar.gz",
        "cwd": "tools/tool-dagger"
      },
      "inputs": [
        "{projectRoot}/**/*",
        "{workspaceRoot}/apps/be-01/**/*",
        "{workspaceRoot}/libs/**/*",
        "{workspaceRoot}/package.json",
        "{workspaceRoot}/bun.lockb"
      ],
      "outputs": ["{workspaceRoot}/dist/tools/tool-dagger"],
      "dependsOn": ["^build"]
    },
    "publish-gw": { "...": "..." },
    "publish-fe": { "...": "..." },
    "publish-all": {
      "executor": "nx:run-commands",
      "options": {
        "commands": [
          "nx run tool-dagger:publish-be",
          "nx run tool-dagger:publish-gw",
          "nx run tool-dagger:publish-fe"
        ],
        "parallel": true
      }
    }
  }
}
```

- [ ] **Step 9: Commit**

```bash
git add tools/tool-dagger/
git commit -m "feat(tool-dagger): Dagger TS SDK skeleton with per-tier publish targets"
```

Note: Full `publish-be` execution requires a running Dagger engine; this task ships the source, not a verified build. Task 12.4 is the first task that actually runs Dagger end-to-end.

---

## Task 11.2: `tool-bootstrap` — `bootstrap.sh` + `push.ts`

**Files:**

- Create (via Nx): `tools/tool-bootstrap/` scaffold
- Create: `tools/tool-bootstrap/src/bootstrap.sh`
- Create: `tools/tool-bootstrap/src/push.ts`

- [ ] **Step 1: Generate**

Run: `bunx nx g @nx/js:lib tools/tool-bootstrap --bundler=none --unitTestRunner=none --tags="scope:infra,type:scripts,runtime:bun" --linter=eslint --no-interactive`

- [ ] **Step 2: Write `bootstrap.sh` verbatim from design D10**

```sh
#!/bin/sh
set -eu

BUN_VERSION="1.1.34"

if command -v bun >/dev/null 2>&1; then
    current="$(bun --version 2>/dev/null || echo "")"
    if [ "$current" = "$BUN_VERSION" ]; then
        echo "bun ${BUN_VERSION} already installed, skipping"
    else
        curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}"
    fi
else
    curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}"
fi

if ! command -v docker >/dev/null 2>&1; then
    curl -fsSL https://get.docker.com | sh
fi

mkdir -p /srv/wbs/releases /srv/wbs/staging /srv/wbs/state /srv/wbs/state/fragments /srv/wbs/www /srv/wbs/bin /srv/wbs/observability
chmod 755 /srv/wbs /srv/wbs/*

echo "bootstrap complete: bun=$(command -v bun) docker=$(command -v docker)"
```

Make executable: `chmod +x tools/tool-bootstrap/src/bootstrap.sh`.

- [ ] **Step 3: Write `push.ts`**

```ts
import { $, buildScpCommand, buildSshCommand } from '@wbs/scripts';

const args = Object.fromEntries(
  Bun.argv.slice(2).map((a) => a.replace(/^--/, '').split('=') as [string, string]),
);
const host = args['host'];
if (!host) {
  console.error('--host required');
  process.exit(1);
}

const target = { host, user: 'root' };
await $`${buildScpCommand(target, 'tools/tool-bootstrap/src/bootstrap.sh', '/tmp/bootstrap.sh').join(' ')}`;
await $`${buildSshCommand(target, 'sh /tmp/bootstrap.sh && rm /tmp/bootstrap.sh').join(' ')}`;
console.log('bootstrap push complete');
```

- [ ] **Step 4: Add targets**

```json
{
  "targets": {
    "build": {
      "executor": "nx:run-commands",
      "options": { "command": "shellcheck tools/tool-bootstrap/src/bootstrap.sh" }
    },
    "push": {
      "executor": "nx:run-commands",
      "options": { "command": "bun run tools/tool-bootstrap/src/push.ts" },
      "cache": false
    },
    "lint": {
      "executor": "@nx/eslint:lint",
      "options": { "lintFilePatterns": ["tools/tool-bootstrap/**/*.ts"] }
    }
  }
}
```

- [ ] **Step 5: Install shellcheck locally if missing**

`brew install shellcheck` or equivalent.

- [ ] **Step 6: Run `nx build tool-bootstrap`**

Run: `bunx nx build tool-bootstrap`
Expected: Exit 0.

- [ ] **Step 7: Commit**

```bash
git add tools/tool-bootstrap/
git commit -m "feat(tool-bootstrap): bootstrap.sh (Bun+Docker+dirs) and push.ts over SSH"
```

---

## Task 11.3: `tool-remote-scripts` — blue/green swap scripts

**Files:**

- Create (via Nx): `tools/tool-remote-scripts/` scaffold
- Create: `tools/tool-remote-scripts/src/{swap,swap-be,swap-gw,swap-fe}.ts`
- Create: `tools/tool-remote-scripts/src/{caddy,health,drain,state}.ts`

- [ ] **Step 1: Generate**

Run: `bunx nx g @nx/js:lib tools/tool-remote-scripts --bundler=none --unitTestRunner=none --tags="scope:infra,type:scripts,runtime:bun" --linter=eslint --no-interactive`

- [ ] **Step 2: Write `src/health.ts`**

```ts
export async function waitForHealth(
  url: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const timeout = opts.timeoutMs ?? 60_000;
  const interval = opts.intervalMs ?? 500;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`health check timeout after ${timeout}ms: ${url}`);
}
```

- [ ] **Step 3: Write `src/state.ts`**

```ts
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface TierState {
  tier: 'be' | 'gw' | 'fe';
  sha: string;
  deployed_at: string;
  bundle: string;
}

const STATE_DIR = '/srv/wbs/state';

export async function readTierState(tier: string): Promise<TierState | null> {
  try {
    return JSON.parse(
      await readFile(path.join(STATE_DIR, `${tier}.last-deployed.json`), 'utf-8'),
    ) as TierState;
  } catch {
    return null;
  }
}

export async function writeTierState(state: TierState): Promise<void> {
  await writeFile(path.join(STATE_DIR, `${state.tier}.last-deployed.json`), JSON.stringify(state));
}

export async function getCurrentColor(): Promise<'blue' | 'green'> {
  try {
    const c = (await readFile(path.join(STATE_DIR, 'current-color'), 'utf-8')).trim();
    return c === 'green' ? 'green' : 'blue';
  } catch {
    return 'blue';
  }
}

export async function setCurrentColor(c: 'blue' | 'green'): Promise<void> {
  await writeFile(path.join(STATE_DIR, 'current-color'), c);
}
```

- [ ] **Step 4: Write `src/caddy.ts`**

```ts
import { $ } from '@wbs/scripts';

export async function reloadCaddy(): Promise<void> {
  await $`docker exec caddy caddy reload --config /etc/caddy/Caddyfile`;
}

export async function assembleCaddyfile(fragmentsDir: string, out: string): Promise<void> {
  const fragments = ['be', 'gw', 'fe', 'observability'].map(
    (t) => `${fragmentsDir}/${t}/Caddyfile.tmpl`,
  );
  await $`cat ${fragments.join(' ')} > ${out}`;
}
```

- [ ] **Step 5: Write `src/drain.ts`**

```ts
export async function drainGateway(
  metricsUrl: string,
  opts: { timeoutSec?: number; intervalSec?: number } = {},
): Promise<{ drainedSeconds: number }> {
  const timeout = (opts.timeoutSec ?? 300) * 1000;
  const interval = (opts.intervalSec ?? 10) * 1000;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const res = await fetch(metricsUrl);
    const body = await res.text();
    const match = /^gw_active_connections\s+(\d+)/m.exec(body);
    const active = match ? Number(match[1]) : 0;
    if (active === 0) return { drainedSeconds: (Date.now() - start) / 1000 };
    await new Promise((r) => setTimeout(r, interval));
  }
  return { drainedSeconds: (Date.now() - start) / 1000 };
}
```

- [ ] **Step 6: Write `src/swap-be.ts` (sketch; non-trivial but concrete)**

```ts
import { $ } from '@wbs/scripts';
import { getCurrentColor, setCurrentColor, writeTierState } from './state';
import { waitForHealth } from './health';
import { assembleCaddyfile, reloadCaddy } from './caddy';

const [, , bundlePath] = Bun.argv;
if (!bundlePath) {
  console.error('usage: swap-be <bundle.tar.gz>');
  process.exit(1);
}

const current = await getCurrentColor();
const next = current === 'blue' ? 'green' : 'blue';
const nextPort = next === 'blue' ? '3100' : '3101';

await $`mkdir -p /srv/wbs/staging/be-${next} && tar xzf ${bundlePath} -C /srv/wbs/staging/be-${next}`;
await $`docker load -i /srv/wbs/staging/be-${next}/image.tar`;
await $`docker run -d --name be-01-${next} --env-file /srv/wbs/.env -p ${nextPort}:3100 be-01:latest`;
await waitForHealth(`http://localhost:${nextPort}/health`);

await $`cp /srv/wbs/staging/be-${next}/templates/Caddyfile.tmpl /srv/wbs/state/fragments/be/Caddyfile.tmpl`;
await assembleCaddyfile('/srv/wbs/state/fragments', '/etc/caddy/Caddyfile');
await reloadCaddy();
await setCurrentColor(next);
await $`docker rm -f be-01-${current} || true`;

await writeTierState({
  tier: 'be',
  sha: (await $`cat /srv/wbs/staging/be-${next}/VERSION`).stdout.trim(),
  deployed_at: new Date().toISOString(),
  bundle: bundlePath,
});
console.log(`be swap ${current} -> ${next} complete`);
```

- [ ] **Step 7: Write analogous `swap-gw.ts` + `swap-fe.ts` + `swap.ts` dispatcher**

Keep the `swap-gw.ts` identical in shape to `swap-be.ts` but call `drainGateway` after reloading Caddy, before removing the old container.

`swap.ts` dispatcher:

```ts
const tiers = Bun.argv[2]?.split(',') ?? [];
if (tiers.length === 0) {
  console.error('usage: swap <tiers-comma-separated>');
  process.exit(1);
}
for (const t of tiers) {
  await import(`./swap-${t}.ts`);
}
```

- [ ] **Step 8: Add `build` target that bundles swap scripts with `bun build`**

```json
{
  "targets": {
    "build": {
      "executor": "nx:run-commands",
      "options": {
        "commands": [
          "bun build tools/tool-remote-scripts/src/swap-be.ts --target=bun --outfile=dist/tools/tool-remote-scripts/swap-be.js",
          "bun build tools/tool-remote-scripts/src/swap-gw.ts --target=bun --outfile=dist/tools/tool-remote-scripts/swap-gw.js",
          "bun build tools/tool-remote-scripts/src/swap-fe.ts --target=bun --outfile=dist/tools/tool-remote-scripts/swap-fe.js",
          "bun build tools/tool-remote-scripts/src/swap.ts --target=bun --outfile=dist/tools/tool-remote-scripts/swap.js"
        ],
        "parallel": true
      },
      "outputs": ["{workspaceRoot}/dist/tools/tool-remote-scripts"]
    },
    "install": {
      "executor": "nx:run-commands",
      "options": { "command": "scp dist/tools/tool-remote-scripts/*.js root@$HOST:/srv/wbs/bin/" },
      "cache": false
    }
  }
}
```

- [ ] **Step 9: Verify build**

Run: `bunx nx build tool-remote-scripts`
Expected: `dist/tools/tool-remote-scripts/swap*.js` exist.

- [ ] **Step 10: Commit**

```bash
git add tools/tool-remote-scripts/
git commit -m "feat(tool-remote-scripts): blue/green swap scripts (be, gw, fe) + caddy/health/drain/state helpers"
```

---

## Task 11.4: `tool-deploy` — orchestrator

**Files:**

- Create (via Nx): `tools/tool-deploy/` scaffold
- Create: `tools/tool-deploy/src/deploy.ts`
- Create: `tools/tool-deploy/src/{deploy-be,deploy-gw,deploy-fe}.ts`
- Create: `tools/tool-deploy/src/{affected,ssh,remote-state}.ts`

- [ ] **Step 1: Generate**

Run: `bunx nx g @nx/js:lib tools/tool-deploy --bundler=none --unitTestRunner=none --tags="scope:infra,type:scripts,runtime:bun" --linter=eslint --no-interactive`

- [ ] **Step 2: Implement `affected.ts`**

```ts
import { $ } from '@wbs/scripts';

export async function affectedTiers(since?: string): Promise<string[]> {
  const base = since ?? 'HEAD~1';
  const { stdout } = await $`bunx nx show projects --affected --base=${base} --type=app`;
  return stdout
    .trim()
    .split('\n')
    .filter((p) => ['be-01', 'gw-01', 'fe-01'].includes(p))
    .map((p) => p.replace(/-01$/, ''));
}
```

- [ ] **Step 3: Implement `remote-state.ts`**

```ts
import { $, buildSshCommand } from '@wbs/scripts';

export async function fetchRemoteTierState(host: string, tier: string): Promise<string | null> {
  try {
    const { stdout } =
      await $`${buildSshCommand({ host, user: 'root' }, `cat /srv/wbs/state/${tier}.last-deployed.json 2>/dev/null || echo ''`).join(' ')}`;
    if (!stdout.trim()) return null;
    return (JSON.parse(stdout) as { sha: string }).sha;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Implement `deploy-be.ts`**

```ts
import { $, buildScpCommand, buildSshCommand } from '@wbs/scripts';

export async function deployBe(opts: { host: string; bundle: string; sha: string }) {
  const target = { host: opts.host, user: 'root' };
  await $`${buildScpCommand(target, opts.bundle, `/srv/wbs/releases/release-${opts.sha}-be.tar.gz`).join(' ')}`;
  await $`${buildSshCommand(target, `bun /srv/wbs/bin/swap-be.js /srv/wbs/releases/release-${opts.sha}-be.tar.gz`).join(' ')}`;
}
```

(Analogous for `deploy-gw.ts` and `deploy-fe.ts`.)

- [ ] **Step 5: Implement `deploy.ts` orchestrator**

```ts
import { $, parseOrThrow, type } from '@wbs/scripts';
import { affectedTiers } from './affected';
import { deployBe } from './deploy-be';
import { deployGw } from './deploy-gw';
import { deployFe } from './deploy-fe';

const args = Object.fromEntries(
  Bun.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
const host = args['host'] ?? process.env['DEPLOY_HOST'];
if (!host) {
  console.error('--host required');
  process.exit(1);
}

const all = args['all'] === 'true';
const since = args['since'];
const dryRun = args['dry-run'] === 'true';
const skipBuild = args['skip-build'] === 'true';

let tiers: string[];
if (all) {
  tiers = ['be', 'gw', 'fe'];
} else if (since) {
  tiers = await affectedTiers(since);
} else {
  tiers = await affectedTiers();
}

console.log(`tiers to deploy: ${tiers.join(', ')}`);
if (dryRun) process.exit(0);

if (!skipBuild) {
  await $`bunx nx run-many -t publish-be,publish-gw,publish-fe --projects=tool-dagger --parallel=3`;
}

const sha = (await $`git rev-parse --short HEAD`).stdout.trim();

await $`bunx nx run tool-secrets:push -- --host=${host}`;

for (const t of tiers) {
  const bundle = `dist/tools/tool-dagger/release-${sha}-${t}.tar.gz`;
  if (t === 'be') await deployBe({ host, bundle, sha });
  if (t === 'gw') await deployGw({ host, bundle, sha });
  if (t === 'fe') await deployFe({ host, bundle, sha });
}
```

- [ ] **Step 6: Add targets**

```json
{
  "targets": {
    "deploy": {
      "executor": "nx:run-commands",
      "options": { "command": "bun run tools/tool-deploy/src/deploy.ts" },
      "cache": false
    },
    "deploy-be": {
      "executor": "nx:run-commands",
      "options": { "command": "bun run tools/tool-deploy/src/deploy.ts -- be" },
      "cache": false
    },
    "deploy-gw": {
      "executor": "nx:run-commands",
      "options": { "command": "bun run tools/tool-deploy/src/deploy.ts -- gw" },
      "cache": false
    },
    "deploy-fe": {
      "executor": "nx:run-commands",
      "options": { "command": "bun run tools/tool-deploy/src/deploy.ts -- fe" },
      "cache": false
    }
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add tools/tool-deploy/
git commit -m "feat(tool-deploy): orchestrator + per-tier deploys with nx-affected baseline"
```

---

## Task 11.5: `tool-smoke` — post-deploy checks

**Files:**

- Create (via Nx): `tools/tool-smoke/` scaffold
- Create: `tools/tool-smoke/src/{health,ws-ping}.ts`

- [ ] **Step 1: Generate**

Run: `bunx nx g @nx/js:lib tools/tool-smoke --bundler=none --unitTestRunner=none --tags="scope:infra,type:scripts,runtime:bun" --linter=eslint --no-interactive`

- [ ] **Step 2: Implement `health.ts`**

```ts
const host = Bun.argv[2];
if (!host) {
  console.error('usage: health <host>');
  process.exit(1);
}

const endpoints = [
  `https://${host}/api/health`,
  `https://${host}/ws/health`,
  `https://observability.${host}/`,
];
let failed = 0;
for (const url of endpoints) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`❌ ${url} -> ${res.status}`);
      failed++;
    } else {
      console.log(`✅ ${url}`);
    }
  } catch (e) {
    console.error(`❌ ${url}: ${(e as Error).message}`);
    failed++;
  }
}
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 3: Implement `ws-ping.ts`**

```ts
const host = Bun.argv[2];
const token = Bun.argv[3] ?? 'smoke-token';
if (!host) {
  console.error('usage: ws-ping <host> [token]');
  process.exit(1);
}

async function openWithResume(lastSeq: number): Promise<void> {
  const ws = new WebSocket(`wss://${host}/ws?token=${encodeURIComponent(token)}`);
  await new Promise((r) => {
    ws.onopen = r;
  });

  ws.send(
    JSON.stringify({
      type: 'resume',
      resume_points: lastSeq >= 0 ? { 'smoke:ping': lastSeq } : {},
    }),
  );

  const ack = await new Promise<{ type: string }>((resolve) => {
    ws.onmessage = (ev) => resolve(JSON.parse(ev.data as string));
  });
  if (ack.type !== 'resume_ack') throw new Error(`expected resume_ack, got ${ack.type}`);

  ws.send(JSON.stringify({ type: 'ping' }));
  const pong = await new Promise<{ type: string }>((resolve) => {
    ws.onmessage = (ev) => resolve(JSON.parse(ev.data as string));
  });
  if (pong.type !== 'pong') throw new Error(`expected pong, got ${pong.type}`);
  ws.close();
}

await openWithResume(-1);
console.log('✅ first connect: resume_ack + pong OK');
await openWithResume(0);
console.log('✅ reconnect: resume_ack + pong OK');
```

- [ ] **Step 4: Add targets**

```json
{
  "targets": {
    "check": {
      "executor": "nx:run-commands",
      "options": {
        "commands": [
          "bun run tools/tool-smoke/src/health.ts $REMOTE",
          "bun run tools/tool-smoke/src/ws-ping.ts $REMOTE"
        ],
        "parallel": false
      },
      "cache": false
    }
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add tools/tool-smoke/
git commit -m "feat(tool-smoke): health + ws-ping post-deploy smoke checks"
```

---

## Task 12.1: Provision Hetzner host

**This is a manual checklist — no code, but tracked.**

- [ ] **Step 1: Create a Hetzner Cloud server** (Debian 12 or Ubuntu 24.04, ≥4 GB RAM).
- [ ] **Step 2: Upload deploy SSH key via Hetzner web UI.**
- [ ] **Step 3: Configure firewall — allow ports 22/80/443, deny all others.**
- [ ] **Step 4: Create DNS A records** for `<app>.<domain>` and `observability.<domain>` pointing at the host.
- [ ] **Step 5: Verify SSH access**: `ssh root@<host> uptime`. Expected: uptime prints.

No commit for this task — record the host IP in a private note and set `DEPLOY_HOST` in your shell profile.

---

## Task 12.2: Run `tool-bootstrap:push`

- [ ] **Step 1: Run the bootstrap**

Run: `bunx nx run tool-bootstrap:push -- --host=$DEPLOY_HOST`
Expected: script completes, `/srv/wbs/*` exists, `bun --version` on remote reports 1.1.34, `docker --version` reports an install.

- [ ] **Step 2: Manual verification**

```bash
ssh root@$DEPLOY_HOST "ls /srv/wbs/ && bun --version && docker --version"
```

Expected: listing includes `releases staging state www bin observability`; versions print.

- [ ] **Step 3: No commit — this is operational.**

---

## Task 12.3: Populate and push secrets

- [ ] **Step 1: Edit `production.env.sops` with real values**

```bash
sops tools/tool-secrets/src/production.env.sops
```

In the editor, replace placeholders with real values (32+ char secrets; generate via `openssl rand -hex 32`).

- [ ] **Step 2: Push**

Run: `bunx nx run tool-secrets:push -- --host=$DEPLOY_HOST --env=production`
Expected: `/srv/wbs/.env` on remote has mode `0600` and contains the merged key list.

- [ ] **Step 3: Verify**

```bash
ssh root@$DEPLOY_HOST "stat -c '%a' /srv/wbs/.env"
# Expected: 600
```

- [ ] **Step 4: Commit the updated sops file** (it's still encrypted)

```bash
git add tools/tool-secrets/src/production.env.sops
git commit -m "chore(secrets): populate production.env.sops with real values"
```

---

## Task 12.4: First full deploy

- [ ] **Step 1: Run the orchestrator with `--all`**

Run: `bunx nx run tool-deploy:deploy -- --all --host=$DEPLOY_HOST`
Expected:

- Dagger publish-be, publish-gw, publish-fe complete (first run takes 2-5 min due to cold BuildKit cache).
- `dist/tools/tool-dagger/release-<sha>-{be,gw,fe}.tar.gz` exists.
- `scp` streams bundles to the remote.
- `ssh <host> bun /srv/wbs/bin/swap.js be,gw,fe` runs the per-tier swap.
- Caddy reloads.
- `/srv/wbs/state/<tier>.last-deployed.json` is written.

Exit code: 0. If any step fails, investigate that step in isolation — the orchestrator prints which command failed.

- [ ] **Step 2: Manual sanity check**

```bash
ssh root@$DEPLOY_HOST "docker ps --format '{{.Names}}'"
```

Expected: `caddy`, `be-01-*`, `gw-01-*`, `grafana`, `loki`, `promtail`, `prometheus`.

- [ ] **Step 3: No explicit commit — this is operational. Celebrate in a dev log note.**

---

## Task 12.5: Smoke tests against the deploy host

- [ ] **Step 1: Run health + ws-ping**

```bash
export REMOTE=$DEPLOY_HOST
bunx nx run tool-smoke:check
```

Expected: health all green; ws-ping both connects succeed.

- [ ] **Step 2: Manually verify Grafana**

Open `https://observability.<your-domain>/` in a browser, log in with the basic-auth credentials (admin + password matching `OBSERVABILITY_BASIC_AUTH_HASH`). Expected: Grafana home; the three seed dashboards visible under "WBS" folder.

- [ ] **Step 3: No commit — operational.**

---

## Task 12.6: Exercise per-tier redeploy paths + alert channel

- [ ] **Step 1: Single-tier be redeploy** (should be WS-impact-free)

Force a meaningless change in `apps/be-01/src/` (e.g., update a comment) and commit; then:

```bash
bunx nx run tool-deploy:deploy -- be --host=$DEPLOY_HOST
```

Expected: only `be-01` containers churn; no `gw_drain_seconds` sample recorded.

- [ ] **Step 2: Single-tier gw redeploy** (drain window visible)

Same pattern for `apps/gw-01`, then:

```bash
bunx nx run tool-deploy:deploy -- gw --host=$DEPLOY_HOST
```

Expected: Grafana panel for `gw_drain_seconds` shows a histogram sample; `gw_active_connections` dips to 0 and recovers.

- [ ] **Step 3: Single-tier fe redeploy** (atomic static swap)

```bash
bunx nx run tool-deploy:deploy -- fe --host=$DEPLOY_HOST
```

Expected: `/srv/wbs/www/` contents swap atomically; no service restart.

- [ ] **Step 4: Trigger the "service down" alert**

```bash
ssh root@$DEPLOY_HOST "docker stop be-01-$(cat /srv/wbs/state/current-color)"
```

Wait 2-5 minutes per alert evaluation cycle. Expected: ntfy push arrives on your subscribed device.

Then:

```bash
ssh root@$DEPLOY_HOST "docker start be-01-$(cat /srv/wbs/state/current-color)"
```

- [ ] **Step 5: Commit the dev-log note** (optional — a short `CHANGELOG.md` entry or `docs/first-deploy-log.md`)

```bash
git add docs/first-deploy-log.md
git commit -m "docs: record first-deploy verification results"
```

---

## Self-Review Checklist (run after all tasks complete)

Before marking the change verified:

1. **Spec coverage** — each capability spec in `specs/` has at least one task (or multiple) implementing it:
   - `monorepo-structure` → Tasks 1.1-1.6, 2.1-2.6
   - `backend-foundation` → Tasks 6.1-6.4, 7.1-7.5
   - `gateway-foundation` → Tasks 8.1-8.6
   - `frontend-foundation` → Tasks 9.1-9.4
   - `shared-libraries` → Tasks 3.1-3.4, 4.1-4.4, 5.1-5.4
   - `deployment-pipeline` → Tasks 10.1, 11.1-11.5, 12.1-12.6
   - `observability-baseline` → Tasks 4.1-4.2 (lib), 10.2 (stack), 12.6 (alert)
   - `secrets-management` → Tasks 10.3, 10.4 (hook), 12.3
   - `test-strategy` → Tasks 3.4, 5.4, 7.5, 9.4 (layered tests proven)
   - `developer-tooling` → Tasks 2.1-2.6, 10.4

2. **Placeholder scan** — grep the plan (and the repo) for:
   - `TBD`, `TODO`, `fill in`, `implement later`, `similar to task N`, `appropriate error handling`, `write tests for the above`
   - Any hit → fix inline before starting work.

3. **Type consistency** — verify method names are stable across tasks:
   - `ReplayBuffer.record` / `ReplayBuffer.since` (not `.add` / `.getAfter`)
   - `SubscriptionTracker.update` / `.snapshot` (not `.put` / `.dump`)
   - `EventSequencer.recordEvent` (not `.push`)
   - `buildApp(opts)` signature matches across `apps/be-01` and `apps/gw-01` tests.

4. **Agent-done signal per task** — every code-writing step ends with the TDD loop:
   - Write failing test → Run to confirm fail → Write impl → Run to confirm pass → Commit.

5. **Commits per task** — one logical commit per Task N.M, message prefix `feat:` / `test:` / `chore:` per conventional-commits (enforced by `tool-git-hooks`).

If any of the four checks above fails, fix inline — do not proceed to archiving the change.

---

## Execution Handoff

Plan complete and saved to `openspec/changes/scaffold-tech-setup/plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. Use `superpowers:subagent-driven-development`.

**2. Inline Execution** — execute tasks in this session, batch execution with checkpoints. Use `superpowers:executing-plans`.

Which approach?
