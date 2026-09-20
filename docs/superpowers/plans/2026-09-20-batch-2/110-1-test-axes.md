# 110.1 Test axes: level targets, JUnit reports, scenario identifiers on one capability

|                                               |                                                                                                                                                                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Work item                                     | 110.1, parent 110 "Also needed". Note on the item: "Feeds the evaluations in the three Twilight Bureaucrat runs."                                                                                                        |
| Size class                                    | L. This packet is its first increment: one capability, three declared level targets, six slices.                                                                                                                         |
| Planning tokens (top model, high effort)      | 6,000,000                                                                                                                                                                                                                |
| Implementation tokens (mid model, mid effort) | 22,000,000                                                                                                                                                                                                               |
| Review tokens (top model, high effort)        | 9,000,000                                                                                                                                                                                                                |
| Change it implements                          | `openspec/changes/test-axes`, task 2.1 in part, and the hand-allocation half of task 2.2                                                                                                                                 |
| Design it serves                              | [code organization design](../../specs/2026-09-19-code-organization-design.md), section "Tests"; [rollout plan](../2026-09-19-code-organization-rollout.md), Task 5                                                      |
| Execution contract                            | [batch 1 README](../2026-09-19-batch-1/README.md), sections "Execution contract", "Rules for every executor" and "Standard blocks every packet uses". Not copied here; where an exact command matters it is written out. |
| Dispatch                                      | `run-executor.sh --batch batch-2` (clone root `/home/df/wd/puni/batch-2`, branch prefix `batch-2/`, temporary root `/tmp/puni-batch2`, packet directory `docs/superpowers/plans/2026-09-20-batch-2`)                     |
| Revision                                      | Third draft, 2026-09-20. Two review dispositions are at the end. Every listing below was written into this worktree, type-checked, linted, formatted, run green, mutated once per guard, and restored byte for byte.     |

## 1. Goal and non-goals

**Goal.** Make one test level runnable alone through an Nx target that writes a
JUnit report; give one OpenSpec capability's scenarios stable identifiers; cite
them in that capability's existing tests; and produce the first scenario
coverage table by hand from the real reports, through a join that refuses a
report it cannot trust.

**Non-goals.** No test is renamed. No existing target is removed, and neither
aggregate `test` target nor either `test:conformance` target is edited. Rule T2
is not enforced: nothing refuses a test for lacking a citation, and an uncovered
scenario is reported while the command still exits zero. TEST-AXES-005's second
half — refusing an _undeclared_ target that spans levels — is deferred
(assumption A8). The identifier allocator is not built. Neither ledger moves
into Twilight Bureaucrat. No file is added under `apps/wiki/cli`, so the
validator identity is unchanged. **No README is added**, so packet 110.6's
change to the README coverage pin in
`tools/tool-devsync/src/repo-namespacing-handoff.test.ts` cannot affect this
packet in either state; no slice inspects or moves that pin.

## 2. The six slices

| Slice | Adds                                                          | Cases in `test-levels.test.ts` after it |
| ----- | ------------------------------------------------------------- | --------------------------------------: |
| S     | The OpenSpec amendment that lets the rollout add targets      |                                     n/a |
| A     | The level-selection table and the project inventory           |                                       5 |
| B     | The level targets, their reports, and the command-shape rules |                                       9 |
| C     | Scenario identifiers and the citations                        |                                      14 |
| D     | The JUnit reader and the join                                 |                                      33 |
| E     | Report provenance, the coverage command, and the table        |                                      35 |

Each slice is dispatched from the reviewed and committed predecessor and has its
own entry conditions, baseline step, changed-path list and commit subject. Every
slice adds only the module and import lines its own cases need, so each one
type-checks and lints on its own — the second review's finding 2.

## 3. Read first

| File                                                              | Why                                                                                                                   |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                                                       | Rules R1 to R5.                                                                                                       |
| `LLM_README.md`                                                   | The router.                                                                                                           |
| `../2026-09-19-batch-1/README.md`                                 | Execution contract, standard blocks, the relative-counts rule.                                                        |
| `openspec/changes/test-axes/specs/test-axes/spec.md`              | The whole delta spec. Slice S edits one sentence; S4 removes one heading and restores it.                             |
| `openspec/changes/test-axes/proposal.md`                          | Slice S edits its Non-Goals.                                                                                          |
| `openspec/changes/test-axes/tasks.md`                             | Tasks 2.1 and 2.2 and the negatives they name. Read only; not ticked (assumption A6).                                 |
| `openspec/changes/test-axes/verify.md`                            | Section 5 shows the proof-table shape each slice appends to; section 7 is the open item slice E answers.              |
| `openspec/specs/project-assignment-reads/spec.md`                 | The chosen capability. Slice C edits it.                                                                              |
| `tools/tool-devsync/src/service-kinds.ts`                         | The precedent for a checker in this tool: JSDoc density and `Proof:` comment placement.                               |
| `tools/tool-devsync/src/workspace-targets.test.ts`                | `source conformance target discovery` and the `test:unit` presence case: section 4.5 says why they bind this packet.  |
| `apps/wiki/cli/src/relationships/committed-target-facts.test.ts`  | The declared `nx-target` facts. Do not edit any target they name.                                                     |
| `nx.json`                                                         | `targetDefaults`. Slice B adds one entry.                                                                             |
| `libs/wbs/adapters/store-sqlite/project.json`                     | Slice B edits it.                                                                                                     |
| `libs/wbs/application/core/project.json`                          | Slice B edits it.                                                                                                     |
| `libs/wbs/adapters/store-sqlite/src/assignment-scope.db.test.ts`  | 124 lines; read it whole. Slice C edits two titles.                                                                   |
| `libs/wbs/application/core/src/service/work-item.service.test.ts` | **2,319 lines.** Read only the `assignment projections isolate memory projects` block; slice C edits one title there. |

## 4. Verified facts, 2026-09-20

Read or run in `/home/df/wd/puni/batch-2-planning`. Counts the executor must
meet are relative to a baseline it records itself, because main has moved.

### 4.1 Bun 1.4.2 writes JUnit, and will not create the directory

`bun --version` prints `1.4.2`; `bun test --help` lists `--reporter=<val>` with
"Available: 'junit' (requires --reporter-outfile), 'dots'" and
`--reporter-outfile=<val>`. The identifier reaches `testcase/@name` unescaped
and `@file` is relative to the runner's working directory, which for these
targets is the project root.

Writing to a path under a missing directory printed `JUnitReportFailed … ENOENT`
and exited **2** although every test passed, so every level target begins
`mkdir -p …/tmp/junit && `. `--reporter=junit` combines with
`--coverage --coverage-reporter=lcov`.

### 4.2 `tmp/` is already ignored

`.gitignore` contains a line `tmp/`, and two projects already write run
artifacts there. Reports go to `tmp/junit/`; no `.gitignore` edit is needed and
`git status --untracked-files=all` never lists them.

### 4.3 The chosen capability is `project-assignment-reads`

Scenario counts across the eleven capabilities in `openspec/specs/`:
`bounded-replay-sweep` 3, `wbs-table-modules` 3, `project-assignment-reads` 3,
`team-removal-revisions` 4, `authentication` 8, `scheduler-runtime-port` 9,
`gateway-request-deadlines` 10, `realtime` 13, `core-lib-extraction` 18,
`plan-refresh` 19, `http-endpoint-port` 24. None carries an identifier today and
no test title in the repository uses the bracket convention today.

Its three scenarios map one-to-one onto three tests; the mapping is recorded in
`openspec/changes/archive/2026-09-08-project-assignment-reads/verify.md`:

| #   | Scenario                                  | Test                                                                                                                        | Level | T2           |
| --- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----- | ------------ |
| 1   | Tiny project among unrelated projects     | `store-sqlite/src/assignment-scope.db.test.ts`, `materializes only assigned project rows and names during a tiny tree read` | API   | cites        |
| 2   | Assignment write among unrelated projects | the same file, `uses an indexed prior assignment read during one assignment write`                                          | API   | cites        |
| 3   | Different projects in the memory fixture  | `core/src/service/work-item.service.test.ts`, `names only the people assigned in the requested project`                     | Unit  | not required |

`bounded-replay-sweep`, `realtime` and `authentication` are proved entirely at
Unit level, so they exercise neither a T2 citation nor an API target;
`wbs-table-modules`'s scenarios sit in fe-01 files of 979, 2,134 and 2,917
lines; `team-removal-revisions` needs an edit inside a 2,126-line file;
`plan-refresh` has 19 scenarios across three files (assumption A2).
`project-assignment-reads` alone puts an API target, a Unit target and the
Conformance precedence rule inside one project.

### 4.4 The level of every test file in the two adopted projects

| Project            | Under `src` | API | Conformance | Unit |
| ------------------ | ----------: | --: | ----------: | ---: |
| `wbs-store-sqlite` |          65 |  56 |           1 |    8 |
| `wbs-core`         |          52 |   0 |           0 |   52 |

The Conformance file is `…/store-sqlite/src/testing/source-conformance.db.test.ts`:
row 6 would call it API, row 2 wins because `wbs-store-sqlite:test:conformance`
names it — scenario TEST-AXES-003 verbatim. Neither project holds a `.spec.ts`,
`_test.ts`, `_spec.ts` or `.test.tsx` under `src`. `wbs-core` holds exactly one
test file outside `src`, `libs/wbs/application/core/testing/portable-composition.spec.ts`,
which its Playwright configuration collects and `wbs-core:test:portable` runs.

### 4.5 Pins this packet must not disturb

