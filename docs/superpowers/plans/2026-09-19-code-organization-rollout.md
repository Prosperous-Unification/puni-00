# Code Organization Rollout Implementation Plan

> **For agentic workers:** Use `executing-plans` to implement this plan one task at a time. Steps use checkbox syntax. Read the spec and the task's files, callers and tests before editing.

**Goal:** Roll out the four-kind service taxonomy, the module layout, the frontend rules and the three-axis test system across the monorepo, in observe, then ratchet, then enforce mode.

**Architecture:** Decide and record first, then classify what exists without moving it, then add checks that can fail, then extract and move code one module at a time with existing tests as the oracle. ESLint gives fast feedback inside a file; Twilight Burokrat's import graph is the authoritative check, because a barrel import hides a file suffix from a lint pattern.

**Tech stack:** Bun 1.4.2, Nx, TypeScript native 7.0.2 and classic 6.0.3, ESLint flat config, Vitest and Bun's test runner, Playwright, OpenSpec 1.12.0, DI Bag 0.4.0.

**Spec:** [Code organization design](../specs/2026-09-19-code-organization-design.md). Names follow [names and boundaries](../../twilight-structure/names.md).

**Status:** Proposed on 2026-09-19. Nothing has started.

## Global constraints

- Rules K1 to K9, F1 to F8, T1 and T2 are defined in the spec; this plan never restates them differently.
- Enforced from the start: F1, F2, F3, F7. Recommended practice first: F4, F5, F6, F8.
- No behaviour changes in an extraction task. An extraction that needs a behaviour change stops and opens its own OpenSpec change.
- Every new or changed check gets a production-path negative: watch it fail with the check removed or the fault injected, then add the adjacent `Proof:` comment naming the fault and the observed test.
- Dany declared WBS detached from its former upstream repository on 2026-09-19. Every task in this plan, including the ones that touch WBS application and library source, is authored in this repository.
- DI Bag versions and their adoption order are owned by the [package adoption plan](2026-09-17-personal-package-adoption.md). This plan consumes its results and does not install packages.
- Bun and Nx only. Commit with hooks enabled. Never `--no-verify`. On the shared build host, gate with the gate script and the commit hash; do not check the commit out first.

## File structure

New files this plan creates, by responsibility:

```text
docs/adr/<next>-services-have-a-kind-and-one-direction.md   the decision and its alternatives
openspec/changes/service-taxonomy/                          architectural capability: rules K1-K9, F1-F3, F7
openspec/changes/test-axes/                                 architectural capability: levels, T1, T2, identifiers
docs/code-organization/kinds.json                           observe-mode classification of existing services
docs/code-organization/size-ceilings.json                   F7 ratchet: files above the ceiling and their pinned size
tools/tool-devsync/src/service-kinds.ts                     reads kinds.json and the tree; pure planner
tools/tool-devsync/src/service-kinds.test.ts                inventory completeness and negatives
tools/tool-devsync/src/size-ceilings.test.ts                F7 ratchet test
tools/tool-devsync/src/kind-direction.test.ts               lint negatives for F1 and K2-K5
```

The classification and ceilings live under a documents directory because they are reviewed policy, not code. They move into Twilight Burokrat's policy when it gains the kind checks in Task 9.

## Tasks

### Task 1: Record the decision

**Files:** create the ADR with the next free number in the decisions directory; create the two OpenSpec changes named in the file structure, each with `proposal.md`, delta specs, `design.md`, `tasks.md` and `verify.md`.

- [ ] Allocate the ADR number from the live tree at the moment of writing:

```sh
ls docs/adr | tail -1
```

- [ ] Write the ADR in the format at `.agents/skills/domain-modeling/ADR-FORMAT.md`. Decision: services have one of four kinds and depend in one direction, with strict layering. Alternatives with reasons for rejection: relaxed layering, where a feature may reach a repository; vertical slices with no uniform layers; package by layer. Consequence to state plainly: three hops for plain create and rename operations.
- [ ] Create the first change and read the real instructions before writing each artifact:

```sh
bunx @fission-ai/openspec@1.12.0 new change service-taxonomy
bunx @fission-ai/openspec@1.12.0 instructions intent --change service-taxonomy --json
```

- [ ] Write its delta spec as an ADDED architectural capability. Model it on the ring requirements of the core extraction capability, whose first requirement is that every project declares its ring. One requirement per rule, each with a normal scenario, a failure scenario and the inapplicable cases named. Intent stays within 400 words.
- [ ] Repeat for the second change, `test-axes`.
- [ ] Settle open item 1 of the spec inside `test-axes`: add an identifier comment to one scenario of a scratch capability and validate.

```sh
bunx @fission-ai/openspec@1.12.0 validate --all --json |
  jq -e '.summary.totals.failed == 0 and .summary.totals.passed > 0'
```

- [ ] Record the observed result in the change's `verify.md`. If validation refuses the comment, record the refusal text and adopt the ledger fallback from the spec in the same change.

**Deliverable:** one accepted ADR and two reviewable changes. No code yet.

### Task 2: Classify every existing service, observe mode

**Files:** create `docs/code-organization/kinds.json`, `tools/tool-devsync/src/service-kinds.ts`, `tools/tool-devsync/src/service-kinds.test.ts`; add the JSON file to the Nx cache inputs of the devsync project.

**Interfaces:**

```ts
export type ServiceKind = 'feature' | 'resource' | 'repository' | 'delivery' | 'support';

export interface KindEntry {
  readonly path: string;
  readonly kind: ServiceKind;
  /** Required for a feature: the OpenSpec capability it serves. */
  readonly capability?: string;
  /** Required for a resource: the glossary term it is named after. */
  readonly term?: string;
  /** Required for support: why it is none of the four kinds and where it should end up. */
  readonly disposition?: string;
}

/** Every tracked file the taxonomy must account for, sorted. Throws if the tree cannot be read. */
export function listServiceCandidates(workspaceRoot: string): Promise<readonly string[]>;

/** Parses and validates the classification file. Throws on absence, unreadability or malformed entries. */
export function readKinds(workspaceRoot: string): Promise<readonly KindEntry[]>;
```

- [ ] Write the failing test first:

```ts
import { expect, test } from 'bun:test';

import { listServiceCandidates, readKinds } from './service-kinds';

const workspace = new URL('../../..', import.meta.url).pathname;

test('every service candidate is classified exactly once and nothing stale remains', async () => {
  const candidates = await listServiceCandidates(workspace);
  const classified = (await readKinds(workspace)).map((entry) => entry.path).sort();
  expect(classified).toEqual([...candidates]);
});

test('a feature names its capability and a resource names its glossary term', async () => {
  for (const entry of await readKinds(workspace)) {
    if (entry.kind === 'feature') expect(entry.capability, entry.path).toBeTruthy();
    if (entry.kind === 'resource') expect(entry.term, entry.path).toBeTruthy();
    if (entry.kind === 'support') expect(entry.disposition, entry.path).toBeTruthy();
  }
});
```

- [ ] Define two listings, as packet 020.8 of batch 1 specifies them. `listServiceCandidates` returns the non-test TypeScript files under the core's services and use-cases directories and the backend application's service directory that carry no kind suffix; each of them owes a classification entry. `listSuffixDeclaredFiles` returns every file anywhere whose name carries a kind suffix; those owe nothing, and a file with both a suffix and an entry is refused. Frontend hooks are not candidates until they are extracted.
- [ ] Run the test and watch it fail on the missing classification file. Then fill the file by reading each candidate's callers and tests. The spec's backend table is a first reading from file names, not an answer.
- [ ] Negatives, each watched failing through the real test: delete one entry; add an entry for a path that does not exist; remove the set comparison from the test and confirm an unclassified file no longer fails. Test an absent classification file separately from a malformed one. Add the `Proof:` comments after observing them.
- [ ] Verify:

```sh
bunx nx run tool-devsync:test --skip-nx-cache
```

**Deliverable:** a reviewed map of every existing service to a kind, a capability or term, and a list of support files with dispositions. Nothing moved, nothing fails outside the inventory.