| Pin                                                                       | Covers                                                                                                                              | Consequence                                                                                                                                                                                   |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/wiki-policy/relationships*.json`, seven `nx-target` facts           | `wbs-core:test`, `wbs-domain:test`, `wbs-store-memory:test`, `tool-dagger:test`, `twilight-bureaucrat:{test,lint:source,typecheck}` | None is edited. With slice B's `nx.json` entry applied, `committed-target-facts.test.ts` still passed 2 of 2.                                                                                 |
| `workspace-targets.test.ts`, `source conformance target discovery`        | both `test:conformance` commands, and any target whose command **contains** the conformance file path                               | The first draft broke this with `! -path`. `! -name 'source-conformance.db.test.ts'` selects the same 56 files and does not contain the path; the case passed 1 of 1 with `test:api` present. |
| `workspace-targets.test.ts`, the `test:unit` presence case                | which projects declare `test:unit`                                                                                                  | No new `test:unit`; the two existing ones are edited in place.                                                                                                                                |
| `workspace-targets.test.ts`, `every cached target declares what it reads` | only the `test` target's `inputs`                                                                                                   | New level targets impose no input obligation.                                                                                                                                                 |
| `package.json`'s `"test:unit": "nx run-many -t test:unit"`                | the root script's text                                                                                                              | Unchanged. It now writes **two** reports, one per edited unit target.                                                                                                                         |

`wbs-core`'s `test` and `test:unit` are byte-identical today; only `test:unit`
is edited. In `libs/wbs/application/core`, `bun test src` and
`bun test $(find src -name '*.test.ts' | tr '\n' ' ')` collected the same files
and the same total.

**An enforcement case for the `CLAUDECODE`/`AGENT` target defaults already
exists on this tree.** `tools/tool-devsync/src/workspace-targets.test.ts:543`–`577`
(`every test-running target answers the same from an agent shell`,
`sets the agent output variables to 0`) walks the resolved project graph and
requires `options.env.CLAUDECODE === '0'` and `options.env.AGENT === '0'` on
every target whose command runs a test runner. `nx.json:69`–`76` already
carries that default for `test:unit`, with the identical shape for
`test:conformance` (`nx.json:77`–`84`), `test:store` (`nx.json:85`–`92`) and
`test:portable` (`nx.json:93`–`100`) — confirmed with
`grep -n '"CLAUDECODE"' nx.json` and by reading the case. Slice B still adds
the entry for the new `test:api` target name, because a target name gains no
default until one is written for it; B1 already reads `nx.json` first and
copies the shape it finds there. This corrects the second review's finding
11, whose "no such case" observation is stale on this tree.

### 4.6 OpenSpec, and the fault S4 really needs

`OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json`
reported 99 items, 99 passed, 0 failed. With the three identifiers inserted into
`openspec/specs/project-assignment-reads/spec.md` the totals were unchanged.

**TEST-AXES-024 is the wrong fault.** It sits under "Every test resolves to
exactly one level" beside TEST-AXES-001 to 003, so removing it leaves three
scenarios and validation still passes. **TEST-AXES-023 is the sole scenario of
"Manual dispositions expire for review".** Deleting its heading line produced,
observed on 2026-09-20:

```text
✗ [ERROR] test-axes/spec.md: ADDED "Manual dispositions expire for review" must include at least one scenario
```

with totals 99 items, 98 passed, 1 failed. Both probes were restored and
confirmed with `cmp`.

### 4.7 Bun's `-t` filter joins describe and title with one space

A filter on the joined name matched exactly one test. After slice C the titles
carry brackets, which are regex metacharacters, so every focused run filters on
the bare identifier, e.g. `-t 'PROJECT-ASSIGNMENT-READS-003'`. A run that
matches zero tests is a stop.

### 4.8 `set -e` defeats a naive restoration block, observed

A scratch script under `set -euo pipefail` that ran a failing command as
`cmd >out 2>&1; status=$?` exited before its restoration line and left the file
mutated. Section 12's block is the only shape used here.

### 4.9 Everything below was executed

The three files of slices A to E were written into this worktree together with
slice B's manifest edits and slice C's identifiers, then: `tool-devsync:typecheck`
succeeded; `tool-devsync:lint` succeeded; Prettier `--check` was clean;
`bun test src/test-levels.test.ts` ran **24 tests, 24 pass**; both level targets
ran clean and the coverage command printed three `yes` rows; and each fault in
section 11 was injected, observed and restored. `git diff` for every path this
packet owns was then empty.

## 5. File plan

| File                                                              | Slice | Create / modify | Responsibility                                         |
| ----------------------------------------------------------------- | ----- | --------------- | ------------------------------------------------------ |
| `openspec/changes/test-axes/proposal.md`                          | S     | modify          | Non-Goals no longer forbid what tasks 2.1 and 2.2 need |
| `openspec/changes/test-axes/specs/test-axes/spec.md`              | S     | modify          | One sentence, same reason                              |
| `openspec/changes/test-axes/verify.md`                            | S–E   | modify          | Each slice appends its own evidence                    |
| `tools/tool-devsync/src/test-levels.test.ts`                      | A–E   | create, extend  | Every check and its negative                           |
| `tools/tool-devsync/src/test-levels.ts`                           | A–E   | create, extend  | The table, the command shape, the join, provenance     |
| `nx.json`                                                         | B     | modify          | The `test:api` target default                          |
| `libs/wbs/adapters/store-sqlite/project.json`                     | B     | modify          | Add `test:api`; give `test:unit` a report              |
| `libs/wbs/application/core/project.json`                          | B     | modify          | Give `test:unit` a selector and a report               |
| `openspec/specs/project-assignment-reads/spec.md`                 | C     | modify          | Three scenario identifiers                             |
| `libs/wbs/adapters/store-sqlite/src/assignment-scope.db.test.ts`  | C     | modify          | Two citations                                          |
| `libs/wbs/application/core/src/service/work-item.service.test.ts` | C     | modify          | One citation                                           |
| `tools/tool-devsync/src/scenario-coverage-cli.ts`                 | E     | create          | The coverage table                                     |

Not edited: `openspec/changes/test-axes/tasks.md`, either `test` target, either
`test:conformance` target, `tools/tool-devsync/project.json`, `.gitignore`,
`docs/wiki-policy/*.json`, `docs/code-organization/**`, any README.

## 6. Slice S — put the change's own words in order

The proposal's Non-Goals say the change "changes no Nx target" and the delta
spec says "This change SHALL rename nothing and change no target", while its own
`tasks.md` 2.1 says to add one Nx target per level. R4 puts the architectural
statement before the implementation.

**Entry conditions.** `openspec/changes/test-axes/proposal.md` contains
`changes no Nx target`; the delta spec contains
`This change SHALL rename nothing and change no target.`;
`tools/tool-devsync/src/test-levels.ts` does not exist.

- [ ] S0 Run the batch README's OpenSpec validation block and record the three totals. Every later OpenSpec run in this packet must reproduce them: no item is added.
- [ ] S1 In `proposal.md`, replace the Non-Goals sentence with: "This change renames no test and implements no allocator or coverage ledger. It adds test targets and test reporting only additively: an existing target is never renamed, removed or repurposed. Conformance and Architecture tests remain outside T2 because they prove contracts and rules rather than scenarios." Then run `wc -w openspec/changes/test-axes/proposal.md` and confirm it is under 400.
- [ ] S2 In the delta spec, replace `This change SHALL rename nothing and change no target.` with `Classification SHALL rename nothing and repurpose no existing target; a level target SHALL be added alongside the targets that exist.` Change nothing else and leave every scenario heading alone.
- [ ] S3 Run the validation block again. Expected: the totals of S0, 0 failed. Any movement is a stop.
- [ ] S4 Negative. Use §12's backup and mutation-patch setup. Delete the whole `#### Scenario: [TEST-AXES-023] A manual disposition is overdue` heading line, leaving its bullets. **Not TEST-AXES-024:** it shares a requirement with three other scenarios, so removing it changes nothing. Substitute only `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json` as the command under test, redirecting stdout to `$TMPDIR/evidence/$name.failing` and stderr to `$TMPDIR/evidence/$name.stderr`. Capture its status through the `if` block. Restore and compare the saved bytes before asserting. Require `test "$status" -eq 1`, then use the JSON assertion below instead of grep. Confirm that the item total equals S0's, and rerun the standard green validation block.

  ```sh
  jq -s -e \
    --arg message 'ADDED "Manual dispositions expire for review" must include at least one scenario' '
    length == 1 and
    (.[0] |
      .summary.totals.failed == 1 and
      .summary.totals.passed == (.summary.totals.items - 1) and
      any(.items[];
        .id == "test-axes" and
        any(.issues[]; .level == "ERROR" and .message == $message)
      )
    )
  ' "$TMPDIR/evidence/$name.failing"
  ```

- [ ] S5 Append this slice's evidence to `openspec/changes/test-axes/verify.md`: the amendment, the before and after totals, and S4's proof row with its `$TMPDIR/evidence` patch path.
- [ ] S6 Format last, after the evidence is written:

  ```sh
  set -euo pipefail
  GSETTINGS_BACKEND=memory bunx prettier --write openspec/changes/test-axes/proposal.md \
    openspec/changes/test-axes/specs/test-axes/spec.md openspec/changes/test-axes/verify.md
  GSETTINGS_BACKEND=memory bunx prettier --check openspec/changes/test-axes/proposal.md \
    openspec/changes/test-axes/specs/test-axes/spec.md openspec/changes/test-axes/verify.md
  NX_DAEMON=false bunx nx format:check --all
  ```

  Expected: exit 0 from each; Prettier prints `All matched files use Prettier code style!`.

**Hand-over.** `openspec/changes/test-axes/proposal.md`,
`openspec/changes/test-axes/specs/test-axes/spec.md`,
`openspec/changes/test-axes/verify.md`.
Subject: `docs(test-axes): allow the rollout to add level targets additively`.

## 7. Slice A — the level table as code, tests first

**Entry conditions.** Slice S is committed. `tools/tool-devsync/src/test-levels.ts`
and `test-levels.test.ts` do not exist.

- [ ] A0 Prerequisites only. **Never run the whole devsync suite**: it collects `repo-namespacing-handoff.test.ts`, whose index check writes Git objects, which the contract reserves for the planner.

  ```sh
  set -euo pipefail
  mkdir -p "$TMPDIR/evidence"
  bun --version
  bun test --help | grep -c -- "--reporter-outfile"
  test ! -e tools/tool-devsync/src/test-levels.ts
  ```

  Expected: `1.4.2`; a count of at least 1; exit 0 from the `test`.

- [ ] A1 Create `tools/tool-devsync/src/test-levels.test.ts` with exactly this content — only the imports slice A's five cases use.

  ```ts
  import { describe, expect, it } from 'bun:test';

  import {
    AGGREGATE_TARGETS,
    conformanceFilesIn,
    KNOWN_OUTSIDE_TEST_ROOTS,
    LEVEL_TARGETS,
    levelOf,
    readManifest,
    TEST_TARGET_NAME,
    testFilesInProject,
    testFilesUnder,
    UNDECLARED_TEST_TARGETS,
  } from './test-levels';

  const SQLITE = 'libs/wbs/adapters/store-sqlite';
  const SQLITE_CONFORMANCE = 'src/testing/source-conformance.db.test.ts';

  /** The conformance files a project's own `test:conformance` target names. */
  async function conformanceFilesOf(root: string): Promise<readonly string[]> {
    const manifest = await readManifest(root);
    const command = manifest.targets['test:conformance']?.options?.command;
    return command === undefined ? [] : conformanceFilesIn(command);
  }

  describe('the level-selection table', () => {
    it('resolves the plain and the database conformance suffixes through target membership', () => {
      expect([
        levelOf(SQLITE_CONFORMANCE, [SQLITE_CONFORMANCE]),
        levelOf('src/testing/source-conformance.test.ts', [
          'src/testing/source-conformance.test.ts',
        ]),
        levelOf('src/assignment-scope.db.test.ts', [SQLITE_CONFORMANCE]),
        levelOf('src/audit.test.ts', [SQLITE_CONFORMANCE]),
      ]).toEqual(['conformance', 'conformance', 'api', 'unit']);
    });

    it('refuses a file that matches no row', () => {
      expect(() => levelOf('e2e/plan.spec.ts', [])).toThrow('matches no row');
    });

    it('reads the conformance files out of the real targets', async () => {
      expect([
        await conformanceFilesOf(SQLITE),
        await conformanceFilesOf('libs/wbs/adapters/store-memory'),
      ]).toEqual([[SQLITE_CONFORMANCE], ['src/testing/source-conformance.test.ts']]);
    });
  });

  describe('the adopted projects', () => {
    it('keeps every test file outside a declared test root on the known list', async () => {
      const outside: string[] = [];
      for (const root of new Set(LEVEL_TARGETS.map((target) => target.root))) {
        const declared = new Set(
          (
            await Promise.all(
              LEVEL_TARGETS.filter((target) => target.root === root).flatMap((target) =>
                target.testRoots.map((testRoot) => testFilesUnder(root, testRoot)),
              ),
            )
          ).flatMap((files) => files.map((file) => `${root}/${file}`)),
        );
        outside.push(...(await testFilesInProject(root)).filter((file) => !declared.has(file)));
      }
      expect(outside.sort()).toEqual(Object.keys(KNOWN_OUTSIDE_TEST_ROOTS).sort());
    });

    it('accounts for every test-running target as a level, an aggregate or a known exception', async () => {
      const unaccounted: string[] = [];
      const declared = new Set(LEVEL_TARGETS.map(({ project, target }) => `${project}:${target}`));
      for (const root of new Set(LEVEL_TARGETS.map((target) => target.root))) {
        const manifest = await readManifest(root);
        for (const name of Object.keys(manifest.targets)) {
          if (!TEST_TARGET_NAME.test(name)) continue;
          const qualified = `${manifest.name}:${name}`;
          const accounted =
            declared.has(qualified) ||
            AGGREGATE_TARGETS.includes(qualified) ||
            qualified in UNDECLARED_TEST_TARGETS;
          if (!accounted) unaccounted.push(qualified);
        }
      }
      expect(unaccounted.sort()).toEqual([]);
    });
  });
  ```

- [ ] A2 Watch it fail for want of the module: `cd tools/tool-devsync && bun test --preload ../test/scratch/preload.ts src/test-levels.test.ts`. Expected: a non-zero exit naming `./test-levels` as unresolved. Success here means the module already exists; stop.
- [ ] A3 Create `tools/tool-devsync/src/test-levels.ts` with exactly this content. No `Proof:` comment yet — they go in at A6.

  ```ts
  import { readFile } from 'node:fs/promises';
  import { join } from 'node:path';

  /** The workspace root, from this file's own location. */
  export const WORKSPACE = new URL('../../../', import.meta.url);

  /**
   * The levels of the level-selection table the adopted projects can reach.
   *
   * Manual, Architecture, Performance, Browser and View exist in the table and are
   * not reachable from the adopted projects' test roots, so {@link levelOf} throws
   * rather than guessing when a file matches no row it knows.
   */
  export type TestLevel = 'api' | 'conformance' | 'unit';

  /** One Nx target declared to run exactly one level. */
  export interface LevelTarget {
    readonly project: string;
    /** The project's root, workspace-relative. It is also the target's `cwd`. */
    readonly root: string;
    readonly target: string;
    readonly level: TestLevel;
    /** Where this target's JUnit report lands, workspace-relative. */
    readonly report: string;
    /** Directories under `root` this target's level is enumerated from. */
    readonly testRoots: readonly string[];
  }

  /**
   * The level targets adopted by the first increment of the test-axes change.
   *
   * Two projects, because they hold every test of the adopted capability. Adding a
   * row obliges that target to collect exactly the files {@link levelOf} puts at
   * its level.
   */
  export const LEVEL_TARGETS: readonly LevelTarget[] = [
    {
      project: 'wbs-store-sqlite',
      root: 'libs/wbs/adapters/store-sqlite',
      target: 'test:api',
      level: 'api',
      report: 'tmp/junit/wbs-store-sqlite.api.xml',
      testRoots: ['src'],
    },
    {
      project: 'wbs-store-sqlite',
      root: 'libs/wbs/adapters/store-sqlite',
      target: 'test:unit',
      level: 'unit',
      report: 'tmp/junit/wbs-store-sqlite.unit.xml',
      testRoots: ['src'],
    },
    {
      project: 'wbs-core',
      root: 'libs/wbs/application/core',
      target: 'test:unit',
      level: 'unit',
      report: 'tmp/junit/wbs-core.unit.xml',
      testRoots: ['src'],
    },
  ];

  /**
   * Targets of an adopted project declared to span levels on purpose.
   *
   * They are exempt from isolation while they say so. This increment does not
   * implement the other half of TEST-AXES-005 — an undeclared target that spans
   * levels is not refused — because no undeclared target of an adopted project
   * spans levels today.
   */
  export const AGGREGATE_TARGETS: readonly string[] = ['wbs-store-sqlite:test', 'wbs-core:test'];

  /**
   * Test-running targets of an adopted project that are neither a level target nor
   * an aggregate, each with the reason.
   *
   * The partition case leaves no remainder, so a new test target has to arrive in
   * one of these three lists.
   */
  export const UNDECLARED_TEST_TARGETS: Readonly<Record<string, string>> = {
    'wbs-store-sqlite:test:conformance':
      'Conformance level. Its exact command is pinned by workspace-targets.test.ts, so it cannot ' +
      'gain a JUnit report in this increment.',
    'wbs-core:test:portable':
      'Browser level, run by Playwright from libs/wbs/application/core/playwright.config.ts.',
  };

  /**
   * Test files of an adopted project that lie outside its declared test roots.
   *
   * A list rather than a rule, for the reason `vitest.node-suites.ts` gives: the
   * entry carries why, and the case that reads it walks the tree, so the list
   * cannot go stale.
   */
  export const KNOWN_OUTSIDE_TEST_ROOTS: Readonly<Record<string, string>> = {
    'libs/wbs/application/core/testing/portable-composition.spec.ts':
      'Browser: collected by libs/wbs/application/core/playwright.config.ts (testDir ./testing, ' +
      'testMatch portable-composition.spec.ts) and run by wbs-core:test:portable, which this ' +
      'increment does not declare as a level target.',
  };

  /** Bun's own default test-file matcher, so enumeration sees what the runner sees. */
  export const BUN_TEST_FILE = /(?:\.|_)(?:test|spec)\.[cm]?[jt]sx?$/;

  /** Nx target names that run a test runner. */
  export const TEST_TARGET_NAME = /^(?:test|integration|e2e)(?:[:-].+)?$/;

  /** Directories never walked when enumerating a project's test files. */
  const NEVER_WALKED = new Set(['node_modules', 'dist', 'coverage', 'test-results']);

  /** One Nx target as a project manifest spells it. */
  export interface ManifestTarget {
    readonly options?: { readonly command?: string; readonly cwd?: string };
  }

  /** One project manifest, reduced to what this module reads. */
  export interface ProjectManifest {
    readonly name: string;
    readonly targets: Readonly<Record<string, ManifestTarget | undefined>>;
  }

  /**
   * One project's `project.json`, read from the workspace.
   *
   * Test boundary: the manifest is Nx's own schema and Nx validates it; this reads
   * the three fields the cases compare.
   *
   * @throws when the manifest is absent or unreadable.
   */
  export async function readManifest(root: string): Promise<ProjectManifest> {
    const text = await readFile(new URL(`${root}/project.json`, WORKSPACE), 'utf8');
    return JSON.parse(text) as ProjectManifest;
  }

  /**
   * The test files a project's `test:conformance` target names.
   *
   * Read from the command rather than declared, because the command is the
   * authority row 2 of the level-selection table points at.
   */
  export function conformanceFilesIn(command: string): readonly string[] {
    return [...command.matchAll(/\S+(?:\.|_)(?:test|spec)\.[cm]?[jt]sx?/g)].map(([path]) => path);
  }

  /**
   * The level of one test file of an adopted project, by the level-selection
   * table, in precedence order.
   *
   * @param projectRelativePath the path the runner names the file with
   * @param conformanceFiles what the project's `test:conformance` target names
   * @throws when no row matches, because an unclassified test file is scenario
   * TEST-AXES-001 and a default would hide it.
   */
  export function levelOf(
    projectRelativePath: string,
    conformanceFiles: readonly string[],
  ): TestLevel {
    if (conformanceFiles.includes(projectRelativePath)) return 'conformance';
    if (/\.db\.test\.[cm]?[jt]sx?$/.test(projectRelativePath)) return 'api';
    if (/\.test\.[cm]?[jt]s$/.test(projectRelativePath)) return 'unit';
    throw new Error(
      `${projectRelativePath} matches no row of the level-selection table this increment implements`,
    );
  }

  /** Every file Bun's runner would collect under `root`/`dir`, `root`-relative and sorted. */
  export async function testFilesUnder(root: string, dir: string): Promise<string[]> {
    const found: string[] = [];
    const base = join(new URL(`${root}/`, WORKSPACE).pathname, dir);
    const glob = new Bun.Glob('**/*');
    for await (const entry of glob.scan({ cwd: base })) {
      if (entry.split('/').some((segment) => NEVER_WALKED.has(segment))) continue;
      if (BUN_TEST_FILE.test(entry)) found.push(`${dir}/${entry}`);
    }
    return found.sort();
  }

  /** Every file Bun's runner would collect anywhere under `root`, workspace-relative and sorted. */
  export async function testFilesInProject(root: string): Promise<string[]> {
    const found: string[] = [];
    const glob = new Bun.Glob('**/*');
    for await (const entry of glob.scan({ cwd: new URL(`${root}/`, WORKSPACE).pathname })) {
      if (entry.split('/').some((segment) => NEVER_WALKED.has(segment))) continue;
      if (BUN_TEST_FILE.test(entry)) found.push(`${root}/${entry}`);
    }
    return found.sort();
  }
  ```

- [ ] A4 Run the focused file. Expected: exit 0, `Ran 5 tests across 1 file.`, 0 fail.
- [ ] A5 Watch three negatives, each with the block of section 12 and the diagnostics of section 11, rows A-1 to A-3.
- [ ] A6 Add one dated `Proof:` comment per negative in `test-levels.ts`, adjacent to the guard each one proves, naming the injected fault and the observed message.
- [ ] A7 Append this slice's evidence to `verify.md` (commands, exit statuses, the three proof rows). Write each evidence reference as a basename relative to the attempt's evidence directory, never an absolute clone path or an expanded `$TMPDIR` path — the record is published. **Then** format:

  ```sh
  set -euo pipefail
  NX_DAEMON=false bunx nx run tool-devsync:typecheck
  NX_DAEMON=false bunx nx run tool-devsync:lint
  GSETTINGS_BACKEND=memory bunx prettier --write tools/tool-devsync/src/test-levels.ts \
    tools/tool-devsync/src/test-levels.test.ts openspec/changes/test-axes/verify.md
  GSETTINGS_BACKEND=memory bunx prettier --check tools/tool-devsync/src/test-levels.ts \
    tools/tool-devsync/src/test-levels.test.ts openspec/changes/test-axes/verify.md
  NX_DAEMON=false bunx nx format:check --all
  (cd tools/tool-devsync && bun test --preload ../test/scratch/preload.ts src/test-levels.test.ts)
  ```

  Expected: exit 0 from every command; the last prints `Ran 5 tests across 1