### Task 3: Make the direction rules able to fail

**Files:** modify `apps/wbs/eslint.product.mjs`; create `tools/tool-devsync/src/kind-direction.test.ts`.

- [ ] Write the negatives first, in the established style of the boundary tests, which lint source text under a virtual path:

```ts
import { fileURLToPath } from 'node:url';

import { expect, test } from 'bun:test';
import { ESLint } from 'eslint';

const workspace = fileURLToPath(new URL('../../..', import.meta.url));
const lint = new ESLint({ cwd: workspace });

async function ruleIds(path: string, source: string): Promise<readonly (string | null)[]> {
  const [report] = await lint.lintText(source, { filePath: path });
  return report.messages.map((message) => message.ruleId);
}

const FE = 'apps/wbs/fe-01/src/modules/example';

test('F1: a service file cannot import React', async () => {
  const ids = await ruleIds(
    `${FE}/example.feature.ts`,
    "import { useState } from 'react';\nvoid useState;\n",
  );
  expect(ids).toContain('no-restricted-imports');
});

test('F1 positive: a component may import React', async () => {
  const ids = await ruleIds(
    `${FE}/view/example.tsx`,
    "import { useState } from 'react';\nvoid useState;\n",
  );
  expect(ids).not.toContain('no-restricted-imports');
});

test('K3: a feature-service cannot import a repository', async () => {
  const ids = await ruleIds(
    `${FE}/example.feature.ts`,
    "import { open } from './example.repository';\nvoid open;\n",
  );
  expect(ids).toContain('no-restricted-imports');
});

test('K4: a resource-service cannot import a feature-service', async () => {
  const ids = await ruleIds(
    `${FE}/example.resource.ts`,
    "import { run } from './example.feature';\nvoid run;\n",
  );
  expect(ids).toContain('no-restricted-imports');
});

test('K2: delivery cannot import a resource-service', async () => {
  const ids = await ruleIds(
    `${FE}/view/example.tsx`,
    "import { feed } from '../example.resource';\nvoid feed;\n",
  );
  expect(ids).toContain('no-restricted-imports');
});
```

- [ ] Run and watch all four negatives fail because no rule exists yet.
- [ ] Add one block per kind to the product policy. ESLint replaces a rule's options across matching blocks; it does not merge them. Before adding a block, list the blocks that already configure `no-restricted-imports` or its TypeScript variant for the same files, and carry their restrictions into the new block, so no existing fence is silently dropped. The service block:

```js
{
  files: ['**/*.feature.ts', '**/*.resource.ts', '**/*.repository.ts'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          { name: 'react', message: 'F1: a service is plain TypeScript. Put React in the view.' },
          { name: 'react-dom', message: 'F1: a service is plain TypeScript. Put React in the view.' },
        ],
        patterns: [
          { group: ['react/*', 'react-dom/*', '@tanstack/react-*'], message: 'F1: no React in a service.' },
        ],
      },
    ],
  },
},
```

- [ ] Add the direction patterns the same way: feature files restrict `**/*.repository`; resource files restrict `**/*.feature`; view files and controllers restrict `**/*.resource` and `**/*.repository`.
- [ ] Run and watch the tests pass. Remove each pattern once, watch its negative fail, restore it, and add the `Proof:` comment.
- [ ] State the limit in the rule's JSDoc: an import through a barrel or an alias hides the suffix, so lint is the fast check and Task 9 is the authoritative one.
- [ ] Verify:

```sh
bunx nx run tool-devsync:test --skip-nx-cache
bunx nx run wbs-fe-01:lint:fast
```

**Deliverable:** rules F1, K2, K3 and K4 fail on a violating file. No production file has a kind suffix yet, so nothing else changes.

### Task 4: Ratchet file size

**Files:** create `docs/code-organization/size-ceilings.json`, `tools/tool-devsync/src/size-ceilings.test.ts`.

- [ ] Measure before choosing, and record the distribution in the change's `verify.md`:

```sh
git ls-files apps libs | grep -E '\.tsx?$' |
  grep -v -E '\.(test|spec)\.' | xargs wc -l | sort -rn | head -40
```

- [ ] Choose the ceiling from the measured distribution and write it into the JSON file with the date and the reason. Every file above it is listed with its current line count as its pinned maximum.
- [ ] Write the test: a production source file not listed may not exceed the ceiling; a listed file may not exceed its pinned maximum; a listed file that has dropped under the ceiling must be removed from the list, so the list only shrinks.
- [ ] Negatives: append lines to a scratch copy of a listed file through the test's own fixture path; add an unlisted file over the ceiling; remove the comparison and watch the fault pass.

**Deliverable:** no file grows past the ceiling and the large files can only shrink. The 6,422-line Gantt panel is pinned, not yet split.

### Task 5: Give tests their three axes

**Files:** the `test-axes` change from Task 1; modify the project files of the backend application, the frontend application and the core library to add level targets; no new library.

- [ ] Name one Nx target per level on every project that has tests at that level, keeping the existing `test` and `test:unit` targets as they are: add `test:api` for database test files, `test:view` for the frontend DOM tier, `test:browser` as an alias of the existing browser target. Do not rename or remove an existing target; the gate and CI call them.
- [ ] Make every runner write a JUnit report into one ignored directory per project. Bun's runner takes `--reporter=junit --reporter-outfile=<file>`; Vitest and Playwright have JUnit reporters.
- [ ] Adopt the title convention from the spec: a test that proves a scenario starts its title with the identifier in square brackets.
- [ ] Apply it first to one capability end to end. Use plan refresh, which already has an accepted specification with nine requirements and tests at three levels. Allocate its scenario identifiers, cite them in its existing tests, and produce the first scenario coverage table by hand in the change's `verify.md`. This is the worked example every later capability copies.
- [ ] Record the uncovered scenarios the exercise finds as findings, not as fixes.

**Deliverable:** levels are runnable one at a time, reports carry scenario identifiers, and one capability shows the full join. Rule T2 is not enforced yet.

### Task 6: Extract the frontend services

One service per task, each its own commit and review, in this order. The existing tests of the source hook are the oracle and stay green without edits to their assertions.

| Order | Service          | Source today                                                                                     | Why this order                                          |
| ----- | ---------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| 1     | Plan writer      | The gesture runner in the plan read hook                                                         | Most policy, best tests, every command depends on it    |
| 2     | Plan feed        | Refresh owner, stream and roster, three wiring sites                                             | Removes most staleness guards                           |
| 3     | Command services | The fields, structure, dependencies, estimates and reference hooks, then toolbar and table calls | One at a time; each becomes a service plus a small hook |
| 4     | Directory        | The directory page and the plan pickers                                                          | Independent; removes the duplicated interface methods   |
| 5     | Preferences      | The remembered-state and theme modules, three stray storage users                                | Independent, low risk                                   |
| 6     | Lifetimes        | New composition roots for application, session and project                                       | Needs every service above to exist                      |

For each service:

- [ ] Read the source hook, its callers and its tests. List the React dependencies it truly has; everything else moves.
- [ ] Create the module directory with the layout from the spec. Write the contract first.
- [ ] Write the service's unit test in the node tier before moving code. It uses fake ports and no DOM.
- [ ] Move the logic. The hook becomes a thin adapter that reads the service from context and bridges its store with React's external store hook.
- [ ] Run the hook's existing tests unchanged, then the module's isolated type check, then the frontend lint and tests.
- [ ] Every staleness guard that the move makes unnecessary is removed in the same task, and its `Proof:` comment moves with the test that still proves the behaviour. A proof comment is never deleted without its test.

The session lifetime is keyed by user identity. The session check sets an empty token for cookie sessions today, so the memos keyed on the token are vestigial after a reload; the task that introduces the session lifetime removes them.

**Deliverable:** the frontend core is framework-free, has composition roots, and its large hooks are adapters.

### Task 7: Split the backend core's services into modules

Starts after Task 2's classification is reviewed.