file.` `no-unnecessary-condition` is on here, so a `?? ''` on a regular
  expression capture group is a lint error — none of the listings carries one.

**Hand-over.** `tools/tool-devsync/src/test-levels.ts`,
`tools/tool-devsync/src/test-levels.test.ts`,
`openspec/changes/test-axes/verify.md`.
Subject: `feat(test-axes): classify a test file by the level-selection table`.

## 8. Slice B — the level targets and their reports, tests first

**Entry conditions.** Slice A is committed; the focused file passes 5 of 5;
`libs/wbs/adapters/store-sqlite/project.json` has no `test:api` target.

- [ ] B0 Record the focused file's `Ran N tests across 1 file.` line, and the `targetDefaults` keys of `nx.json`. This slice ends at N+4.
- [ ] B1 Add a `test:api` target default to `nx.json`. Read `targetDefaults` first: if it already holds entries such as `test:store` or `test:portable` carrying `options.env` with `CLAUDECODE` and `AGENT`, copy that entry's exact shape under the key `test:api`. If it holds none — which is the state of this worktree — use:

  ```json
  "test:api": {
    "cache": false,
    "options": { "env": { "CLAUDECODE": "0", "AGENT": "0" } }
  },
  ```

  The incoming fix branch adds a graph-walking case that refuses a test-running target name without such a default, so a new target name must bring one. Verified on 2026-09-20: with this entry, `nx show project wbs-store-sqlite --json` resolves `test:api` carrying both variables and `cache: false`, and the target-facts comparison still passed 2 of 2 (that comparison has since moved to `committed-target-facts.test.ts` in the Twilight Bureaucrat package, which reads targets as its static extractor does: a target with its own `options` does not show a default's `options.env` there, so never add `env` to an `nx-target` fact).

- [ ] B2 Append slice B's four cases to `test-levels.test.ts`, and add `collectedFiles`, `parseLevelCommand` and `reportPathFrom` to the import list, keeping the order `simple-import-sort` produces (run `bunx eslint --fix` on the file if unsure).

  ```ts
  describe('declared level targets', () => {
    // Three shell spawns and three directory walks: the batch-2 brief's rule for a
    // test that spawns more than twice.
    it('collects exactly the files of its own level', async () => {
      const wrong: string[] = [];
      for (const target of LEVEL_TARGETS) {
        const label = `${target.project}:${target.target}`;
        const manifest = await readManifest(target.root);
        const declared = manifest.targets[target.target];
        if (declared === undefined) {
          wrong.push(`${label} is not declared in project.json`);
          continue;
        }
        if (declared.options?.cwd !== target.root) {
          wrong.push(`${label} runs in ${String(declared.options?.cwd)}, not ${target.root}`);
          continue;
        }
        let selector;
        try {
          selector = parseLevelCommand(declared.options.command ?? '').selector;
        } catch (cause) {
          wrong.push(`${label} command shape: ${(cause as Error).message}`);
          continue;
        }
        const conformance = await conformanceFilesOf(target.root);
        const collected = collectedFiles(target.root, selector);
        for (const file of collected) {
          const level = levelOf(file, conformance);
          if (level !== target.level) {
            wrong.push(
              `${label} is declared ${target.level} and collects ${file}, which is ${level}`,
            );
          }
        }
        const owed = (
          await Promise.all(target.testRoots.map((root) => testFilesUnder(target.root, root)))
        )
          .flat()
          .filter((file) => levelOf(file, conformance) === target.level);
        for (const file of owed.filter((candidate) => !collected.includes(candidate))) {
          wrong.push(
            `${label} is declared ${target.level} and does not collect ${file}, which is ${target.level}`,
          );
        }
      }
      expect(wrong.sort()).toEqual([]);
    }, 30_000);

    it('writes a JUnit report where the declaration says', async () => {
      const missing: string[] = [];
      for (const target of LEVEL_TARGETS) {
        const label = `${target.project}:${target.target}`;
        const manifest = await readManifest(target.root);
        const command = manifest.targets[target.target]?.options?.command;
        if (command === undefined) {
          missing.push(`${label} is not declared in project.json`);
          continue;
        }
        let parsed;
        try {
          parsed = parseLevelCommand(command);
        } catch (cause) {
          missing.push(`${label} command shape: ${(cause as Error).message}`);
          continue;
        }
        const path = reportPathFrom(target.root, target.report);
        const directory = path.slice(0, path.lastIndexOf('/'));
        if (!parsed.flags.includes('--reporter=junit')) {
          missing.push(`${label} does not pass --reporter=junit`);
        }
        if (!parsed.flags.includes(`--reporter-outfile=${path}`)) {
          missing.push(`${label} does not write ${path}`);
        }
        if (parsed.reportDirectory !== directory) {
          missing.push(`${label} does not create ${directory}`);
        }
      }
      expect(missing.sort()).toEqual([]);
    });

    it('refuses a command that names a test file outside its selector', () => {
      expect(() =>
        parseLevelCommand(
          `mkdir -p ../tmp/junit && bun test $(find src -name '*.db.test.ts') ${SQLITE_CONFORMANCE} --reporter=junit`,
        ),
      ).toThrow(`may not pass ${SQLITE_CONFORMANCE}`);
    });

    it('refuses a command that filters which tests run', () => {
      expect(() =>
        parseLevelCommand(
          "mkdir -p ../tmp/junit && bun test $(find src -name '*.db.test.ts') --test-name-pattern=NO_MATCH --reporter=junit",
        ),
      ).toThrow('may not pass --test-name-pattern=NO_MATCH');
    });
  });
  ```

- [ ] B3 Append to `test-levels.ts`:

  ```ts
  /* ─── slice B adds everything below this line ─────────────────────────────── */

  /**
   * The only flags a declared level target may pass to Bun's runner.
   *
   * An allow-list and not a shape check: `--test-name-pattern`, `--preload`,
   * `--config`, `--bail` and `--todo` all change which tests run, so a target
   * carrying one would satisfy the file-level isolation check while running a
   * different set — a check that cannot fail.
   */
  export const ALLOWED_LEVEL_FLAG =
    /^--(?:coverage|coverage-reporter=lcov|reporter=junit|reporter-outfile=\S+)$/;

  /** The parts of a declared level target's command. */
  export interface LevelCommand {
    /** The directory the command creates before running, as the command spells it. */
    readonly reportDirectory: string;
    /** The shell expression inside `$( … )` that names the files to run. */
    readonly selector: string;
    /** Every flag after the selector, in order. */
    readonly flags: readonly string[];
  }

  /**
   * The only command shape a declared level target may have:
   * `mkdir -p <dir> && bun test $( <selector> ) <flag>…`.
   *
   * Anchored on purpose. A positional argument after the selector is how a target
   * quietly gains a file of another level without the selector saying so, and a
   * second command substitution is a second selection rule.
   *
   * @throws when the command has any other shape, or carries a flag outside
   * {@link ALLOWED_LEVEL_FLAG}.
   */
  export function parseLevelCommand(command: string): LevelCommand {
    const parsed = /^mkdir -p (\S+) && bun test \$\(([^()]*)\)((?: \S+)*)$/.exec(command);
    if (parsed === null) {
      throw new Error(
        `a declared level target must read \`mkdir -p <dir> && bun test $( <selector> ) <flag>…\`; got: ${command}`,
      );
    }
    const [, reportDirectory, selector, rest] = parsed;
    const flags = rest.split(/\s+/).filter(Boolean);
    const refused = flags.filter((flag) => !ALLOWED_LEVEL_FLAG.test(flag));
    if (refused.length > 0) {
      throw new Error(
        `a declared level target may not pass ${refused.join(', ')}; only coverage and JUnit reporting flags are allowed`,
      );
    }
    return { reportDirectory, selector, flags };
  }

  /**
   * The files one declared level target collects, by running the command's own
   * selector in the target's working directory.
   *
   * The selector is run rather than re-implemented: a second copy of the selection
   * rule is the drift this check exists to catch.
   *
   * @throws when the selector fails.
   */
  export function collectedFiles(root: string, selector: string): readonly string[] {
    const run = Bun.spawnSync(['sh', '-c', selector], {
      cwd: new URL(`${root}/`, WORKSPACE).pathname,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (run.exitCode !== 0) {
      throw new Error(`${root}: the file selector failed: ${run.stderr.toString()}`);
    }
    return run.stdout.toString().split(/\s+/).filter(Boolean).sort();
  }

  /** The report path a target writes, spelled the way its own working directory must spell it. */
  export function reportPathFrom(root: string, report: string): string {
    return `${'../'.repeat(root.split('/').length)}${report}`;
  }
  ```

- [ ] B4 Run the focused file **before** touching any manifest and record the red. Expect **7 pass, 2 fail** in the slice-B-only file — A's five tests pass, and of B's four, the two pure cases pass while the two manifest-dependent cases fail. Both failing cases carry the same three entries:

  ```text
  + [
  +   "wbs-core:test:unit command shape: a declared level target must read `mkdir -p <dir> && bun test $( <selector> ) <flag>…`; got: bun test src --coverage --coverage-reporter=lcov",
  +   "wbs-store-sqlite:test:api is not declared in project.json",
  +   "wbs-store-sqlite:test:unit command shape: a declared level target must read `mkdir -p <dir> && bun test $( <selector> ) <flag>…`; got: bun test $(find src -name '*.test.ts' ! -name '*.db.test.ts' | tr '\n' ' ') --coverage --coverage-reporter=lcov",
  + ]
  ```

  The other two new cases, `refuses a command that names a test file outside its
selector` and `refuses a command that filters which tests run`, pass
  immediately: they are pure and need no manifest. Anything else is a stop.

- [ ] B5 In `libs/wbs/adapters/store-sqlite/project.json`, add `test:api` immediately after `test`:

  ```json
  "test:api": {
    "executor": "nx:run-commands",
    "cache": false,
    "inputs": ["default", "^production", "{workspaceRoot}/apps/wbs/be-01/drizzle"],
    "options": {
      "command": "mkdir -p ../../../../tmp/junit && bun test $(find src -name '*.db.test.ts' ! -name 'source-conformance.db.test.ts' | tr '\\n' ' ') --reporter=junit --reporter-outfile=../../../../tmp/junit/wbs-store-sqlite.api.xml",
      "cwd": "libs/wbs/adapters/store-sqlite",
      "forwardAllArgs": false
    }
  },
  ```

  `! -name` and **not** `! -path`: the path form contains the string
  `src/testing/source-conformance.db.test.ts`, which `source conformance target
discovery` searches every command for. Both forms select the same 56 files.

- [ ] B6 Replace `test:unit`'s `command` in the same file with:

  ```text
  mkdir -p ../../../../tmp/junit && bun test $(find src -name '*.test.ts' ! -name '*.db.test.ts' | tr '\n' ' ') --coverage --coverage-reporter=lcov --reporter=junit --reporter-outfile=../../../../tmp/junit/wbs-store-sqlite.unit.xml
  ```

- [ ] B7 Replace `test:unit`'s `command` in `libs/wbs/application/core/project.json` with:

  ```text
  mkdir -p ../../../../tmp/junit && bun test $(find src -name '*.test.ts' | tr '\n' ' ') --coverage --coverage-reporter=lcov --reporter=junit --reporter-outfile=../../../../tmp/junit/wbs-core.unit.xml
  ```

  `test` in that file is **not** touched: a declared `nx-target` fact pins it.

- [ ] B8 In `libs/wbs/application/core`, run `bun test src` and `bun test $(find src -name '*.test.ts' | tr '\n' ' ')` and compare the two `Ran N tests across M files.` lines. If they differ, stop.
- [ ] B9 Run the focused file. Expected: exit 0, B0's N+4, 0 fail.
- [ ] B10 Run the three declared targets and confirm the reports:

  ```sh
  set -euo pipefail
  env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT NX_DAEMON=false bunx nx run wbs-store-sqlite:test:api
  env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT NX_DAEMON=false bunx nx run wbs-store-sqlite:test:unit
  env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT NX_DAEMON=false bunx nx run wbs-core:test:unit
  ls tmp/junit
  ```

  Expected: exit 0 each, 0 failing tests, three files in `tmp/junit`. The planner
  saw 656 tests across 56 files for `test:api` and 535 across 52 for
  `wbs-core:test:unit`; a different total on a moved main is recorded, not a
  stop. A failing test is a stop.

- [ ] B11 Execute rows B-1 through B-9 independently, restoring and rerunning green between faults.
- [ ] B12 Re-run the pinned case the first draft broke:

  ```sh
  cd tools/tool-devsync && bun test --preload ../test/scratch/preload.ts src/workspace-targets.test.ts \
    -t 'selects each terminal source file exactly and keeps normal test inclusion'
  ```

  Expected: `Ran 1 test across 1 file.`, 0 fail, `17 filtered out`. Zero tests
  matched is a stop.

- [ ] B13 Add nine observed, dated `Proof:` comments beside the checks they establish, including checks in `test-levels.test.ts`; append all nine proof rows to `verify.md`. The number of test cases remains B0's N+4. Write each evidence reference as a basename relative to the attempt's evidence directory, never an absolute clone path or an expanded `$TMPDIR` path — the record is published. **Then** run A7's check list over this slice's owned paths (`nx.json`, both manifests, both devsync files, `verify.md`) plus `nx format:check --all`.

**Hand-over.** `nx.json`, `libs/wbs/adapters/store-sqlite/project.json`,
`libs/wbs/application/core/project.json`,
`tools/tool-devsync/src/test-levels.ts`,
`tools/tool-devsync/src/test-levels.test.ts`,
`openspec/changes/test-axes/verify.md`. `tmp/junit/` is ignored and must not
appear. Subject: `feat(test-axes): run the API and unit levels alone and report them as JUnit`.

## 9. Slice C — identifiers and citations

**Entry conditions.** Slice B is committed and the focused file passes. No
scenario heading in `openspec/specs/project-assignment-reads/spec.md` carries an
identifier, and none of the three test titles does.

- [ ] C0 Record the focused devsync file's own baseline N from its `Ran N tests across 1 file.` line; the OpenSpec totals; the `Ran N tests across 1 file.` line of `bun test src/assignment-scope.db.test.ts` in `libs/wbs/adapters/store-sqlite`; and of `bun test src/service/work-item.service.test.ts` in `libs/wbs/application/core`. The last three must be unchanged at the end. C adds five cases and finishes at N+5.
- [ ] C1 Append slice C's five cases to `test-levels.test.ts` and add `ADOPTED_CAPABILITY`, `readSpec`, `scenarioIdentifiers` and `scenariosWithoutIdentifier` to the import list.

  ```ts
  describe('the adopted capability', () => {
    it('leaves no scenario without an identifier', async () => {
      expect(scenariosWithoutIdentifier(await readSpec(ADOPTED_CAPABILITY))).toEqual([]);
    });

    it('allocates the identifiers once and in order', async () => {
      expect(scenarioIdentifiers(await readSpec(ADOPTED_CAPABILITY))).toEqual([
        'PROJECT-ASSIGNMENT-READS-001',
        'PROJECT-ASSIGNMENT-READS-002',
        'PROJECT-ASSIGNMENT-READS-003',
      ]);
    });

    it('refuses a specification that holds no scenario', () => {
      expect(() => scenariosWithoutIdentifier('### Requirement: alone\n')).toThrow(
        'no `#### Scenario:`',
      );
    });

    it('refuses a specification that holds no requirement', () => {
      expect(() => scenariosWithoutIdentifier('#### Scenario: [DEMO-001] a\n')).toThrow(
        'no `### Requirement:`',
      );
    });

    it('refuses a specification whose scenario carries no identifier', () => {
      expect(() =>
        scenarioIdentifiers(
          '### Requirement: one\n#### Scenario: [DEMO-001] a\n#### Scenario: b\n',
        ),
      ).toThrow('these scenarios carry no identifier: b');
    });
  });
  ```

- [ ] C2 Append to `test-levels.ts` exactly this. `ADOPTED_CAPABILITY` is declared **here and nowhere else** — slice A's listing does not contain it.

  ```ts
  /* ─── slice C adds everything below this line ─────────────────────────────── */

  /** The capability whose scenarios this increment allocates identifiers for. */
  export const ADOPTED_CAPABILITY = 'project-assignment-reads';

  /** The shape of every scenario identifier: the capability's name, then an ordinal. */
  export const SCENARIO_IDENTIFIER = /^\[([A-Z][A-Z0-9-]*-\d{3})\] \S/;

  /** @throws when `specMarkdown` holds no requirement or no scenario heading. */
  function assertSpecification(specMarkdown: string): void {
    if (!/^### Requirement: /m.test(specMarkdown)) {
      throw new Error('the capability specification holds no `### Requirement:` heading');
    }
    if (!/^#### Scenario: /m.test(specMarkdown)) {
      throw new Error('the capability specification holds no `#### Scenario:` heading');
    }
  }

  /** Scenario headings of one capability specification that carry no identifier. */
  export function scenariosWithoutIdentifier(specMarkdown: string): readonly string[] {
    assertSpecification(specMarkdown);
    return [...specMarkdown.matchAll(/^#### Scenario: (.*)$/gm)]
      .filter(([, title]) => !SCENARIO_IDENTIFIER.test(title))
      .map(([, title]) => title);
  }

  /**
   * Scenario identifiers of one capability specification, in document order.
   *
   * @throws when the text is not a capability specification, or when any scenario
   * heading carries no identifier. A ledger that silently skips the scenarios it
   * cannot name reports full coverage over a specification it never read.
   */
  export function scenarioIdentifiers(specMarkdown: string): readonly string[] {
    const unidentified = scenariosWithoutIdentifier(specMarkdown);
    if (unidentified.length > 0) {
      throw new Error(`these scenarios carry no identifier: ${unidentified.join('; ')}`);
    }
    return [...specMarkdown.matchAll(/^#### Scenario: \[([A-Z][A-Z0-9-]*-\d{3})\]/gm)].map(
      ([, id]) => id,
    );
  }

  /**
   * One capability specification, read from the workspace.
   *
   * @throws when the specification is absent or unreadable.
   */
  export async function readSpec(capability: string): Promise<string> {
    return readFile(new URL(`openspec/specs/${capability}/spec.md`, WORKSPACE), 'utf8');
  }
  ```

- [ ] C3 Run the focused file and record the red. Observed here: `12 pass`, `2 fail`, `Ran 14 tests across 1 file.` The two new capability cases fail — `leaves no scenario without an identifier` with the three scenario titles, and `allocates the identifiers once and in order` with `error: these scenarios carry no identifier: Tiny project among unrelated projects; Assignment write among unrelated projects; Different projects in the memory fixture`. The three new refusal cases pass immediately.
- [ ] C4 In `openspec/specs/project-assignment-reads/spec.md`, prefix the three scenario titles in document order, changing nothing else:

  ```text
  #### Scenario: [PROJECT-ASSIGNMENT-READS-001] Tiny project among unrelated projects
  #### Scenario: [PROJECT-ASSIGNMENT-READS-002] Assignment write among unrelated projects
  #### Scenario: [PROJECT-ASSIGNMENT-READS-003] Different projects in the memory fixture
  ```

  The prefix is the capability directory name upper-cased with hyphens kept,
  then a three-digit ordinal from `001` — the grammar the hand-written
  `SERVICE-TAXONOMY-0xx` and `TEST-AXES-0xx` identifiers use (assumption A3).

- [ ] C5 In `libs/wbs/adapters/store-sqlite/src/assignment-scope.db.test.ts`, inside `describe('project-scoped assignment reads')`, prefix the two titles with `[PROJECT-ASSIGNMENT-READS-001] ` and `[PROJECT-ASSIGNMENT-READS-002] ` in the order they appear. No assertion moves.
- [ ] C6 In `libs/wbs/application/core/src/service/work-item.service.test.ts`, inside `describe('assignment projections isolate memory projects')`, prefix `names only the people assigned in the requested project` with `[PROJECT-ASSIGNMENT-READS-003] `, and add a comment above that `describe` saying why a Unit test cites at all: T1 does not require it, and a scenario proved only at Unit level enters the ledger no other way (assumption A4).
- [ ] C7 Run the focused checks:

  ```sh
  set -euo pipefail
  (cd libs/wbs/adapters/store-sqlite && bun test src/assignment-scope.db.test.ts -t 'PROJECT-ASSIGNMENT-READS-001')
  (cd libs/wbs/adapters/store-sqlite && bun test src/assignment-scope.db.test.ts -t 'PROJECT-ASSIGNMENT-READS-002')
  (cd libs/wbs/application/core && bun test src/service/work-item.service.test.ts -t 'PROJECT-ASSIGNMENT-READS-003')
  (cd libs/wbs/adapters/store-sqlite && bun test src/assignment-scope.db.test.ts)
  (cd libs/wbs/application/core && bun test src/service/work-item.service.test.ts)
  (cd tools/tool-devsync && bun test --preload ../test/scratch/preload.ts src/test-levels.test.ts)
  ```

  Expected: each of the first three prints `Ran 1 test across 1 file.` with 0
  fail — zero tests matched is a stop. The two whole-file runs reproduce C0's
  totals. The focused devsync file is at C0's N+5 — **14 on this planner's
  tree**, observed 2026-09-20.

- [ ] C8 Run the OpenSpec validation block. Expected: C0's totals, 0 failed.
- [ ] C9 Execute rows C-1 through C-4 of section 11 independently, restoring and rerunning green between faults, and add one dated `Proof:` comment per row. C-4 removes only the requirement-heading guard from `assertSpecification`; the named test is `refuses a specification that holds no requirement`. Require `Received function did not throw` and `Received value: []`, restore and compare bytes, rerun green, then add the adjacent dated proof comment. Update subsequent counts from their own slice baselines.
- [ ] C10 Append this slice's evidence to `verify.md`. Publish evidence references as basenames only. Do not copy absolute clone paths or expanded temporary-root paths into `verify.md`. Record unavailable whole-suite checks as pending planner verification. **Then** run, in this order: `NX_DAEMON=false bunx nx run tool-devsync:typecheck`; `NX_DAEMON=false bunx nx run tool-devsync:lint`; Prettier `--write` then `--check` over the **six** owned paths; `NX_DAEMON=false bunx nx format:check --all`; and the focused devsync file. Observed here: typecheck and lint each exit 0 with no diagnostic on the two devsync files.

**Hand-over.** `tools/tool-devsync/src/test-levels.ts`,
`tools/tool-devsync/src/test-levels.test.ts`,
`openspec/specs/project-assignment-reads/spec.md`,
`libs/wbs/adapters/store-sqlite/src/assignment-scope.db.test.ts`,
`libs/wbs/application/core/src/service/work-item.service.test.ts`,
`openspec/changes/test-axes/verify.md`.
Subject: `feat(test-axes): identify and cite the project assignment reads scenarios`.

## 10. Slice D — the JUnit reader and the join, tests first

**Entry conditions.** Slice C is committed; the focused file passes; the three
identifiers are in the specification and in the three titles.

This slice was rewritten after the C/D/E dispatch review found that the previous
scanner accepted malformed reports and still produced a passing citation. The
implementation, the cases and every diagnostic below were written into this
worktree, run, mutated once per guard and restored. **Do not invent XML
validation:** the listings are complete.

### What Bun 1.4.2 really writes, observed 2026-09-20

`bun test --reporter=junit --reporter-outfile=out.xml src/a.test.ts` over a
scratch file with a nested `describe`, an escaped title, a skip, a todo and a
failure produced:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="6" assertions="4" failures="1" skipped="2" time="0.041267144">
  <testsuite name="src/a.test.ts" file="src/a.test.ts" tests="6" assertions="4" failures="1" skipped="2" time="0.001775897" hostname="pop-os">
    <testsuite name="outer group" file="src/a.test.ts" line="3" tests="5" assertions="3" failures="1" skipped="2" time="0" hostname="pop-os">
      <testsuite name="inner group" file="src/a.test.ts" line="4" tests="1" assertions="1" failures="0" skipped="0" time="0" hostname="pop-os">
        <testcase name="passes plainly" classname="inner group &gt; outer group" time="0.000026" file="src/a.test.ts" line="5" assertions="1" />
      </testsuite>
      <testcase name="has &lt;angle&gt; &amp; &quot;quotes&quot; and &apos;apostrophes&apos;" classname="outer group" time="0.000013" file="src/a.test.ts" line="9" assertions="1" />
      <testcase name="is skipped" classname="outer group" time="0" file="src/a.test.ts" line="12" assertions="0">
        <skipped />
      </testcase>
      <testcase name="fails on purpose" classname="outer group" time="0.000281" file="src/a.test.ts" line="15" assertions="1">
        <failure type="AssertionError" message="expect(received).toBe(expected)&#10;&#10;Expected: 5&#10;Received: 4&#10;">AssertionError&#10;      at src/a.test.ts:16:15&#10;</failure>
      </testcase>
      <testcase name="is a todo" classname="outer group" time="0" file="src/a.test.ts" line="18" assertions="0">
        <skipped message="TODO" />
      </testcase>
    </testsuite>
    <testcase name="top level case" classname="" time="0.000031" file="src/a.test.ts" line="21" assertions="1" />
  </testsuite>
</testsuites>
```

Seven facts the reader depends on. One `testsuites` root. One `testsuite` per
file, then one nested `testsuite` per `describe`, so **every `testcase` has a
`testsuite` ancestor** and a `testcase` directly under the root is not something
Bun writes. A passing case is self-closing; a skipped one carries `<skipped />`,
a todo `<skipped message="TODO" />` and a failing one a `<failure>` with both a
`message` attribute and element text. `name` and `file` are always present;
`classname` is the reversed `describe` chain and is empty for a top-level case.
Titles are escaped with the five named entities `&lt; &gt; &amp; &quot; &apos;`,
and **newlines inside an attribute are written as the numeric reference
`&#10;`** — so a reader that knows only the five named entities refuses Bun's own
failure messages.

`decodeReferences`'s hexadecimal pattern is written `/^#(?:x|X)…/` and not
`/^#[xX]…/` on purpose: the second spelling would leave a bracketed pair
immediately before an opening parenthesis in this packet, and the namespacing
handover's current-document link checker reads that as a Markdown link to an
absent path. Copy it as written.

No XML parser is installed in this workspace — `package.json` declares none, and
the only `xml` entries under `node_modules` (`xmlchars`, `xml-name-validator`,
`w3c-xmlserializer`) are transitive and are not parsers. The reader below is
therefore a small strict tokenizer whose limits are stated in its JSDoc.

- [ ] D0 Record the focused file's total N. This slice adds nineteen cases and finishes at N+19 — **33 on this planner's tree**.
- [ ] D1 Append slice D's nineteen cases to `test-levels.test.ts` and add `passedCitations`, `readJUnitReport` and `uncoveredScenarios` to the import list, keeping the order `simple-import-sort` produces.

  ```ts
  describe('the scenario join', () => {
    const report = (...cases: string[]): string =>
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<testsuites name="bun test">',
        '  <testsuite name="src/a.test.ts" file="src/a.test.ts">',
        ...cases,
        '  </testsuite>',
        '</testsuites>',
        '',
      ].join('\n');
    const passing = (title: string): string =>
      `    <testcase name="${title}" classname="d" time="0.1" file="src/a.test.ts" />`;
    const spec = [
      '### Requirement: one',
      '#### Scenario: [DEMO-001] first',
      '#### Scenario: [DEMO-002] second',
      '#### Scenario: [DEMO-003] third',
      '',
    ].join('\n');
    const citations = (xml: string): ReadonlySet<string> => passedCitations(readJUnitReport(xml));

    /** Bun 1.4.2's own output, copied from a run of a five-case scratch file. */
    const asBunWritesIt = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<testsuites name="bun test" tests="5" assertions="3" failures="1" skipped="2" time="0.04">',
      '  <testsuite name="src/a.test.ts" file="src/a.test.ts" tests="5" failures="1" skipped="2" time="0.001" hostname="pop-os">',
      '    <testsuite name="outer group" file="src/a.test.ts" line="3" tests="4" failures="1" skipped="2" time="0" hostname="pop-os">',
      '      <testsuite name="inner group" file="src/a.test.ts" line="4" tests="1" failures="0" skipped="0" time="0" hostname="pop-os">',
      '        <testcase name="[DEMO-001] passes plainly" classname="inner group &gt; outer group" time="0.000026" file="src/a.test.ts" line="5" assertions="1" />',
      '      </testsuite>',
      '      <testcase name="[DEMO-002] has &lt;angle&gt; &amp; &quot;quotes&quot; and &apos;apostrophes&apos;" classname="outer group" time="0.000013" file="src/a.test.ts" line="9" assertions="1" />',
      '      <testcase name="[DEMO-003] is skipped" classname="outer group" time="0" file="src/a.test.ts" line="12" assertions="0">',
      '        <skipped />',
      '      </testcase>',
      '      <testcase name="fails on purpose with &lt;tag&gt;" classname="outer group" time="0.000281" file="src/a.test.ts" line="15" assertions="1">',
      '        <failure type="AssertionError" message="expect(received).toBe(expected)&#10;&#10;Expected: 5&#10;Received: 4&#10;">AssertionError&#10;      at src/a.test.ts:16:15&#10;</failure>',
      '      </testcase>',
      '      <testcase name="is a todo" classname="outer group" time="0" file="src/a.test.ts" line="18" assertions="0">',
      '        <skipped message="TODO" />',
      '      </testcase>',
      '    </testsuite>',
      '  </testsuite>',
      '</testsuites>',
      '',
    ].join('\n');

    it('reads an identifier out of a passing test title', () => {
      expect([
        ...citations(report(passing('[DEMO-001] a cited case'), passing('an uncited case'))),
      ]).toEqual(['DEMO-001']);
    });

    it('names a scenario that no passing test cites', () => {
      expect([
        uncoveredScenarios(
          spec,
          citations(report(passing('[DEMO-001] a'), passing('[DEMO-002] b'))),
        ),
        uncoveredScenarios(
          spec,
          citations(
            report(passing('[DEMO-001] a'), passing('[DEMO-002] b'), passing('[DEMO-003] c')),
          ),
        ),
      ]).toEqual([['DEMO-003'], []]);
    });

    it('does not count a skipped or a failing test as coverage', () => {
      const skipped =
        '    <testcase name="[DEMO-001] a" classname="d" file="src/a.test.ts"><skipped /></testcase>';
      const failing =
        '    <testcase name="[DEMO-002] b" classname="d" file="src/a.test.ts"><failure message="x">no</failure></testcase>';
      expect(
        uncoveredScenarios(spec, citations(report(skipped, failing, passing('[DEMO-003] c')))),
      ).toEqual(['DEMO-001', 'DEMO-002']);
    });

    it('does not read a citation out of a comment or out of failure text', () => {
      const commented = `    <!-- <testcase name="[DEMO-001] a" file="src/a.test.ts" /> -->`;
      const inText =
        '    <testcase name="[DEMO-003] c" classname="d" file="src/a.test.ts"><failure message="expected name=&quot;[DEMO-002] b&quot;">t</failure></testcase>';
      expect([...citations(report(commented, inText))]).toEqual([]);
    });

    it('reads the report Bun really writes, nesting, escapes and outcomes included', () => {
      expect(readJUnitReport(asBunWritesIt)).toEqual([
        { name: '[DEMO-001] passes plainly', file: 'src/a.test.ts', outcome: 'passed' },
        {
          name: `[DEMO-002] has <angle> & "quotes" and 'apostrophes'`,
          file: 'src/a.test.ts',
          outcome: 'passed',
        },
        { name: '[DEMO-003] is skipped', file: 'src/a.test.ts', outcome: 'skipped' },
        { name: 'fails on purpose with <tag>', file: 'src/a.test.ts', outcome: 'failed' },
        { name: 'is a todo', file: 'src/a.test.ts', outcome: 'skipped' },
      ]);
      expect([...passedCitations(readJUnitReport(asBunWritesIt))]).toEqual([
        'DEMO-001',
        'DEMO-002',
      ]);
    });

    it('refuses a report that holds no testcase', () => {
      expect(() => readJUnitReport(report())).toThrow('holds no testcase');
    });

    it('refuses a report that is not a JUnit document', () => {
      expect(() => readJUnitReport('[DEMO-001] not xml at all')).toThrow('no XML declaration');
    });

    it('refuses a report whose declaration is malformed', () => {
      expect(() =>
        readJUnitReport(
          `<?xml garbage?>\n<testsuites>\n${passing('[DEMO-001] a')}\n</testsuites>\n`,
        ),
      ).toThrow('malformed attribute on <?xml>: garbage');
    });

    it('refuses text outside the root element', () => {
      expect(() => readJUnitReport(`${report(passing('[DEMO-001] a'))}trailing junk\n`)).toThrow(
        'text outside its root element: trailing junk',
      );
    });

    it('refuses a report whose root is not testsuites', () => {
      expect(() =>
        readJUnitReport(
          '<?xml version="1.0"?>\n<coverage>\n  <testcase name="[DEMO-001] a" file="src/a.test.ts" />\n</coverage>\n',
        ),
      ).toThrow('root is <coverage>');
    });

    it('refuses a report that closes an element that is not open', () => {
      expect(() =>
        readJUnitReport(
          `<?xml version="1.0"?>\n<testsuites>\n  <testsuite name="s">\n${passing('[DEMO-001] a')}\n</testsuites>\n`,
        ),
      ).toThrow('closes <testsuites> where <testsuite> is open');
    });

    it('refuses a report that leaves an element open', () => {
      expect(() =>
        readJUnitReport(
          `<?xml version="1.0"?>\n<testsuites>\n  <testsuite name="s">\n${passing('[DEMO-001] a')}\n`,
        ),
      ).toThrow('never closes <testsuites>, <testsuite>');
    });

    it('refuses a truncated report', () => {
      expect(() =>
        readJUnitReport('<?xml version="1.0"?>\n<testsuites>\n  <testsuite name="s"'),
      ).toThrow('unterminated tag');
    });

    it('refuses a testcase that names no file', () => {
      expect(() => readJUnitReport(report('    <testcase name="[DEMO-001] a" />'))).toThrow(
        'no name or no file',
      );
    });

    it('refuses a testcase outside any testsuite', () => {
      expect(() =>
        readJUnitReport(
          `<?xml version="1.0"?>\n<testsuites>\n${passing('[DEMO-001] a')}\n</testsuites>\n`,
        ),
      ).toThrow('testcase outside any testsuite');
    });

    it('refuses a repeated attribute', () => {
      expect(() =>
        readJUnitReport(
          report('    <testcase name="[DEMO-001] a" file="src/a.test.ts" name="[DEMO-002] b" />'),
        ),
      ).toThrow('repeats testcase/@name');
    });

    it('refuses an unescaped angle bracket in an attribute value', () => {
      expect(() =>
        readJUnitReport(report('    <testcase name="a < b" file="src/a.test.ts" />')),
      ).toThrow('unescaped < in testcase/@name');
    });

    it('refuses an attribute whose value is never closed', () => {
      expect(() =>
        readJUnitReport(
          '<?xml version="1.0"?>\n<testsuites><testsuite name="s"><testcase name="[DEMO-001] a" file="src/a.test.ts" broken="/></testsuite></testsuites>\n',
        ),
      ).toThrow('never closes an attribute value');
    });

    it('refuses an entity it does not know', () => {
      expect(() =>
        readJUnitReport(report('    <testcase name="a &nbsp; b" file="src/a.test.ts" />')),
      ).toThrow('unknown entity in testcase/@name: &nbsp;');
    });
  });
  ```

- [ ] D2 Run the focused file and record the red. All nineteen fail together for one reason: the module does not resolve the three new imports, so the whole file fails to load. This is an import-resolution failure, not nineteen separately executed cases. Save the output.
- [ ] D3 Append to `test-levels.ts` exactly this content. It **replaces nothing**; slices A to C are untouched.

  ```ts
  /* ─── slice D adds everything below this line ─────────────────────────────── */

  /** What one `<testcase>` of a JUnit report says happened. */
  export type CaseOutcome = 'passed' | 'skipped' | 'failed';

  /** One `<testcase>` of a JUnit report. */
  export interface JUnitCase {
    readonly name: string;
    /** The path the runner named the file with, relative to the run's working directory. */
    readonly file: string;
    readonly outcome: CaseOutcome;
  }

  /** The named entities Bun 1.4.2 writes into an attribute value. */
  const NAMED_ENTITY = new Map<string, string>([
    ['amp', '&'],
    ['apos', "'"],
    ['gt', '>'],
    ['lt', '<'],
    ['quot', '"'],
  ]);

  /**
   * One attribute value with its character references resolved.
   *
   * Bun escapes the five named entities and writes every other awkward character
   * as a numeric reference: a newline inside `failure/@message` reaches the file
   * as `&#10;`. Any other reference is refused rather than copied through,
   * because a reader that passes `&garbage;` into a test name changes the title a
   * citation is read out of.
   *
   * @throws when the value holds a reference this reader does not know.
   */
  function decodeReferences(value: string, attribute: string): string {
    let decoded = '';
    let at = 0;
    while (at < value.length) {
      const ampersand = value.indexOf('&', at);
      if (ampersand === -1) {
        decoded += value.slice(at);
        break;
      }
      decoded += value.slice(at, ampersand);
      const semicolon = value.indexOf(';', ampersand);
      const body = semicolon === -1 ? '' : value.slice(ampersand + 1, semicolon);
      const named = NAMED_ENTITY.get(body);
      const decimal = /^#(\d+)$/.exec(body);
      const hexadecimal = /^#(?:x|X)([0-9a-fA-F]+)$/.exec(body);
      if (named !== undefined) decoded += named;
      else if (decimal !== null) decoded += String.fromCodePoint(Number(decimal[1]));
      else if (hexadecimal !== null) decoded += String.fromCodePoint(parseInt(hexadecimal[1], 16));
      else throw new Error(`the JUnit report has an unknown entity in ${attribute}: &${body};`);
      at = semicolon + 1;
    }
    return decoded;
  }

  /**
   * The attributes of one start tag, by name.
   *
   * Strict where a tolerant reader silently changes what the report says: a
   * repeated attribute has no defined value, and an unescaped `<` means the tag
   * ended somewhere other than where it looks like it ended. An attribute value
   * whose quote is never closed is refused earlier, by {@link tagEnd}.
   *
   * @throws when the tag holds anything but well-formed `name="value"` pairs.
   */
  function attributesOf(element: string, tagBody: string): ReadonlyMap<string, string> {
    const found = new Map<string, string>();
    let at = 0;
    while (at < tagBody.length) {
      const rest = tagBody.slice(at);
      const space = /^\s+/.exec(rest);
      if (space !== null) {
        at += space[0].length;
        continue;
      }
      const attribute = /^([A-Za-z_:][-\w:.]*)\s*=\s*"([^"<]*)"/.exec(rest);
      if (attribute === null) {
        const unescaped = /^([A-Za-z_:][-\w:.]*)\s*=\s*"[^"]*"/.exec(rest);
        if (unescaped !== null) {
          throw new Error(`the JUnit report has an unescaped < in ${element}/@${unescaped[1]}`);
        }
        throw new Error(`the JUnit report has a malformed attribute on <${element}>: ${rest}`);
      }
      const name = attribute[1];
      if (found.has(name)) throw new Error(`the JUnit report repeats ${element}/@${name}`);
      found.set(name, decodeReferences(attribute[2], `${element}/@${name}`));
      at += attribute[0].length;
    }
    return found;
  }

  /**
   * The index of the `>` that ends the tag beginning at `at`, quoted values kept
   * whole.
   *
   * `indexOf('>')` ends the tag inside `broken="/>` and reads the rest of the
   * document as attributes; this refuses the truncation instead, and distinguishes
   * a document that stops mid-tag from one whose attribute quote is never closed.
   *
   * @throws when no unquoted `>` closes the tag.
   */
  function tagEnd(xml: string, at: number): number {
    let quoted = false;
    for (let index = at + 1; index < xml.length; index += 1) {
      const character = xml[index];
      if (character === '"') quoted = !quoted;
      else if (character === '>' && !quoted) return index;
    }
    throw new Error(
      quoted
        ? 'the JUnit report never closes an attribute value'
        : 'the JUnit report has an unterminated tag',
    );
  }

  /**
   * Every test case of one JUnit report, read strictly.
   *
   * A tokenizer and not a regular expression over the whole document, because
   * `name="[X-001] …"` inside a comment, inside failure text, or inside an element
   * that was never closed is not a test that ran — and a report read loosely is a
   * coverage ledger that cannot fail. Only the `name` of a `testcase` inside a
   * `testsuite` counts, and a case with a `skipped`, `failure` or `error` child is
   * not a pass.
   *
   * Its limits, stated because the workspace carries no XML parser: it knows the
   * subset Bun 1.4.2's JUnit reporter writes. Attribute values must be
   * double-quoted; namespace declarations, DTDs and external entities are not
   * interpreted; and it validates structure and attribute syntax rather than the
   * whole XML grammar. Anything it cannot account for is refused, never skipped.
   *
   * @throws when the document has no or a malformed XML declaration, carries text
   * outside its root, has a root other than one `testsuites`, is truncated, closes
   * an element that is not open, leaves an element open, repeats or malforms an
   * attribute, never closes an attribute value, holds an unknown entity, holds a
   * `testcase` outside any `testsuite`, holds a `testcase` with no name or no
   * file, or holds no test case at all.
   */
  export function readJUnitReport(xml: string): readonly JUnitCase[] {
    const declaration = /^\s*<\?xml\s([^<>]*)\?>/.exec(xml);
    if (declaration === null) throw new Error('the JUnit report has no XML declaration');
    if (attributesOf('?xml', declaration[1]).get('version') === undefined) {
      throw new Error("the JUnit report's XML declaration names no version");
    }

    const cases: JUnitCase[] = [];
    /** The element names still open, outermost first. */
    const open: string[] = [];
    /** Indices into `cases` for the `testcase` elements still open. */
    const openCases: number[] = [];
    let root: string | undefined;
    let at = declaration[0].length;

    while (at < xml.length) {
      const next = xml.indexOf('<', at);
      const text = xml.slice(at, next === -1 ? xml.length : next);
      if (open.length === 0 && text.trim() !== '') {
        throw new Error(`the JUnit report has text outside its root element: ${text.trim()}`);
      }
      if (next === -1) break;
      at = next;
      if (xml.startsWith('<!--', at)) {
        const ends = xml.indexOf('-->', at + 4);
        if (ends === -1) throw new Error('the JUnit report has an unterminated comment');
        at = ends + 3;
        continue;
      }
      if (xml.startsWith('<![CDATA[', at)) {
        const ends = xml.indexOf(']]>', at + 9);
        if (ends === -1) throw new Error('the JUnit report has an unterminated CDATA section');
        at = ends + 3;
        continue;
      }
      const ends = tagEnd(xml, at);
      const body = xml.slice(at + 1, ends);
      at = ends + 1;

      if (body.startsWith('?') || body.startsWith('!')) continue;
      if (body.startsWith('/')) {
        const closing = body.slice(1).trim();
        const last = open.pop();
        if (last !== closing) {
          throw new Error(
            `the JUnit report closes <${closing}> where <${last ?? 'nothing'}> is open`,
          );
        }
        if (closing === 'testcase') openCases.pop();
        continue;
      }
      const selfClosing = body.endsWith('/');
      const named = /^([A-Za-z_:][-\w:.]*)([\s\S]*)$/.exec(selfClosing ? body.slice(0, -1) : body);
      if (named === null) throw new Error(`the JUnit report has a malformed tag: <${body}>`);
      const element = named[1];
      if (open.length === 0) {
        if (root !== undefined) throw new Error('the JUnit report has more than one root element');
        if (element !== 'testsuites') {
          throw new Error(`the JUnit report's root is <${element}>, not <testsuites>`);
        }
        root = element;
      }
      const attributes = attributesOf(element, named[2]);

      if (element === 'testcase') {
        if (!open.includes('testsuite')) {
          throw new Error('the JUnit report holds a testcase outside any testsuite');
        }
        const title = attributes.get('name');
        const file = attributes.get('file');
        if (title === undefined || file === undefined) {
          throw new Error('the JUnit report holds a testcase with no name or no file');
        }
        cases.push({ name: title, file, outcome: 'passed' });
        if (!selfClosing) openCases.push(cases.length - 1);
      } else if (element === 'skipped' || element === 'failure' || element === 'error') {
        const owner = openCases.at(-1);
        if (owner !== undefined) {
          cases[owner] = { ...cases[owner], outcome: element === 'skipped' ? 'skipped' : 'failed' };
        }
      }
      if (!selfClosing) open.push(element);
    }

    if (open.length > 0) throw new Error(`the JUnit report never closes <${open.join('>, <')}>`);
    if (cases.length === 0) throw new Error('the JUnit report holds no testcase');
    return cases;
  }

  /**
   * The scenario identifiers cited by a test that ran **and passed**.
   *
   * A skipped or failing test cites a scenario it did not prove, so it does not
   * cover it.
   */
  export function passedCitations(cases: readonly JUnitCase[]): ReadonlySet<string> {
    const cited = new Set<string>();
    for (const one of cases) {
      if (one.outcome !== 'passed') continue;
      const id = SCENARIO_IDENTIFIER.exec(one.name)?.[1];
      if (id !== undefined) cited.add(id);
    }
    return cited;
  }

  /** The capability's scenario identifiers that no passing test cites, in document order. */
  export function uncoveredScenarios(
    specMarkdown: string,
    cited: ReadonlySet<string>,
  ): readonly string[] {
    return scenarioIdentifiers(specMarkdown).filter((id) => !cited.has(id));
  }
  ```

- [ ] D4 Run the focused file. Expected: exit 0, D0's N+19, 0 fail. Observed here: `33 pass`, `0 fail`, `Ran 33 tests across 1 file.`
- [ ] D5 Execute rows D-1 through D-16 of section 11 independently, each with §12's block and §12's literal fragments, restoring and rerunning the complete focused file green between faults. Sixteen guards, sixteen faults: one malformed fixture must not stand in for another guard. Then add one dated `Proof:` comment per row beside the guard it establishes, and append sixteen proof rows to `verify.md`.
- [ ] D6 Append evidence to `verify.md`. Publish evidence references as basenames only. Do not copy absolute clone paths or expanded temporary-root paths into `verify.md`. Record unavailable whole-suite checks as pending planner verification. **Then** format the three owned paths, and run `nx format:check --all`, `tool-devsync:typecheck`, `tool-devsync:lint` and the focused file. `simple-import-sort/imports` and `prettier/prettier` were the only diagnostics seen here; preamble rule 17 covers them.

**Hand-over.** `tools/tool-devsync/src/test-levels.ts`,
`tools/tool-devsync/src/test-levels.test.ts`,
`openspec/changes/test-axes/verify.md`.
Do not discover or update whole-suite pins in the executor. If a reviewed
amendment changes their inputs, report the named pin as pending planner
verification.
Subject: `feat(test-axes): read a JUnit report strictly enough to join it to scenarios`.

## 11a. Slice E — provenance, the coverage command and the table

**Entry conditions.** Slice D is committed; the focused file passes;
`tools/tool-devsync/src/scenario-coverage-cli.ts` does not exist.

- [ ] E0 Record the focused file's total N. This slice adds two cases and finishes at N+2 — **35 on this planner's tree**.
- [ ] E1 Append slice E's two cases to `test-levels.test.ts` and add `assertReportCovers` and `levelTargetNamed` to the import list.

  ```ts
  describe('the report a declared level target wrote', () => {
    it('names a level target that is declared, and refuses one that is not', () => {
      expect(levelTargetNamed('wbs-core:test:unit').report).toBe('tmp/junit/wbs-core.unit.xml');
      expect(() => levelTargetNamed('wbs-core:test')).toThrow('is not a declared level target');
    });

    it('refuses a report naming a file the target does not collect', () => {
      const target = levelTargetNamed('wbs-core:test:unit');
      const cases = [
        { name: '[DEMO-001] a', file: 'src/other.test.ts', outcome: 'passed' as const },
      ];
      expect(() => {
        assertReportCovers(target, cases, ['src/a.test.ts']);
      }).toThrow('did not collect src/other.test.ts');
    });
  });
  ```

- [ ] E2 Run the focused file and record the red. Both fail together for one reason: the module does not resolve `assertReportCovers` and `levelTargetNamed`, so the whole file fails to load. This is an import-resolution failure, not two separately executed cases. Save the output.
- [ ] E3 First extend `test-levels.ts`'s existing import to `import { readFile, stat } from 'node:fs/promises';` — `assertReportIsCurrent` below is the first user of `stat`. Then append:

  ```ts
  /**
   * @throws when the report names a file the target does not collect — the report
   * of another target, or of a run against another tree.
   */
  export function assertReportCovers(
    target: LevelTarget,
    cases: readonly JUnitCase[],
    collected: readonly string[],
  ): void {
    const known = new Set(collected);
    const foreign = [...new Set(cases.map(({ file }) => file))].filter((file) => !known.has(file));
    if (foreign.length > 0) {
      throw new Error(
        `${target.project}:${target.target} did not collect ${foreign.sort().join(', ')}; ` +
          `${target.report} is the report of another run`,
      );
    }
  }

  /**
   * @throws when a file the report names has changed since the report was written.
   *
   * The design's manual-report rule in the small: a report goes stale when
   * something it measured changed, and a stale report read as coverage is a
   * green row for a test nobody ran. A heuristic, and stated as one: it compares
   * the modification times of the test files the report itself names, not of
   * their production dependencies and not of the specification, so a changed
   * dependency with an unchanged test file does not make the report stale here.
   */
  export async function assertReportIsCurrent(
    target: LevelTarget,
    cases: readonly JUnitCase[],
  ): Promise<void> {
    const written = (await stat(new URL(target.report, WORKSPACE))).mtimeMs;
    const stale: string[] = [];
    for (const file of new Set(cases.map(({ file }) => file))) {
      const source = (await stat(new URL(`${target.root}/${file}`, WORKSPACE))).mtimeMs;
      if (source > written) stale.push(file);
    }
    if (stale.length > 0) {
      throw new Error(
        `${target.report} is older than ${stale.sort().join(', ')}; rerun ${target.project}:${target.target}`,
      );
    }
  }

  /** One declared level target, by its `project:target` name. */
  export function levelTargetNamed(qualified: string): LevelTarget {
    const found = LEVEL_TARGETS.find(({ project, target }) => `${project}:${target}` === qualified);
    if (found === undefined) throw new Error(`${qualified} is not a declared level target`);
    return found;
  }
  ```

- [ ] E4 Run the focused file. Expected: exit 0, E0's N+2 — **35 on this planner's tree** — and 0 fail.
- [ ] E5 Create `tools/tool-devsync/src/scenario-coverage-cli.ts` with exactly this content. `argv.at(0)` and not a destructured `[capability]`: `strictTypeChecked` is on and `noUncheckedIndexedAccess` is not set, so a destructured element types as `string` and the undefined test becomes a lint error.

  ```ts
  import { readFile } from 'node:fs/promises';

  import {
    assertReportCovers,
    assertReportIsCurrent,
    collectedFiles,
    levelTargetNamed,
    parseLevelCommand,
    passedCitations,
    readJUnitReport,
    readManifest,
    readSpec,
    scenarioIdentifiers,
    uncoveredScenarios,
    WORKSPACE,
  } from './test-levels';

  /**
   * Prints the scenario coverage table of one capability from the JUnit reports of
   * the declared level targets that were named.
   *
   * Usage: `bun tools/tool-devsync/src/scenario-coverage-cli.ts <capability> <project:target>…`
   *
   * The report path is not an argument: it is the one the declaration names, so a
   * caller cannot hand the join a file from somewhere else. Each report is then
   * checked against the target that was supposed to write it and against the
   * modification times of the files it names.
   *
   * The hand-run predecessor of `twib coverage scenarios`. It computes no
   * disposition and refuses no scenario: rule T2 is not enforced yet, so an
   * uncovered scenario is reported and the command still exits zero.
   *
   * @throws when no capability or no target is named, when a named target is not a
   * declared level target or is absent from its manifest, when its report is
   * absent, unreadable, malformed, written by another run or older than a file it
   * names, or when the specification has a scenario with no identifier.
   */
  async function main(): Promise<void> {
    const argv = Bun.argv.slice(2);
    const capability = argv.at(0);
    const names = argv.slice(1);
    if (capability === undefined || names.length === 0) {
      throw new Error('usage: scenario-coverage-cli.ts <capability> <project:target>…');
    }
    const spec = await readSpec(capability);
    const cited = new Set<string>();
    for (const name of names) {
      const target = levelTargetNamed(name);
      const manifest = await readManifest(target.root);
      const command = manifest.targets[target.target]?.options?.command;
      if (command === undefined) throw new Error(`${name} is not declared in its project manifest`);
      const collected = collectedFiles(target.root, parseLevelCommand(command).selector);
      let text;
      try {
        text = await readFile(new URL(target.report, WORKSPACE), 'utf8');
      } catch (cause) {
        // Context and rethrow: an absent or unreadable report is trusted state
        // that is gone, and an empty ledger in its place reads as full coverage.
        throw new Error(`${name} has no readable report at ${target.report}`, { cause });
      }
      const cases = readJUnitReport(text);
      assertReportCovers(target, cases, collected);
      await assertReportIsCurrent(target, cases);
      for (const id of passedCitations(cases)) cited.add(id);
    }
    const uncovered = new Set(uncoveredScenarios(spec, cited));
    const rows = scenarioIdentifiers(spec).map(
      (id) => `| ${id} | ${uncovered.has(id) ? '**no**' : 'yes'} |`,
    );
    console.log(
      ['| Scenario | Covered by a passing citing test |', '| --- | --- |', ...rows].join('\n'),
    );
  }

  await main();
  ```

  The report path is **not** an argument. A caller names declared level targets,
  and the command reads the report each one was supposed to write, checks it
  against that target's own collected files and against the modification times
  of the files it names. A join that accepts any file is a coverage ledger that
  cannot fail.

- [ ] E6 Run the two targets that hold the capability's tests, then the command. Two targets, because `wbs-store-sqlite:test:unit` holds none of them.

  ```sh
  set -euo pipefail
  mkdir -p "$TMPDIR/evidence"
  env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT NX_DAEMON=false bunx nx run wbs-store-sqlite:test:api
  env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT NX_DAEMON=false bunx nx run wbs-core:test:unit
  bun tools/tool-devsync/src/scenario-coverage-cli.ts project-assignment-reads \
    wbs-store-sqlite:test:api wbs-core:test:unit | tee "$TMPDIR/evidence/coverage-table.md"
  ```

  Expected, observed on 2026-09-20:

  ```text
  | Scenario | Covered by a passing citing test |
  | --- | --- |
  | PROJECT-ASSIGNMENT-READS-001 | yes |
  | PROJECT-ASSIGNMENT-READS-002 | yes |
  | PROJECT-ASSIGNMENT-READS-003 | yes |
  ```

  Any edit to a source file after this run makes the next command refuse the
  report as stale; rerun the target rather than working around it.

- [ ] E7 Execute the false-coverage and declaration negatives, rows E-1 through E-10 of section 11, using §12's E-specific procedures. Before starting, confirm `tmp/junit/wbs-store-sqlite.unit.xml` exists — run `wbs-store-sqlite:test:unit` first if this clone has not already produced it; E-3 copies that report over `…api.xml`. Each is a production-path negative: no fixture, no fake report. Only E-1 and E-2 rerun the API target while the fault is present; E-3 through E-10 invoke only the coverage CLI, never the level target — rerunning the target regenerates the report and erases the fault before the CLI can observe it. After restoring each fault, rerun the three declared targets and require E6's three-row green table before moving to the next row.

  Rows E-7 through E-10 are the declaration checks that E-1 to E-6 never reach:
  no arguments; the capability with no targets; an undeclared target name; and a
  declared target whose manifest command is gone. For the three argument faults,
  save the passing and faulty invocations under the temporary root, their diff
  and the failing output. For the manifest fault, temporarily delete exactly
  `targets["test:unit"].options.command` in
  `libs/wbs/application/core/project.json` with a **structural JSON edit** —
  address the value by its JSON path, re-serialise the object, and never select
  an occurrence by matching an identical line; the aggregate `test` target
  carries a byte-identical `command` line earlier in the same file and two
  executor attempts have already patched the wrong one. Save the patch, restore
  and compare bytes **before** asserting, then rerun green. That manifest file is
  authorized only for this temporary fault; it must have no final diff.

- [ ] E8 Add a dated, observed `Proof:` comment beside every check rows E-1 through E-10 establish — `assertReportCovers`, `assertReportIsCurrent`, the usage guard, `levelTargetNamed`'s refusal and the CLI's `is not declared in its project manifest` guard — and record every proof separately. Publish evidence references as basenames only. Do not copy absolute clone paths or expanded temporary-root paths into `verify.md`. Record unavailable whole-suite checks as pending planner verification. Then append the final evidence block to `verify.md`: E6's commands with exit statuses and totals; the coverage table verbatim; a proof row for every row of section 11; the findings of section 14; the answer to `verify.md`'s section 7 open item — `source-conformance.test.ts` needs no distinguishing suffix, because row 2 of the level table resolves it through target membership, which the isolation case exercises on the real target; and what was not done, namely that `tasks.md` stays unticked.
- [ ] E9 Format the four owned paths, then `nx format:check --all`, `tool-devsync:typecheck`, `tool-devsync:lint` and the focused file.

**Hand-over.** `tools/tool-devsync/src/test-levels.ts`,
`tools/tool-devsync/src/test-levels.test.ts`,
`tools/tool-devsync/src/scenario-coverage-cli.ts`,
`openspec/changes/test-axes/verify.md`.
Do not discover or update whole-suite pins in the executor. If a reviewed
amendment changes their inputs, report the named pin as pending planner
verification. `scenario-coverage-cli.ts` is a **new** file, and the namespacing
handover's index checker refuses untracked diagnostic paths: until the planner
stages it, `tool-devsync:test` fails the case `the production index checker
resolves current Markdown links and anchors` with `index checks cannot resolve
untracked diagnostic paths: tools/tool-devsync/src/scenario-coverage-cli.ts`.
Observed on this tree 2026-09-20; staged, the same run was 336 pass, 0 fail. The
executor cannot stage, so it reports that case as pending planner verification
and does not treat it as a defect.
Subject: `feat(test-axes): join a trusted JUnit report to one capability's scenarios`.

## 11. Every guard and the fault that proves it

Every row was injected, observed and restored on this worktree on 2026-09-20.
The named test must fail with the named message; other tests failing at the same
time are recorded, not a stop.

| Row           | Slice | Guard                                                                            | Fault                                                                                                                                                               | Test that fails                                                                        | Observed message                                                                                                                                                                                                                                                                                                                            |
| ------------- | ----- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A-1           | A     | Row 2 of the level table beats row 6                                             | delete the `conformanceFiles.includes(…)` line from `levelOf`                                                                                                       | `resolves the plain and the database conformance suffixes through target membership`   | received `["api","unit","api","unit"]` against expected `["conformance","conformance","api","unit"]`                                                                                                                                                                                                                                        |
| A-2           | A     | An unclassified test file throws                                                 | replace `levelOf`'s final `throw` with `return 'unit';`                                                                                                             | `refuses a file that matches no row`                                                   | the case fails: nothing was thrown                                                                                                                                                                                                                                                                                                          |
| A-3           | A     | No test file hides outside a declared test root                                  | delete the one `KNOWN_OUTSIDE_TEST_ROOTS` entry                                                                                                                     | `keeps every test file outside a declared test root on the known list`                 | names `libs/wbs/application/core/testing/portable-composition.spec.ts`                                                                                                                                                                                                                                                                      |
| B-1           | B     | A level target collects only its own level (TEST-AXES-004)                       | delete `! -name 'source-conformance.db.test.ts' ` from `test:api`                                                                                                   | `collects exactly the files of its own level`                                          | `wbs-store-sqlite:test:api is declared api and collects src/testing/source-conformance.db.test.ts, which is conformance`                                                                                                                                                                                                                    |
| B-2           | B     | Every level target writes a JUnit report                                         | delete ` --reporter=junit` from `wbs-core:test:unit`                                                                                                                | `writes a JUnit report where the declaration says`                                     | `wbs-core:test:unit does not pass --reporter=junit`                                                                                                                                                                                                                                                                                         |
| B-3           | B     | A level target may not filter which tests run                                    | append ` --test-name-pattern=NO_MATCH` to `test:api`'s flags                                                                                                        | `collects exactly the files of its own level` and the report case                      | `wbs-store-sqlite:test:api command shape: a declared level target may not pass --test-name-pattern=NO_MATCH; only coverage and JUnit reporting flags are allowed`                                                                                                                                                                           |
| B-4           | B     | A failing selector throws                                                        | replace the entire selector between `$(` and `)` in `test:api`'s command, including its `\| tr '\n' ' '` pipeline, with `find src --bogus-flag`                     | `collects exactly the files of its own level`                                          | Throws before the array assertion; the diagnostic contains `the file selector failed`.                                                                                                                                                                                                                                                      |
| B-5           | B     | Every test-running target is accounted for                                       | replace `AGGREGATE_TARGETS`' array with `[]`                                                                                                                        | `accounts for every test-running target as a level, an aggregate or a known exception` | names `wbs-core:test` and `wbs-store-sqlite:test`                                                                                                                                                                                                                                                                                           |
| B-6           | B     | A level target does not omit a file it owns (completeness half of TEST-AXES-004) | insert `! -name 'assignment-scope.db.test.ts'` into `test:api`'s `find` selector                                                                                    | `collects exactly the files of its own level`                                          | `wbs-store-sqlite:test:api is declared api and does not collect src/assignment-scope.db.test.ts, which is api`                                                                                                                                                                                                                              |
| B-7           | B     | Every level target writes its JUnit report to the declared path                  | change only `wbs-core:test:unit`'s reporter outfile basename to `wrong.xml`                                                                                         | `writes a JUnit report where the declaration says`                                     | `wbs-core:test:unit does not write ../../../../tmp/junit/wbs-core.unit.xml`                                                                                                                                                                                                                                                                 |
| B-8           | B     | Every level target creates its report directory                                  | change only that command's `mkdir` directory to `../../../../tmp/wrong`, retaining the correct outfile                                                              | `writes a JUnit report where the declaration says`                                     | `wbs-core:test:unit does not create ../../../../tmp/junit`                                                                                                                                                                                                                                                                                  |
| B-9           | B     | A level target runs in its declared project root (`cwd`)                         | change only `wbs-core:test:unit.options.cwd` to `libs/wbs/application`                                                                                              | `collects exactly the files of its own level`                                          | `wbs-core:test:unit runs in libs/wbs/application, not libs/wbs/application/core`                                                                                                                                                                                                                                                            |
| C-1           | C     | A specification with no scenario heading throws                                  | delete the `#### Scenario:` guard from `assertSpecification`                                                                                                        | `refuses a specification that holds no scenario`                                       | nothing was thrown; received value `[]`                                                                                                                                                                                                                                                                                                     |
| C-2           | C     | A scenario with no identifier throws                                             | delete the `unidentified.length > 0` guard from `scenarioIdentifiers`                                                                                               | `refuses a specification whose scenario carries no identifier`                         | nothing was thrown; received value `[ "DEMO-001" ]`                                                                                                                                                                                                                                                                                         |
| C-3           | C     | Every scenario of the capability carries an identifier                           | delete `[PROJECT-ASSIGNMENT-READS-002] ` from the specification                                                                                                     | `leaves no scenario without an identifier`                                             | received `Assignment write among unrelated projects` against an expected `[]`; also fails `allocates the identifiers once and in order`                                                                                                                                                                                                     |
| C-4           | C     | A specification with no requirement heading throws                               | delete the `### Requirement:` guard from `assertSpecification`                                                                                                      | `refuses a specification that holds no requirement`                                    | nothing was thrown; received value `[]`                                                                                                                                                                                                                                                                                                     |
| D-1           | D     | A skipped or failing test is not coverage                                        | delete `if (one.outcome !== 'passed') continue;` from `passedCitations`                                                                                             | `does not count a skipped or a failing test as coverage`                               | received `[]` against `[ "DEMO-001", "DEMO-002" ]`; also fails `does not read a citation out of a comment or out of failure text` and `reads the report Bun really writes, nesting, escapes and outcomes included`                                                                                                                          |
| D-2           | D     | A report with no test case throws                                                | delete the `cases.length === 0` guard from `readJUnitReport`                                                                                                        | `refuses a report that holds no testcase`                                              | nothing was thrown; received value `[]`                                                                                                                                                                                                                                                                                                     |
| D-3           | D     | A document with no XML declaration throws                                        | replace the `declaration === null` throw by defaulting the match to `['', 'version="1.0"']`                                                                         | `refuses a report that is not a JUnit document`                                        | threw `the JUnit report has text outside its root element: [DEMO-001] not xml at all` instead                                                                                                                                                                                                                                               |
| D-4           | D     | The declaration's own attributes are parsed                                      | delete the `XML declaration names no version` block, the only caller of `attributesOf` on the declaration                                                           | `refuses a report whose declaration is malformed`                                      | threw `the JUnit report holds a testcase outside any testsuite` instead                                                                                                                                                                                                                                                                     |
| D-5           | D     | Text outside the root throws                                                     | delete the `text.trim() !== ''` block                                                                                                                               | `refuses text outside the root element`                                                | nothing was thrown; received one `passed` case named `[DEMO-001] a`                                                                                                                                                                                                                                                                         |
| D-6           | D     | The root element must be `testsuites`                                            | delete the `element !== 'testsuites'` throw                                                                                                                         | `refuses a report whose root is not testsuites`                                        | threw `the JUnit report holds a testcase outside any testsuite` instead                                                                                                                                                                                                                                                                     |
| D-7           | D     | An end tag must match the element that is open                                   | delete the `last !== closing` throw                                                                                                                                 | `refuses a report that closes an element that is not open`                             | threw `the JUnit report never closes <testsuites>` instead                                                                                                                                                                                                                                                                                  |
| D-8           | D     | No element may be left open at the end                                           | delete the `open.length > 0` throw                                                                                                                                  | `refuses a report that leaves an element open`                                         | nothing was thrown; received one `passed` case named `[DEMO-001] a`                                                                                                                                                                                                                                                                         |
| D-9           | D     | A tag with no unquoted `>` throws                                                | replace `tagEnd`'s throw with `return xml.length;`                                                                                                                  | `refuses a truncated report`                                                           | threw `the JUnit report never closes <testsuites>, <testsuite>` instead; also fails `refuses an attribute whose value is never closed`                                                                                                                                                                                                      |
| D-10          | D     | Truncation is distinguished from an attribute value that is never closed         | replace `tagEnd`'s `quoted ? … : …` with the `unterminated tag` message alone                                                                                       | `refuses an attribute whose value is never closed`                                     | threw `the JUnit report has an unterminated tag` instead                                                                                                                                                                                                                                                                                    |
| D-11          | D     | A `testcase` must sit inside a `testsuite`                                       | delete the `!open.includes('testsuite')` throw                                                                                                                      | `refuses a testcase outside any testsuite`                                             | nothing was thrown; received one `passed` case named `[DEMO-001] a`                                                                                                                                                                                                                                                                         |
| D-12          | D     | A `testcase` must carry both a name and a file                                   | replace the two `attributes.get` reads with `?? ''` and delete the throw                                                                                            | `refuses a testcase that names no file`                                                | nothing was thrown; received a case whose `file` is `""`                                                                                                                                                                                                                                                                                    |
| D-13          | D     | An attribute may not repeat on one tag                                           | delete the `found.has(name)` throw                                                                                                                                  | `refuses a repeated attribute`                                                         | nothing was thrown; received the case named `[DEMO-002] b` — the last value silently won                                                                                                                                                                                                                                                    |
| D-14          | D     | An attribute value may not hold an unescaped `<`                                 | widen the attribute pattern's `[^"<]*` to `[^"]*`                                                                                                                   | `refuses an unescaped angle bracket in an attribute value`                             | nothing was thrown; received the case named `a < b`                                                                                                                                                                                                                                                                                         |
| D-15          | D     | An unknown entity throws                                                         | replace `decodeReferences`'s final `throw` with `decoded += `&${body};``                                                                                            | `refuses an entity it does not know`                                                   | nothing was thrown; received the case named `a &nbsp; b`                                                                                                                                                                                                                                                                                    |
| D-16          | D     | Attribute garbage throws                                                         | replace the `malformed attribute` throw with `at += 1; continue;`                                                                                                   | `refuses a report whose declaration is malformed`                                      | threw `the JUnit report's XML declaration names no version` instead                                                                                                                                                                                                                                                                         |
| E-1           | E     | A citation with no passing test is not coverage                                  | delete `[PROJECT-ASSIGNMENT-READS-001] ` from the API title, rerun `test:api`, rerun the command                                                                    | the coverage table                                                                     | exit **0**; the `PROJECT-ASSIGNMENT-READS-001` row reads `**no**`, the other two `yes`                                                                                                                                                                                                                                                      |
| E-2           | E     | A skipped test is not coverage                                                   | change that `it(` to `it.skip(`, rerun `test:api`, rerun the command                                                                                                | the coverage table                                                                     | exit **0**; the same `**no**` row, with the other two `yes`                                                                                                                                                                                                                                                                                 |
| E-3           | E     | A report of another run is refused                                               | copy `tmp/junit/wbs-store-sqlite.unit.xml` over `…api.xml`, rerun the command                                                                                       | the command                                                                            | `wbs-store-sqlite:test:api did not collect src/audit.test.ts, src/gate.test.ts, src/saved-plan-immutability.test.ts, src/schedule-input-hash.test.ts, src/source.test.ts, src/testing/faults.test.ts, src/working-plan-performance.test.ts; tmp/junit/wbs-store-sqlite.api.xml is the report of another run` — seven filenames, no ellipsis |
| E-4           | E     | An empty report is refused                                                       | replace only the API report's contents with `<?xml version="1.0" encoding="UTF-8"?><testsuites name="bun test"></testsuites>`                                       | the command                                                                            | `the JUnit report holds no testcase`                                                                                                                                                                                                                                                                                                        |
| E-5           | E     | A stale report is refused                                                        | append a harmless trailing newline to `libs/wbs/adapters/store-sqlite/src/assignment-scope.db.test.ts` (not `touch`, which leaves no content diff for §12's backup) | the command                                                                            | `tmp/junit/wbs-store-sqlite.api.xml is older than src/assignment-scope.db.test.ts; rerun wbs-store-sqlite:test:api`                                                                                                                                                                                                                         |
| E-6-absent    | E     | An absent report is refused                                                      | move `tmp/junit/wbs-core.unit.xml` into the evidence directory                                                                                                      | the command                                                                            | `wbs-core:test:unit has no readable report at tmp/junit/wbs-core.unit.xml` (`ENOENT` as the cause)                                                                                                                                                                                                                                          |
| E-6-directory | E     | An unreadable report is refused                                                  | move the report aside, then create a **directory** at `tmp/junit/wbs-core.unit.xml`                                                                                 | the command                                                                            | `wbs-core:test:unit has no readable report at tmp/junit/wbs-core.unit.xml` (`EISDIR` as the cause)                                                                                                                                                                                                                                          |
| E-7           | E     | The command refuses no arguments                                                 | invoke the coverage CLI with no arguments at all                                                                                                                    | the command                                                                            | `usage: scenario-coverage-cli.ts <capability> <project:target>…`                                                                                                                                                                                                                                                                            |
| E-8           | E     | The command refuses a capability with no target                                  | invoke it with `project-assignment-reads` alone                                                                                                                     | the command                                                                            | `usage: scenario-coverage-cli.ts <capability> <project:target>…`                                                                                                                                                                                                                                                                            |
| E-9           | E     | An undeclared target name is refused                                             | invoke it with `project-assignment-reads wbs-core:test`                                                                                                             | the command                                                                            | `wbs-core:test is not a declared level target`                                                                                                                                                                                                                                                                                              |
| E-10          | E     | A declared target absent from its manifest is refused                            | delete exactly `targets["test:unit"].options.command` in `libs/wbs/application/core/project.json` with a structural JSON edit                                       | the command                                                                            | `wbs-core:test:unit is not declared in its project manifest`                                                                                                                                                                                                                                                                                |

Rows B-6 through B-9 mutate `project.json` and `nx.json` values that the
focused test file reads statically; run these faults through the focused
devsync file using §12, not through the mutated level targets — `nx run` is
never invoked while one of these four faults is present.

Rows D-1 to D-16 are sixteen distinct guards of one reader. Execute them
independently: a single malformed fixture must not stand in for another guard,
which is exactly how the previous scanner passed nine assertions while accepting
a malformed declaration, duplicate attributes, an unterminated attribute value
and a `testcase` outside any `testsuite`.

E-3, E-4 and E-6 mutate only files under `tmp/`, which is ignored; E-5 mutates a
tracked source file and E-10 a tracked manifest, each restored from the saved
copy like any other negative. Restore each by copying the retained bytes back
(and `rmdir` for E-6-directory's directory), never `rm -f`, and regenerate the
three reports (E6's commands) afterwards so a stale table from one fault does not
leak into the next row's baseline.

## 12. The fault block every negative uses

`set -e` exits on the deliberately failing command before any restoration line
and leaves the clone mutated — watched on 2026-09-20. Use this shape, which
restores and compares **before** asserting.

```sh
set -euo pipefail
mkdir -p "$TMPDIR/evidence"
target=<the file to mutate>
name=<a short name for this proof>
cp "$target" "$TMPDIR/evidence/$name.passing"

# inject the fault into $target with an editor, then:
if diff -u "$TMPDIR/evidence/$name.passing" "$target" >"$TMPDIR/evidence/$name.patch"; then
  echo "nothing was injected" >&2
  exit 1
else
  test $? -eq 1
fi

if (cd tools/tool-devsync && bun test --preload ../test/scratch/preload.ts src/test-levels.test.ts) \
    >"$TMPDIR/evidence/$name.failing" 2>&1; then
  status=0
else
  status=$?
fi

cp "$TMPDIR/evidence/$name.passing" "$target"
cmp "$TMPDIR/evidence/$name.passing" "$target"

test "$status" -ne 0
grep -F "<the exact message row N names>" "$TMPDIR/evidence/$name.failing"
```

The final two lines above are a placeholder, not a literal instruction for
every slice: Bun's own multiline diff output and `Received function did not
throw` do not contain the matrix row's prose, so a grep for that prose never
matches.

**For slices A and B**, use the matrix row ID as the proof name. After
restoring and comparing bytes, require a nonzero test status and confirm that
the named test failed. Compilation or import errors do not count. Run
`grep -F --` separately for each literal fragment below against the saved
failing output; do not grep the explanatory prose in §11. Then rerun the
complete focused file and require green before the next mutation.

| Row | Literal fragments to require                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A-1 | `expect(received).toEqual(expected)`; `-   "conformance",`; `+   "api",`; `+   "unit",`                                                                           |
| A-2 | `Received function did not throw`; `Received value: "unit"`                                                                                                       |
| A-3 | `libs/wbs/application/core/testing/portable-composition.spec.ts`                                                                                                  |
| B-1 | `wbs-store-sqlite:test:api is declared api and collects src/testing/source-conformance.db.test.ts, which is conformance`                                          |
| B-2 | `wbs-core:test:unit does not pass --reporter=junit`                                                                                                               |
| B-3 | `wbs-store-sqlite:test:api command shape: a declared level target may not pass --test-name-pattern=NO_MATCH; only coverage and JUnit reporting flags are allowed` |
| B-4 | `the file selector failed`                                                                                                                                        |
| B-5 | `wbs-core:test`; `wbs-store-sqlite:test`                                                                                                                          |
| B-6 | `wbs-store-sqlite:test:api is declared api and does not collect src/assignment-scope.db.test.ts, which is api`                                                    |
| B-7 | `wbs-core:test:unit does not write ../../../../tmp/junit/wbs-core.unit.xml`                                                                                       |
| B-8 | `wbs-core:test:unit does not create ../../../../tmp/junit`                                                                                                        |
| B-9 | `wbs-core:test:unit runs in libs/wbs/application, not libs/wbs/application/core`                                                                                  |

**For C and D**, require nonzero status and the named test's failure after
restoration and `cmp`. Require each literal fragment below separately with
`grep -F --`; explanatory prose in §11 is not an output assertion. Where two rows
print the same received value, the `(fail) …` line naming that row's test is one
of its required fragments. Record collateral failures, then rerun the complete
focused file green before the next mutation.

**For E-3 through E-10**, require nonzero CLI status and every listed fragment
separately. For E-1 and E-2, require status **zero** and the three table rows in
the E-1/E-2 ending below.

| Row           | Literal fragments to require                                                                                                                                |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-1           | `Received function did not throw`; `Received value: []`; `(fail) the adopted capability > refuses a specification that holds no scenario`                   |
| C-2           | `Received function did not throw`; `Received value: [ "DEMO-001" ]`                                                                                         |
| C-3           | `expect(received).toEqual(expected)`; `+   "Assignment write among unrelated projects",`                                                                    |
| C-4           | `Received function did not throw`; `Received value: []`; `(fail) the adopted capability > refuses a specification that holds no requirement`                |
| D-1           | `expect(received).toEqual(expected)`; `-   "DEMO-001",`; `-   "DEMO-002",`; `+ []`                                                                          |
| D-2           | `Received function did not throw`; `Received value: []`                                                                                                     |
| D-3           | `Received message: "the JUnit report has text outside its root element: [DEMO-001] not xml at all"`                                                         |
| D-4           | `Received message: "the JUnit report holds a testcase outside any testsuite"`; `(fail) the scenario join > refuses a report whose declaration is malformed` |
| D-5           | `Received function did not throw`; `    name: "[DEMO-001] a",`; `(fail) the scenario join > refuses text outside the root element`                          |
| D-6           | `Received message: "the JUnit report holds a testcase outside any testsuite"`; `(fail) the scenario join > refuses a report whose root is not testsuites`   |
| D-7           | `Received message: "the JUnit report never closes <testsuites>"`                                                                                            |
| D-8           | `Received function did not throw`; `    name: "[DEMO-001] a",`; `(fail) the scenario join > refuses a report that leaves an element open`                   |
| D-9           | `Received message: "the JUnit report never closes <testsuites>, <testsuite>"`; `(fail) the scenario join > refuses a truncated report`                      |
| D-10          | `Received message: "the JUnit report has an unterminated tag"`; `(fail) the scenario join > refuses an attribute whose value is never closed`               |
| D-11          | `Received function did not throw`; `    name: "[DEMO-001] a",`; `(fail) the scenario join > refuses a testcase outside any testsuite`                       |
| D-12          | `Received function did not throw`; `    file: "",`                                                                                                          |
| D-13          | `Received function did not throw`; `    name: "[DEMO-002] b",`                                                                                              |
| D-14          | `Received function did not throw`; `    name: "a < b",`                                                                                                     |
| D-15          | `Received function did not throw`; `    name: "a &nbsp; b",`                                                                                                |
| D-16          | `Received message: "the JUnit report's XML declaration names no version"`                                                                                   |
| E-3           | `wbs-store-sqlite:test:api did not collect src/audit.test.ts`; `tmp/junit/wbs-store-sqlite.api.xml is the report of another run`                            |
| E-4           | `the JUnit report holds no testcase`                                                                                                                        |
| E-5           | `tmp/junit/wbs-store-sqlite.api.xml is older than src/assignment-scope.db.test.ts`; `rerun wbs-store-sqlite:test:api`                                       |
| E-6-absent    | `wbs-core:test:unit has no readable report at tmp/junit/wbs-core.unit.xml`; `ENOENT`                                                                        |
| E-6-directory | `wbs-core:test:unit has no readable report at tmp/junit/wbs-core.unit.xml`; `EISDIR`                                                                        |
| E-7           | `usage: scenario-coverage-cli.ts <capability> <project:target>…`                                                                                            |
| E-8           | `usage: scenario-coverage-cli.ts <capability> <project:target>…`                                                                                            |
| E-9           | `wbs-core:test is not a declared level target`                                                                                                              |
| E-10          | `wbs-core:test:unit is not declared in its project manifest`                                                                                                |

Every fragment above was copied out of a saved failing output on this worktree
on 2026-09-20; none is paraphrased.

Substitute the command under test: for slice S it is the OpenSpec validation
block; for rows E-1 and E-2 it is the level target followed by the coverage
command. Generate all three reports (`wbs-store-sqlite.api.xml`,
`wbs-store-sqlite.unit.xml`, `wbs-core.unit.xml`) once, before injecting any E
fault. **Rows E-1 and E-2 end differently**, because the coverage command
reports an uncovered scenario and still exits zero by design. Use this ending
for them instead of `test "$status" -ne 0`:

```sh
if (env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT NX_DAEMON=false bunx nx run wbs-store-sqlite:test:api \
      && bun tools/tool-devsync/src/scenario-coverage-cli.ts project-assignment-reads \
           wbs-store-sqlite:test:api wbs-core:test:unit) \
    >"$TMPDIR/evidence/$name.failing" 2>&1; then
  status=0
else
  status=$?
fi

cp "$TMPDIR/evidence/$name.passing" "$target"
cmp "$TMPDIR/evidence/$name.passing" "$target"

test "$status" -eq 0                                    # E-1 and E-2 only
grep -F -- '| PROJECT-ASSIGNMENT-READS-001 | **no** |' "$TMPDIR/evidence/$name.failing"
grep -Fx -- '| PROJECT-ASSIGNMENT-READS-002 | yes |' "$TMPDIR/evidence/$name.failing"
grep -Fx -- '| PROJECT-ASSIGNMENT-READS-003 | yes |' "$TMPDIR/evidence/$name.failing"
```

**Rows E-3 through E-10 invoke only the coverage CLI as the command under
test — never the level target.** Rerunning the target regenerates the report
under test and erases the fault before the CLI can observe it. E-3, E-4, E-5 and
E-10 mutate a file's content (E-5 by an appended newline, not `touch`, so the
mutation leaves a content diff; E-10 by a structural JSON edit addressing
`targets["test:unit"].options.command` by its path, never by matching a line), so
they keep the general block above with the command under test replaced by:

```sh
bun tools/tool-devsync/src/scenario-coverage-cli.ts project-assignment-reads \
  wbs-store-sqlite:test:api wbs-core:test:unit
```

and `test "$status" -ne 0` followed by a grep for the message row 11 names.

E-6 replaces a file with an absence and then with a directory, so it has no
single content diff and cannot be restored after its assertions without leaving
the clone mutated when one of them fails. Execute absence and directory
replacement as **two independent proofs**, named `E-6-absent` and
`E-6-directory`, with a green baseline between them.

Before each fault, copy the passing report to `$TMPDIR/evidence/$name.passing`
and retain that copy. Record a labeled content-deletion patch with
`diff -u --label wbs-core.unit.xml --label /dev/null "$TMPDIR/evidence/$name.passing" /dev/null`,
accepting exactly status 1. Also save the exact filesystem fault commands as
`$TMPDIR/evidence/$name.fault.sh`; the directory proof must explicitly record
creation of the directory.

Move the report into the evidence directory; for the directory proof create a
directory at its former path. Invoke only the coverage CLI and capture its status
and output through an `if` block.

**Before asserting anything about that invocation**, remove the replacement
directory with `rmdir` where applicable, restore the report by copying the
retained passing bytes back, and require `cmp`. Only then require nonzero status
and the literal message.

```sh
set -euo pipefail
mkdir -p "$TMPDIR/evidence"
name=E-6-absent                                  # then E-6-directory, its own proof
report=tmp/junit/wbs-core.unit.xml

cp "$report" "$TMPDIR/evidence/$name.passing"
if diff -u --label wbs-core.unit.xml --label /dev/null \
     "$TMPDIR/evidence/$name.passing" /dev/null >"$TMPDIR/evidence/$name.patch"; then
  echo "the report was already empty" >&2
  exit 1
else
  test $? -eq 1
fi

# $TMPDIR/evidence/$name.fault.sh holds exactly the two lines below, the second
# only for E-6-directory:
mv "$report" "$TMPDIR/evidence/$name.moved"
mkdir -p "$report"                               # E-6-directory only

if bun tools/tool-devsync/src/scenario-coverage-cli.ts project-assignment-reads \
     wbs-store-sqlite:test:api wbs-core:test:unit \
     >"$TMPDIR/evidence/$name.failing" 2>&1; then
  status=0
else
  status=$?
fi

rmdir "$report"                                  # E-6-directory only
cp "$TMPDIR/evidence/$name.passing" "$report"
cmp "$TMPDIR/evidence/$name.passing" "$report"

test "$status" -ne 0
grep -F -- 'wbs-core:test:unit has no readable report at tmp/junit/wbs-core.unit.xml' \
  "$TMPDIR/evidence/$name.failing"
```

Regenerate all three declared reports and require the three-row green table
before beginning the next proof. Retain every backup, patch, fault script and
output file.

After restoring each of E-3 through E-10, rerun the three declared targets
(E6's commands) and require the three-row green table again before moving to
the next row. Never `rm -f`; never `|| true`; never read a status through
`tee`.

## 13. Verification

### The executor's, at the end of slice E

| Command                                                                                                                                                                               | Expected                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `cd tools/tool-devsync && bun test --preload ../test/scratch/preload.ts src/test-levels.test.ts`                                                                                      | exit 0, 0 fail, slice E's E0 baseline plus two (35 on the planner's tree) |
| `NX_DAEMON=false bunx nx run tool-devsync:typecheck`                                                                                                                                  | exit 0, Nx reports the target succeeded                                   |
| `NX_DAEMON=false bunx nx run tool-devsync:lint`                                                                                                                                       | exit 0, Nx reports the target succeeded, no ESLint diagnostic             |
| `cd tools/tool-devsync && bun test --preload ../test/scratch/preload.ts src/workspace-targets.test.ts -t 'selects each terminal source file exactly and keeps normal test inclusion'` | `Ran 1 test across 1 file.`, 0 fail, `17 filtered out`                    |
| `cd apps/wiki/cli && bun test --preload ../../../tools/test/scratch/preload.ts src/relationships/committed-target-facts.test.ts`                                                      | 0 fail, 2 pass                                                            |
| `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT NX_DAEMON=false bunx nx run wbs-store-sqlite:test:api`                                                                                   | exit 0, 0 fail, `tmp/junit/wbs-store-sqlite.api.xml` written              |
| `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT NX_DAEMON=false bunx nx run wbs-store-sqlite:test:unit`                                                                                  | exit 0, 0 fail, `tmp/junit/wbs-store-sqlite.unit.xml` written             |
| `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT NX_DAEMON=false bunx nx run wbs-core:test:unit`                                                                                          | exit 0, 0 fail, `tmp/junit/wbs-core.unit.xml` written                     |
| `cd libs/wbs/adapters/store-sqlite && bun test src/assignment-scope.db.test.ts`                                                                                                       | exit 0, slice C's C0 total                                                |
| `cd libs/wbs/application/core && bun test src/service/work-item.service.test.ts`                                                                                                      | exit 0, slice C's C0 total                                                |
| the batch README's OpenSpec validation block                                                                                                                                          | exit 0, slice S's S0 totals                                               |
| `bun tools/tool-devsync/src/scenario-coverage-cli.ts project-assignment-reads wbs-store-sqlite:test:api wbs-core:test:unit`                                                           | exit 0, three rows, all `yes`                                             |
| `GSETTINGS_BACKEND=memory bunx prettier --check` over the twelve paths of section 16                                                                                                  | exit 0, `All matched files use Prettier code style!`                      |
| `NX_DAEMON=false bunx nx format:check --all`                                                                                                                                          | exit 0                                                                    |

What these do **not** prove: that a citing test actually proves its scenario
(nothing can check that); that any other capability is covered; that rule T2
refuses anything; that the level table classifies the rest of the repository,
which `levelOf` throws on; that an undeclared target spanning levels is refused.

### Planner-only

| Check                                      | Why the executor cannot run it                                                      | Expected                                                                                                                                                                                                                                                                                             |
| ------------------------------------------ | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tool-devsync:test` whole target           | its namespacing test runs the wiki index checker over the tree, writing Git objects | one more file and twenty-six more cases than the planner's own baseline on the dispatch base; 0 fail. Stage `scenario-coverage-cli.ts` first: untracked, it fails the index checker (see slice E's hand-over). Observed here after C 315 pass, after D 334 pass, after E 336 pass, 0 fail throughout |
| `wbs-store-sqlite:test`, `wbs-core:test`   | heavy aggregates this packet must leave untouched                                   | unchanged totals: no test is added or removed, only three titles change                                                                                                                                                                                                                              |
| `bun run test:unit` at the root            | runs every project's fast tier                                                      | unchanged totals; two new files in `tmp/junit`                                                                                                                                                                                                                                                       |
| `bin/h2puni-gate.sh <sha>`                 | the shared build host and the heavy lock                                            | exit 0; record the printed `h2puni gate: running on <sha>` line                                                                                                                                                                                                                                      |
| replay of rows B-1, C-3, D-13, E-1 and E-3 | the contract requires the planner to replay a sample                                | the named test or command fails with the named message                                                                                                                                                                                                                                               |

Nothing needs Docker, the network or a credential. Every OpenSpec invocation
carries `OPENSPEC_TELEMETRY=0`.

## 14. Findings recorded, not fixed

1. `project-assignment-reads` has no Browser or Manual scenario, so TEST-AXES-018 would refuse it.
2. Neither `test:conformance` target writes a JUnit report, because `workspace-targets.test.ts` pins both commands exactly. Conformance is outside T2, so the citation join does not need them; structural coverage will.
3. Three of eight levels and two projects are adopted. View, Browser, Performance, Manual and Architecture have no declared target.
4. `apps/wbs/be-01` already has an API-level target under another name, `test:store`. The change forbids renaming it; declaring it is the next increment.
5. The level targets are not in the gate: CI and `bin/h2puni-gate.sh` drive `test`, `lint`, `typecheck` and `build`.
6. The open item in `verify.md` section 7 is answered: `source-conformance.test.ts` needs no distinguishing suffix.
7. `levelOf` implements rows 2, 6 and 10 of the ten-row table only; the rest throw.
8. `assertReportIsCurrent` compares modification times, which a checkout can move without changing content. It examines the test files the report itself names, not their production dependencies and not the specification, so a changed dependency under an unchanged test file leaves the report "current". It is a staleness heuristic, not a content binding; the real binding is task 3.1's candidate record. The limitation is stated in its JSDoc.
9. The workspace declares no XML parser, so `readJUnitReport` is a small strict tokenizer over the subset Bun 1.4.2 writes. Its limits are in its JSDoc: double-quoted attribute values only; no DTD, namespace or external-entity interpretation; structural and attribute-syntax validation rather than the whole XML grammar. It refuses what it cannot account for rather than skipping it.
10. `tools/tool-devsync/src/scenario-coverage-cli.ts` is a new file, and the namespacing handover's index checker refuses untracked diagnostic paths, so `tool-devsync:test` cannot be green until it is staged. The executor cannot stage; this is a planner step, not a defect.

## 15. Assumptions recorded, not asked

| #   | Assumption                                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | The adopted projects are the two holding the chosen capability's tests, not the three rollout Task 5 names.                                                                                              |
| A2  | `project-assignment-reads` replaces `plan-refresh` as the first worked example; `plan-refresh` is the obvious second.                                                                                    |
| A3  | A scenario identifier is the capability directory name upper-cased, hyphens kept, then a three-digit ordinal in document order from `001`.                                                               |
| A4  | The Unit-level test is cited although T1 does not require it, because a scenario proved only at Unit level enters the ledger no other way.                                                               |
| A5  | The level declaration is a typed constant in `test-levels.ts`, not a JSON policy beside `kinds.json`; three rows are code, not policy.                                                                   |
| A6  | `tasks.md` is not ticked: 2.1 and 2.2 are each larger than this increment, and `verify.md` records what was observed.                                                                                    |
| A7  | Reports land in `tmp/junit/`, one file per project and level, rather than one ignored directory per project.                                                                                             |
| A8  | TEST-AXES-005's second half is deferred: no undeclared target of an adopted project spans levels today. The packet claims only the exemption half.                                                       |
| A9  | The delta spec's "change no target" sentence is amended rather than worked around.                                                                                                                       |
| A10 | The coverage command takes declared target names, not report paths, so a caller cannot hand the join a file from elsewhere. It is a narrower interface than `twib coverage scenarios <reports>` will be. |
| A11 | The JUnit reader is a hand-written strict tokenizer rather than a new dependency, because no XML parser is installed in this workspace and this increment reads only what Bun's own reporter writes.     |

## 16. Cumulative hand-over

Each slice hands over its own list. At the end of slice E the cumulative diff
against the dispatch base is these twelve paths, and `tmp/junit/` appears in
none of them:

```text
libs/wbs/adapters/store-sqlite/project.json
libs/wbs/adapters/store-sqlite/src/assignment-scope.db.test.ts
libs/wbs/application/core/project.json
libs/wbs/application/core/src/service/work-item.service.test.ts
nx.json
openspec/changes/test-axes/proposal.md
openspec/changes/test-axes/specs/test-axes/spec.md
openspec/changes/test-axes/verify.md
openspec/specs/project-assignment-reads/spec.md
tools/tool-devsync/src/scenario-coverage-cli.ts
tools/tool-devsync/src/test-levels.test.ts
tools/tool-devsync/src/test-levels.ts
```

## 17. Out of lane

`openspec/changes/test-axes/tasks.md`; `apps/wiki/cli/**`;
`tools/tool-devsync/project.json` (020.8's);
`tools/tool-devsync/src/repo-namespacing-handoff.test.ts`, `LLM_README.md` and
`docs/findings/checks-that-cannot-fail-puni-00.md` (110.6's);
`apps/wbs/fe-01/**` (040.4's); `apps/wbs/be-01/**` (020.7's);
`docs/wiki-policy/*.json`; every `test` target; every `test:conformance` target;
`docs/code-organization/**`.

## 18. First review, 2026-09-20 (Codex gpt-6-astra, high effort): NOT READY

Nineteen findings plus two coordinator items, all fixed in the second draft. The
second review's own dispositions of that work are the table below; the four it
judged FIXED-with-a-caveat and the eight it judged PARTLY or NOT FIXED are
closed there.

## 19. Second review, 2026-09-20 (Codex gpt-6-astra, high effort): NOT READY

Every finding was checked against the worktree before being accepted. Where the
fix is code, it was written, run and mutated here before being copied into this
packet.

| #   | Finding                                                | Disposition                                                                                                                                                                                                  | Where it landed                                                                                                                                                                                                          |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | S4's OpenSpec fault cannot fail                        | **Fixed.** Verified: TEST-AXES-024 shares its requirement with 001 to 003, so removing it leaves three scenarios and validation passes. Removing TEST-AXES-023's heading gave 99/98/1 and the named message. | §4.6 records the probe; step S4 names TEST-AXES-023 and the exact message.                                                                                                                                               |
| 2   | Slice A cannot typecheck or lint                       | **Fixed.** Reproduced: A1 imported eight symbols slice A's module does not yet export.                                                                                                                       | A1 imports only its ten names; B2, C1, D1 and E1 each add their own. Each stage was run here.                                                                                                                            |
| 3   | C2 redeclares `ADOPTED_CAPABILITY`                     | **Fixed.** Reproduced as TS2451 in the second draft's cumulative source.                                                                                                                                     | The constant is declared in C2 only; slice A's listing no longer contains it.                                                                                                                                            |
| 4   | B4's red differs from the required observation         | **Fixed.** Reproduced: the parser threw before the assertion. The test now collects command-shape errors.                                                                                                    | B3's `parseLevelCommand` is wrapped in both cases; B4 quotes the three observed entries and says the other two cases pass.                                                                                               |
| 5   | D4's shell assertion contradicts a zero exit           | **Fixed.**                                                                                                                                                                                                   | §12 carries a second ending for rows E-1 and E-2 requiring status **zero**, then the `**no**` row.                                                                                                                       |
| 6   | Command validation permits a silent filter             | **Fixed.** Reproduced: the old parser accepted `--test-name-pattern=NO_MATCH`.                                                                                                                               | `ALLOWED_LEVEL_FLAG` is an allow-list; a new case refuses the filter; row B-3 is the observed mutation on the real target.                                                                                               |
| 7   | Malformed reports and unidentified specs still mislead | **Fixed.** Reproduced all four: unclosed element, bad declaration, comment, failure text.                                                                                                                    | `readJUnitReport` is a scanner with well-formedness, single-root, no-testcase and name/file checks; `scenarioIdentifiers` throws on any unidentified heading. Nine join cases, all run.                                  |
| 8   | A5's mutation diagnostic is wrong                      | **Fixed.** Observed: received `["api","unit","api","unit"]`.                                                                                                                                                 | Row A-1.                                                                                                                                                                                                                 |
| 9   | The join is implemented before its tests               | **Fixed.**                                                                                                                                                                                                   | The join moved out of C into D, and provenance into E, each behind its own red observation (D2, E2).                                                                                                                     |
| 10  | The proof inventory is incomplete                      | **Fixed.**                                                                                                                                                                                                   | §11 is a guard-to-fault matrix of eighteen rows, every one injected and observed here, including absent **and** unreadable reports (E-6) and the failing selector (B-4). `test-levels.ts` is in D's and E's owned paths. |
| 11  | Dispatch and enforcement facts are stale               | **Fixed.** Verified: the launcher accepts `--batch`; `workspace-targets.test.ts` has no default-enforcement case and `nx.json` has no such entries.                                                          | The header names `--batch batch-2`; §4.5 states plainly that no such case exists on this tree and that B1 reads `nx.json` before choosing a shape.                                                                       |
| 12  | Section references are wrong                           | **Fixed.**                                                                                                                                                                                                   | Pins are §4.5; the fault block is §12; the matrix is §11; §4.9 describes the real structure.                                                                                                                             |
| 13  | File counts and formatting order are inconsistent      | **Fixed.**                                                                                                                                                                                                   | Every slice appends evidence **before** its formatting step, and each formatting command names that slice's owned paths including `verify.md`. Slice C says six.                                                         |

**Not resolved.** The `tool-devsync:test` whole-target delta stays the planner's
to take on the dispatch base, because the executor may not run that suite. No
slice was cut: all six complete as written on this worktree.

### Third review, 2026-09-20 (Codex gpt-6-astra, high effort): DISPATCH AFTER FIXES

The verdict is DISPATCH AFTER FIXES: slice S needed a JSON-aware S4 proof
assertion, which this pass applied, and it now clears for dispatch. The
planner applied all five blocking findings by hand: S4 and §12 now assert
against `openspec … --json` with a `jq` predicate instead of a grep that never
matched; A3's import drops the unused `stat`, which E3 now adds when it first
uses it; slice B's B4 count, B11's row range, B13's proof count and B-4's
fault were corrected to match the actual test totals and to make the selector
fault actually throw; `uncoveredScenarios` moved from E3 into D3 so slice D
can reach green with its own three exports; and §12's E-3-through-E-6
procedure was rewritten to invoke only the coverage CLI, with E-5's fault
changed from `touch` to an appended newline and E-6 given its own explicit
backup-and-restore block. These later-slice findings (A, B, D, E) were fixed
now, before those slices are dispatched, even though slice S is the only one
this review authorizes for dispatch today. The non-blocking notes on the
scanner's malformed-XML acceptance, the incomplete proof matrix and the
foreign-file timestamp heuristic were left unapplied, as none is a one-line
edit; they remain open findings for the executor and a later review.

## 20. Disposition of the slices A and B dispatch review

`reviewAB.md`'s verdict was DISPATCH AFTER FIXES for both slices. Every
finding it raised is dispositioned below.

| Finding                                                                                                                       | Disposition                            | Where / evidence                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Blocking problem 1 — A5/B11, §11/§12: prescribed diagnostic assertions did not match emitted output                           | FIXED                                  | §12 now carries an A/B-specific ending: a `grep -F --` table of literal fragments per row, replacing a grep of §11's prose. §11's B-4 observed-message cell now reads "Throws before the array assertion; the diagnostic contains `the file selector failed`."                             |
| Blocking problem 2 — B11/B13, §11: independent safety checks (missing file, wrong report path, wrong report directory, `cwd`) | FIXED                                  | §11 gained rows B-6 to B-9. B11 now reads "Execute rows B-1 through B-9…"; B13 now requires nine dated `Proof:` comments and nine `verify.md` rows. A new note after the table sends B-6–B-9 through the focused devsync file via §12, never through `nx run`.                             |
| Second-review finding 7 — malformed-XML findings remain for D's review                                                        | REJECTED (out of scope)                | Slice D is untouched by this pass; this edit is scoped to slices A and B plus the shared sections the review named.                                                                                                                                                                        |
| Second-review finding 8 — A-1 describes the correct array but §12 cannot grep it literally                                    | FIXED (subsumed by blocking problem 1) | Same fix as blocking problem 1.                                                                                                                                                                                                                                                            |
| Second-review finding 10 — B-5 is scheduled and B-4 throws, but independent B checks still lack proofs                        | FIXED (subsumed by blocking problem 2) | Same fix as blocking problem 2.                                                                                                                                                                                                                                                            |
| Second-review finding 12 — the read-first table still references §5.5                                                         | FIXED                                  | §3's row for `workspace-targets.test.ts` now points at §4.5, the section that actually explains why those two cases bind the packet.                                                                                                                                                       |
| Non-blocking — §4.5's "no enforcement case" paragraph is stale                                                                | FIXED                                  | §4.5 rewritten: `workspace-targets.test.ts:543`–`577` (`sets the agent output variables to 0`) and `nx.json:69`–`100` (`test:unit`, `test:conformance`, `test:store`, `test:portable` defaults) already enforce and declare the defaults, confirmed with `grep -n '"CLAUDECODE"' nx.json`. |
| Non-blocking — B12 currently reports 18 filtered out; the historical count is not a dispatch condition                        | REJECTED (no action needed)            | The review states this explicitly; B12's assertion already only requires the named case to pass with 0 fail, so no packet edit was needed.                                                                                                                                                 |
| Non-blocking — A's in-memory lint was clean; B's only diagnostic was autofixable import ordering                              | REJECTED (no action needed)            | Informational; already covered by preamble rule 17 and the A7/B13 lint steps.                                                                                                                                                                                                              |
| Non-blocking — publish evidence basenames or attempt-relative references; never absolute clone paths or expanded temp paths   | FIXED                                  | A7 and B13 each gained a sentence: `verify.md` evidence references are basenames relative to the attempt's evidence directory, never an absolute clone path or an expanded `$TMPDIR` path — the record is published.                                                                       |
| Non-blocking — read-only validation scope (Nx execution, report generation, restoration, builds, host gate not verified here) | REJECTED (no action needed)            | A caveat about the review's own method, not a packet defect.                                                                                                                                                                                                                               |

## 21. Disposition of the slices C, D and E dispatch review

`reviewCDE.md`'s verdict was C DISPATCH AFTER FIXES, D NOT READY, E DISPATCH
AFTER FIXES. Every finding was checked against the code at HEAD and then settled
by rehearsal in a clone: slices C, D and E were implemented exactly as revised
here, run red then green, mutated once per guard, and reverted. Every literal
fragment in §12 and every observed message in §11 was copied out of a saved
Bun 1.4.2 output, not reasoned about.

| Finding                                                                                         | Disposition | Where / evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blocking 1 — C/D diagnostics remain prose; E-3's ellipsis cannot match actual output            | FIXED       | §12 gained the review's C/D and E-3-to-E-10 rules verbatim and a literal-fragment table for every C, D and E row. E-3 really prints seven filenames and no ellipsis; §11's E-3 cell now lists all seven. Its C-1 to C-3 and D-1, D-2 fragments were reproduced here exactly as the review predicted.                                                                                                                                                                                                                                                      |
| Blocking 2 — C1/C9: the requirement-heading guard has neither a test nor a proof                | FIXED       | Confirmed: `assertSpecification`'s two guards are independent, and `refuses a specification that holds no scenario` still passes with the requirement guard gone. C1 gained the review's exact case, C0 and C7 now say five cases and N+5, C9 carries the review's exact replacement, and §11 gained row C-4 (observed `Received function did not throw`, `Received value: []`).                                                                                                                                                                          |
| Blocking 3 — D3's well-formedness claim is false and D1 does not expose it                      | FIXED       | Confirmed by running the packet's own listing: it accepted `<?xml garbage?>`, trailing text after the root, a duplicate `name`, attribute garbage with an unknown entity, an unterminated attribute value and a `testcase` outside any `testsuite`, returning a passing `DEMO-001` citation for each. §10 is rewritten: real Bun output first, then a complete strict tokenizer, nineteen cases and sixteen independent guards with observed fragments. Leading text was already refused; that is the review's only overstatement and it changes nothing. |
| Blocking 4 — §12 E-6 violates the restoration/evidence contract                                 | FIXED       | §12's E-6 block is replaced by the review's exact procedure: two independent proofs, retained passing bytes, a labeled content-deletion patch, a saved `fault.sh`, restoration and `cmp` **before** any assertion, and a regenerated green table between them. Both really produce the same message, from `ENOENT` and `EISDIR` respectively.                                                                                                                                                                                                             |
| Blocking 5 — E7/E8: E's declaration checks have no scheduled production-path negatives          | FIXED       | §11 gained rows E-7 to E-10 (no arguments; capability alone; `wbs-core:test`; the manifest command deleted structurally) with their observed messages; E7 and E8 carry the review's exact additions, including the JSON-path rule and the "authorized only for this temporary fault" sentence.                                                                                                                                                                                                                                                            |
| Blocking 6 — E-4's fault is malformed XML; basename instructions cover A/B only                 | FIXED       | E-4's fault is the review's exact replacement and really throws `the JUnit report holds no testcase` under the repaired reader. C10, D6 and E8 each gained the basename-and-pending-verification sentence.                                                                                                                                                                                                                                                                                                                                                |
| Non-blocking — C, D and E move neither whole-suite pin; the inventory reads 166 rows / 80 files | CONFIRMED   | Rehearsed and measured, not reasoned: `tool-devsync:test --skip-nx-cache` after C was 315 pass / 0 fail, after D 334 / 0, after E 336 / 0, with `pins the complete moved depth-sensitive configuration inventory` and the namespacing digest green each time. No slice moves either pin.                                                                                                                                                                                                                                                                  |
| Non-blocking — add the "do not discover or update whole-suite pins" sentence to the hand-overs  | FIXED       | Added to slice D's and slice E's hand-over blocks.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Non-blocking — D2/E2 should describe an import-resolution failure                               | FIXED       | D2 and E2 now say the whole file fails to load for want of the new exports, and that this is one failure, not nineteen or two executed cases.                                                                                                                                                                                                                                                                                                                                                                                                             |
| Non-blocking — C should run its own typecheck and lint before hand-over                         | FIXED       | C10 now runs `tool-devsync:typecheck` and `tool-devsync:lint` before formatting; both exited 0 here with no diagnostic.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Non-blocking — keep E's timestamp heuristic limitation explicit                                 | FIXED       | Stated in `assertReportIsCurrent`'s JSDoc in E3's listing and sharpened in §14 finding 8.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Non-blocking — the review executed no mutated Nx run, restoration, build or host gate           | ACCEPTED    | This pass executed them: both level targets and the coverage command really ran, E-1 and E-2 really reran `wbs-store-sqlite:test:api` under the fault, and every mutation was restored and compared with `cmp`. The host gate was not run here.                                                                                                                                                                                                                                                                                                           |

**New, found only by rehearsing.** Slice E adds a file, and the namespacing
handover's index checker refuses untracked diagnostic paths: with
`scenario-coverage-cli.ts` unstaged, `tool-devsync:test` failed `the production
index checker resolves current Markdown links and anchors` with `index checks
cannot resolve untracked diagnostic paths:
tools/tool-devsync/src/scenario-coverage-cli.ts`; staged, the same run was 336
pass, 0 fail. Slice E's hand-over and §14 record it, and the executor reports it
as pending planner verification.