- [ ] Resolve every support file first, following its recorded disposition: move domain code to the domain library, make a disguised repository a port and adapter, or make the file a private member of the one module that uses it.
- [ ] Create one module directory per resource and per feature, with the layout from the spec. Move files with `git mv`, so history follows them. The flat services directory holds about 45 files today, past the forty-entry navigation limit of the wiki design.
- [ ] Give each file its kind suffix as it moves. The classification entry for that path is deleted in the same commit, because the suffix now carries the declaration.
- [ ] Keep the public surface of the core barrel unchanged. The extraction capability already requires that a move changes no behaviour; run its checks.
- [ ] Verify with the core's tests, both store conformance targets and the portable browser test.

**Deliverable:** the backend core is organized by module, every file declares its kind, and no consumer changed.

### Task 8: Adopt DI Bag at the composition roots

Owned by the [package adoption plan](2026-09-17-personal-package-adoption.md), which must be amended first as its status note says. This plan adds two requirements to it: each module from Tasks 6 and 7 is a sealed DI Bag module labelled with its name, and the frontend adopts DI Bag at its three lifetimes, which reverses that plan's earlier frontend exclusion.

**Deliverable:** modules are installable units with compile-time graph checks.

### Task 9: Hand the checks to Twilight Burokrat

Its design is the [Twilight Burokrat rules design](../specs/2026-09-19-twilight-burokrat-rules-design.md). This plan fixes only what it must take over.

- [ ] The kind inventory and the size ceilings move from the devsync tests into the Burokrat's policy, in ratchet mode.
- [ ] Rules K2 to K6 are checked on the file-level import graph the Burokrat already extracts, which sees through barrels and aliases.
- [ ] Rule K8 is checked from the migration table facts it already extracts.
- [ ] Rule K9 and the scenario join need an OpenSpec requirement selector, which does not exist yet.
- [ ] The two coverage ledgers replace the hand-made table from Task 5.
- [ ] Only then is rule T2 enforced.

**Deliverable:** the rules are judged from a Git revision by one tool, and the temporary devsync tests are deleted.

## Order and dependencies

```text
1 -> 2 -> 7
1 -> 3 -> 6 -> 8
1 -> 4
1 -> 5 -> 9
2, 3, 4 -> 9
```

Tasks 2, 3, 4 and 5 are independent after Task 1 and can run in parallel lanes, because they touch different files. Tasks 6 and 7 touch different trees, the frontend application and the backend core, so they can proceed in parallel with each other.

## Verification

| Guarantee                        | Test or fault                                                     | Evidence in `verify.md`                          |
| -------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------ |
| Every service has a kind         | Add an unclassified service file; delete an entry                 | The inventory test names the path                |
| Direction rules can fail         | One violating import per rule through the real lint configuration | Rule identifier reported; passes when removed    |
| Files only shrink                | Grow a pinned file; add an oversized file                         | The ratchet test names the file and both numbers |
| Levels run alone                 | Run each level target on each project                             | Command, exit status, report path                |
| Extraction changed no behaviour  | The source hook's existing tests, unedited                        | Same assertions, same results                    |
| The core move changed no surface | The extraction capability's checks and both conformance suites    | Observed passes on the moved tree                |

Commands for the eventual implementation, not commands claimed to have passed during planning:

```sh
bunx nx run tool-devsync:test --skip-nx-cache
bunx nx run wbs-fe-01:test:unit
bunx nx run wbs-core:test --skip-nx-cache
bunx @fission-ai/openspec@1.12.0 validate --all --json
```

## Self-review

- Spec coverage: kinds and direction are Tasks 1 to 3; modules are Tasks 6 to 8; frontend rules F1 and F3 are Task 3, F2 is Task 6's contract step, F7 is Task 4, and F4, F5, F6 and F8 stay recommended practice with no task by design; tests are Task 5; wiki and OpenSpec alignment and the tool handover are Task 9.
- Rule F3 has no lint negative in Task 3 yet, because the primitives layer's import path is decided in Task 6. Task 6's first service adds that negative in the same style.
- No task enforces a rule before a negative for it has been watched failing.
