# 020.8 Classify backend services by kind, in place

| Field                                      | Value                                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------------------- |
| Work item                                  | 020.8 in "PUNI platform plan"                                                           |
| Size class                                 | M for the checker, then five reviewed classification slices                             |
| Wave                                       | 2. Packet 010.3 is a hard prerequisite and must be merged before slice A is dispatched  |
| Slices                                     | A checker, B shims, C use cases, D backend code, E1 and E2 core services, F integration |
| top-model-high-effort-planning-tokens      | 3000000                                                                                 |
| mid-level-mid-effort-implementation-tokens | 9000000                                                                                 |
| top-model-high-effort-review-tokens        | 4000000                                                                                 |
| Implements                                 | Task 2 of the [rollout plan](../2026-09-19-code-organization-rollout.md), observe mode  |

**You execute one slice and stop.** The end of your instructions names which. Do not start the
next one. Section 7 gives each slice its own completion checklist; section 10 says which commands
you run and which the planner runs after staging your files.

**Prerequisite, checked at the start of every slice.** Rule R4 requires the architectural decision
before the check that enforces it, and packet [010.3](010-3-record-the-decision.md) records it as
the `service-taxonomy` OpenSpec change. Your clone is cut from an integration commit that already
contains 010.3, so the files are in `HEAD`, not merely in the working tree:

```sh
git cat-file -e HEAD:openspec/changes/service-taxonomy/specs/service-taxonomy/spec.md
git cat-file -e HEAD:openspec/changes/service-taxonomy/verify.md
git cat-file -e HEAD:openspec/changes/service-taxonomy/proposal.md
```

Expected: all three exit 0 and print nothing. Any non-zero exit means the clone predates 010.3:
stop and report, and do not create the files yourself. Then read the delta spec and confirm the
wording section 9 requires. These are read-only Git commands; they change no state.

## 1. Goal and non-goals

**Goal.** Every backend service file that does not already declare its kind in its filename has a
reviewed kind with written evidence, recorded in one policy file, and a test refuses a file that is
missing from the policy, an entry that points nowhere, an entry classified twice, and a
classification asserted without the field or the rationale that makes it checkable.

**Non-goals.** No file moves, no renames, no kind suffixes are introduced here, no lint rules.
Frontend files are not classified: a frontend file that carries a kind suffix is accepted without
an entry, which is all this task says about it. The taxonomy itself stays in observe mode — no file
fails for being the wrong kind, being badly layered, or being too large.

## 2. Read first

| File                                                                           | Why                                                                                                     |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                                                                    | Rules R1 to R5. Names carry the domain (R2); absent and malformed state throws (R5).                    |
| `README.md` in this directory                                                  | The execution contract, who runs what, counts are relative, and the standard blocks.                    |
| `ASSUMPTIONS.md` in this directory                                             | What was settled by assumption rather than asked.                                                       |
| `docs/superpowers/specs/2026-09-19-code-organization-design.md`                | The four kinds, rules K1 and K9, the rollout modes, and the backend first-reading table.                |
| `openspec/changes/service-taxonomy/specs/service-taxonomy/spec.md`             | The requirements this task is the first evidence for, written by 010.3.                                 |
| `CONTEXT.md`                                                                   | The WBS glossary. A resource-service names one of its terms.                                            |
| `openspec/specs`                                                               | The accepted capabilities. A feature-service names one of them.                                         |
| `libs/wbs/application/core/src/use-cases/README.md`                            | What the core already calls a use case, and which consumers it declares.                                |
| `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`                      | House style: the justified module-boundary exception, `parseOrThrow`, `Proof:` comments.                |
| `tools/test/scratch/index.ts`                                                  | `scratchAsync`, whose process root the test preload removes on exit.                                    |
| `tools/tool-devsync/project.json`                                              | The `test` target's `inputs` and its `cwd`. Line 13 is a workspace-wide input; section 7 depends on it. |
| `docs/superpowers/plans/2026-09-19-batch-1/040-6-directory-and-preferences.md` | Section 5 names the three frontend files with kind suffixes that the suffix test uses as fixtures.      |

Slices B to F additionally read `docs/code-organization/kinds.json` as the previous slice left it.

## 3. Verified facts, 2026-09-19 and 2026-09-20

Counts the packet compares against are recorded by **you** in step 0. The numbers below are what
the planner observed at `1eeacb0b`; a different number is not by itself a problem, but it is
recorded and reported before you classify anything.

- Candidates, counted with `git ls-files`, TypeScript only, `.d.ts`, `.test.` and `.spec.`
  excluded: 46 in `libs/wbs/application/core/src/service`, 4 in
  `libs/wbs/application/core/src/use-cases`, 45 in `apps/wbs/be-01/src/service`; **95 in total**.
- No file anywhere in the repository ends in `.feature.ts`, `.resource.ts` or `.repository.ts`
  today, so the suffix half of this task has no real-tree subject and is proved on fixtures.
- Of the 45 files in the backend application's service directory, **36 contain nothing but
  re-export statements**, counted twice by two independent methods. Thirty-five name the core
  (`@wbs/core` or a `@wbs/core/service/...` path) and one,
  `apps/wbs/be-01/src/service/push-client.ts`, names `@wbs/runtime-portable`. The remaining **nine
  hold code of their own**: `optimization-coordinator.ts`, `optimized-schedule-reader.ts`,
  `optimizer-wiring.ts`, `solver-child-lifecycle.ts`, `solver-exit-outcome.ts`,
  `solver-launcher-process.ts`, `solver-request-pair.ts`, `solver-supervisor-client.ts`,
  `solver-supervisor-spawner.ts`. The push client is a shim, not implementation code.
- `optimized-schedule-reader.ts` and `optimizer-wiring.ts` both re-export **and** declare their own
  symbols, so a textual shim count and an implementation count are not complements.
- Sorted, the core's service directory runs from `assumed-assignee.ts` to `work-item.service.ts`;
  its 23rd path is `priority-band.service.ts` and its 24th is `project.service.ts`. Slices E1 and
  E2 cut there.
- The core's `work-item.service.ts` is 4,594 lines. That is a finding for the size ratchet, not for
  this task.
- The backend application's service directory also contains two JSON fixtures under `fixtures/`.
  The TypeScript filter excludes them.
- `@shared/validation` exports `type`, `parseOrThrow` and the `ValidationError` class
  (`libs/shared/domain/validation/src`). `parseOrThrow` throws `ValidationError` carrying ArkType's
  own summary; an unknown kind produced exactly
  `Validation failed: entries[0].kind must be "delivery", "feature", "repository", "resource" or "support" (was "service")`.
- A module under `tools/tool-devsync/src` that imports `@shared/validation` **fails lint** with
  `@nx/enforce-module-boundaries`: "Buildable libraries cannot import or export from non-buildable
  libraries". Probed read-only through `eslint --stdin`. With the justified
  `eslint-disable-next-line` comment copied from `repo-namespacing-handoff.test.ts`, the same probe
  reported no problems. Both supplied files pass that probe and `prettier --stdin-filepath`.
- `git ls-files -- '*.resource.ts'` matches `directory.resource.ts` and does **not** match
  `directory.resource.test.ts`. Probed in a throwaway repository.
- `git ls-files` prints nothing and exits **0** for a pathspec matching no tracked file, so an
  absent root must be detected explicitly. Outside a repository it exits **128** with
  `fatal: not a git repository`.
- `readFile` on a directory throws `EISDIR: illegal operation on a directory, read` with **no path
  in the message**, and `JSON.parse` throws `SyntaxError: JSON Parse error: ...` with no path
  either. Both need the path added by the caller.
- `tools/tool-devsync` holds **24** tracked test files, and its `test` target runs `bun test` over
  all of them from `cwd: tools/tool-devsync` with `--preload ../test/scratch/preload.ts`. The whole
  target can therefore never report this packet's own file count.
- The same target's `inputs` already declare a workspace-wide entry on line 13 and every Markdown
  file under `docs` on line 46, and `nx.json` gives `test` `"cache": true`.
- `tsconfig.base.json` declares both `@wbs/core` (the barrel
  `libs/wbs/application/core/src/index.ts`) and `@wbs/core/*`. The barrel re-exports 39 files from
  the core's service directory, and files inside that directory import each other relatively
  (`step.service.ts` imports `./assumed-assignee`, `./broadcast`, `./clean-name`,
  `./project.service`). One search on the file stem covers all four spellings.
- Eleven capabilities are accepted in `openspec/specs`.
- On 2026-09-20 the planner ran the supplied test file against the supplied module outside this
  clone: **13 pass, 0 fail**, with no `kinds.json` present anywhere. Every mutation in section 8
  was injected and observed failing the exact test named there. The four real-tree cases of slice F
  were run against a throwaway workspace and passed.
- Changing a `resource` entry's kind to `repository` leaves every supplied check green — observed.
  It is therefore **not** a usable fault. Deleting one entry fails the completeness comparison with
  that path on a `-` line — also observed.

## 4. Unknowns

- The right kind for each of the 95 files. That is the work, and no check can prove a kind right;
  the rationale field and the planner's review at each checkpoint are the only evidence there is.
- Whether every feature-shaped file has an accepted capability to name. Where none of the eleven
  fits, record the file as a feature with `"capability": "unspecified"`, give the rationale, and
  list it at the checkpoint; the missing specification is a finding, not something to invent here.
- Whether the workspace-wide `inputs` entry already makes the policy a cache input. Section 7's
  slice F hands that experiment to the planner, because it needs the whole Nx target.

## 5. File plan

| File                                           | Slice | Created or modified    | Responsibility                                                             |
| ---------------------------------------------- | ----- | ---------------------- | -------------------------------------------------------------------------- |
| `tools/tool-devsync/src/service-kinds.ts`      | A     | created                | Reading and validating the policy, the two listings, the two honesty rules |
| `tools/tool-devsync/src/service-kinds.test.ts` | A, F  | created, then extended | Thirteen fixture cases in A; four real-tree cases added in F               |
| `docs/code-organization/kinds.json`            | B–E2  | created, then grown    | The reviewed classification. Policy, not code.                             |
| `docs/code-organization/README.md`             | F     | created                | What the file is, how an entry is added, when an entry is deleted.         |
| `openspec/changes/service-taxonomy/verify.md`  | F     | modified               | Appends this task's commands, results and observed faults.                 |
| `tools/tool-devsync/project.json`              | F     | planner only           | Touched only if the planner's cache experiment shows it is needed.         |

This packet owns `tools/tool-devsync/project.json` for this batch; 020.1 does not edit it.
`openspec/changes/service-taxonomy/verify.md` is created by 010.3 and appended to here, beneath the
headings 010.3 wrote; no line of theirs is rewritten. **Only this packet writes to that file in
wave 2**: 040.6 has been told not to.

## 6. Interfaces

Two listings, not one. A file that declares its kind in its own name has already satisfied rule K1,
so requiring a policy entry as well would mean deleting that entry again in the commit that adds
the suffix — and 010.3's spec makes "a suffix and a classification entry" a failure. The
completeness comparison therefore covers only files under the three backend roots carrying **no**
suffix.

Two honesty rules are pure functions over entries, not assertions buried in a test, so slice A can
prove them on literal fixtures before any policy file exists and slice F can apply them to the real
policy without restating them.

`listServiceCandidates` is **asynchronous**, as the rollout plan declares it, and genuinely so:
`Bun.spawn` plus `child.exited`, not `spawnSync` behind an `async` keyword. `readKinds` must be
asynchronous anyway, the two are always awaited together, and a synchronous signature would have to
be broken when the check moves into Twilight Bureaucrat.

```ts
export const KINDS_POLICY_PATH = 'docs/code-organization/kinds.json';
export const SERVICE_ROOTS: readonly [
  'libs/wbs/application/core/src/service',
  'libs/wbs/application/core/src/use-cases',
  'apps/wbs/be-01/src/service',
];
export const KIND_SUFFIXES: readonly ['.feature.ts', '.repository.ts', '.resource.ts'];
export const SHIM_DISPOSITION_PREFIX = 're-export shim;';

export const KindEntry; // arktype type, see slice A
export type KindEntry = typeof KindEntry.infer;
export const KindsPolicy; // arktype type, see slice A

export function entriesMissingRequiredField(entries: readonly KindEntry[]): readonly string[];
export function entriesMissingRationale(entries: readonly KindEntry[]): readonly string[];
export function declaresKindBySuffix(path: string): boolean;
export function listServiceCandidates(workspaceRoot: string): Promise<readonly string[]>;
export function listSuffixDeclaredFiles(workspaceRoot: string): Promise<readonly string[]>;
export function readKinds(workspaceRoot: string): Promise<readonly KindEntry[]>;
```

A candidate is a tracked path under one of `SERVICE_ROOTS` ending in `.ts`, not ending in `.d.ts`,
containing neither `.test.` nor `.spec.`, and ending in none of `KIND_SUFFIXES`. A suffix-declared
file is a tracked path anywhere in the workspace passing the same TypeScript filter whose name ends
in one of `KIND_SUFFIXES`.

**One policy entry** is `{ path, kind }` plus: `capability` when the kind is `feature`, `term` when
it is `resource`, `disposition` when it is `support`, and `rationale` for every entry whose
disposition does not begin with `SHIM_DISPOSITION_PREFIX`. The rationale is one line naming the
evidence read: the callers, the stores touched, and the glossary term or capability it serves.

## 7. Steps

### Step 0 — Record the baseline, every slice, before touching anything

Counts are relative. Nothing is edited here.

- [ ] `git rev-parse HEAD` → record the starting revision. Every count below belongs to it.
- [ ] `git status --short` → record it. Other lanes' modifications may be present; leave them
      exactly as they are.
- [ ] Run the three `git cat-file -e` commands from the header block. Expected: three silent exits
      of 0.
- [ ] Write the work-queue script once, under your own temporary root, and run it:

```sh
mkdir -p "$TMPDIR/evidence"
cat > "$TMPDIR/queue.ts" <<'TS'
const { listServiceCandidates, listSuffixDeclaredFiles, readKinds } =
  await import(`${process.cwd()}/tools/tool-devsync/src/service-kinds.ts`);

const root = process.cwd();
const candidates = await listServiceCandidates(root);
const declared = await listSuffixDeclaredFiles(root);
let classified = new Set<string>();
try {
  classified = new Set((await readKinds(root)).map((entry) => entry.path));
} catch (failure) {
  if (
    !process.argv.includes('--allow-absent-policy') ||
    !(failure instanceof Error) ||
    !(failure.cause instanceof Error) ||
    !('code' in failure.cause) ||
    failure.cause.code !== 'ENOENT'
  ) {
    throw failure;
  }
  console.error('no policy yet');
}
const left = candidates.filter((path) => !classified.has(path));
const stale = [...classified].filter((path) => !candidates.includes(path));
for (const path of left) console.log(path);
console.error(
  `candidates ${String(candidates.length)}, classified ${String(classified.size)}, ` +
    `left ${String(left.length)}, stale ${String(stale.length)}, suffix-declared ${String(declared.length)}`,
);
for (const path of stale) console.error(`stale: ${path}`);
TS
```

      In slice A the module does not exist yet, so this script is written and not run. Run both
      this script and slice B's shim script from the repository root; neither script runs in
      slice A. From slice B on, run this one with `bun "$TMPDIR/queue.ts"`. Only slice B's initial
      baseline run, before `kinds.json` exists, uses
      `bun "$TMPDIR/queue.ts" --allow-absent-policy`; every subsequent invocation, including later
      slices' Step 0, omits the flag. All other read or validation failures stop execution.
      Expected on the first run: `candidates 95, classified 0, left 95, stale 0, suffix-declared 0`
      on stderr, and 95 paths on stdout. **Record your own numbers; the 95 is the planner's
      observation on 2026-09-19, not a pin.** `stale` above zero at any point is a stop condition.

**How the completeness test behaves between checkpoints.** It does not exist between checkpoints.
The four real-tree cases — completeness, the honest fields, the rationale rule and the
suffix-versus-entry rule — are added in **slice F**, together with the finished policy, so that no
intermediate commit leaves a red test in the repository. Between slices the script above is the
progress meter: `left` falls by the size of each group and `stale` stays at zero. That is
deliberate, and it is the one place this packet trades mechanical cover for green intermediate
commits; the planner's review of each group's entries is what covers the gap.

---

### Slice A — the checker

Creates two files. No `kinds.json` is created in this slice: an empty policy on disk would be
committed with nothing to compare it against, so the empty-but-valid case is proved as a fixture
instead (`an empty policy is well formed, so the inventory comparison is what catches it`).

- [ ] **A1. Write the test file** `tools/tool-devsync/src/service-kinds.test.ts`. This is the whole
      file. The boundary exception is required, and its comment is copied from
      `repo-namespacing-handoff.test.ts`, which explains the same boundary.

```ts
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// tool-devsync's `build` target runs shellcheck over `bin/*.sh` and bundles no TypeScript, so the
// buildable-library half of the boundary rule has no output to protect here. The half that does
// apply — `scope:infra` may reach `product:shared` — holds, and workspace-projects.test.ts checks
// it against the real Nx graph.
// eslint-disable-next-line @nx/enforce-module-boundaries -- no TypeScript build to protect
import { ValidationError } from '@shared/validation';
import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import {
  entriesMissingRationale,
  entriesMissingRequiredField,
  type KindEntry,
  listServiceCandidates,
  listSuffixDeclaredFiles,
  readKinds,
  SHIM_DISPOSITION_PREFIX,
} from './service-kinds';

/** The three roots with one tracked file each, so an emptiness refusal is not the default. */
const POPULATED_ROOTS: Readonly<Record<string, string>> = {
  'apps/wbs/be-01/src/service/optimizer-wiring.ts': 'export const wiring = 1;\n',
  'libs/wbs/application/core/src/service/step.service.ts': 'export const step = 1;\n',
  'libs/wbs/application/core/src/use-cases/save-plan.ts': 'export const savePlan = 1;\n',
};

async function runGit(root: string, args: readonly string[]): Promise<void> {
  const child = Bun.spawn(['git', '-C', root, ...args], { stderr: 'pipe', stdout: 'pipe' });
  const [failure, code] = await Promise.all([new Response(child.stderr).text(), child.exited]);
  if (code !== 0) {
    throw new Error(`git ${args.join(' ')} failed in ${root}: ${failure.trim()}`);
  }
}

/**
 * A throwaway Git workspace holding exactly `files`, staged so `git ls-files` sees them.
 *
 * `scratchAsync` puts it under this process's own scratch root, which the preload removes on exit,
 * so the repository under test is never this clone and never a fixed temporary path.
 */
async function gitFixture(
  prefix: string,
  files: Readonly<Record<string, string>>,
): Promise<string> {
  const root = await scratchAsync(prefix);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  await runGit(root, ['init', '-q']);
  await runGit(root, ['add', '-A']);
  return root;
}

/** A fixture whose only interesting content is the policy file itself. */
async function policyFixture(prefix: string, contents: string): Promise<string> {
  const root = await scratchAsync(prefix);
  await mkdir(join(root, 'docs/code-organization'), { recursive: true });
  await writeFile(join(root, 'docs/code-organization/kinds.json'), contents);
  return root;
}

test('a file that declares its kind by suffix owes no policy entry, wherever it lives', async () => {
  const root = await gitFixture('kinds-suffix-', {
    ...POPULATED_ROOTS,
    'apps/wbs/be-01/src/service/retention.feature.ts': 'export const sweep = 1;\n',
    'apps/wbs/fe-01/src/modules/directory/directory.resource.test.ts': 'export const t = 1;\n',
    'apps/wbs/fe-01/src/modules/directory/directory.resource.ts': 'export const dir = 1;\n',
    'apps/wbs/fe-01/src/modules/preferences/browser-storage.repository.ts': 'export const s = 1;\n',
    'apps/wbs/fe-01/src/modules/preferences/preferences.resource.ts': 'export const p = 1;\n',
  });

  expect(await listServiceCandidates(root)).toEqual([
    'apps/wbs/be-01/src/service/optimizer-wiring.ts',
    'libs/wbs/application/core/src/service/step.service.ts',
    'libs/wbs/application/core/src/use-cases/save-plan.ts',
  ]);
  expect(await listSuffixDeclaredFiles(root)).toEqual([
    'apps/wbs/be-01/src/service/retention.feature.ts',
    'apps/wbs/fe-01/src/modules/directory/directory.resource.ts',
    'apps/wbs/fe-01/src/modules/preferences/browser-storage.repository.ts',
    'apps/wbs/fe-01/src/modules/preferences/preferences.resource.ts',
  ]);
});

test('candidates are the non-test TypeScript files under the roots and nothing else', async () => {
  const root = await gitFixture('kinds-filter-', {
    ...POPULATED_ROOTS,
    'apps/wbs/be-01/src/service/fixtures/live-plan.json': '{}\n',
    'apps/wbs/be-01/src/service/nested/solver-exit-outcome.ts': 'export const exitCode = 1;\n',
    'apps/wbs/be-01/src/service/solver.spec.ts': 'export const spec = 1;\n',
    'apps/wbs/be-01/src/service/step.service.db.test.ts': 'export const dbTest = 1;\n',
    'apps/wbs/be-01/src/service/types.d.ts': 'export type Declared = string;\n',
    'apps/wbs/gw-01/src/service/gateway.ts': 'export const gateway = 1;\n',
  });

  expect(await listServiceCandidates(root)).toEqual([
    'apps/wbs/be-01/src/service/nested/solver-exit-outcome.ts',
    'apps/wbs/be-01/src/service/optimizer-wiring.ts',
    'libs/wbs/application/core/src/service/step.service.ts',
    'libs/wbs/application/core/src/use-cases/save-plan.ts',
  ]);
});

test('a service root that tracks nothing is refused, not read as an empty inventory', async () => {
  const root = await gitFixture('kinds-empty-root-', {
    'apps/wbs/be-01/src/service/optimizer-wiring.ts': 'export const wiring = 1;\n',
    'libs/wbs/application/core/src/service/step.service.ts': 'export const step = 1;\n',
  });

  expect(listServiceCandidates(root)).rejects.toThrow(
    /libs\/wbs\/application\/core\/src\/use-cases tracks no file/,
  );
});

test('a workspace Git cannot read is refused, not read as an empty inventory', async () => {
  const root = await scratchAsync('kinds-no-repo-');

  expect(listServiceCandidates(root)).rejects.toThrow(/git ls-files exited 128/);
});

test('an absent policy is refused, naming the file', async () => {
  const root = await scratchAsync('kinds-absent-');

  expect(readKinds(root)).rejects.toThrow(
    /cannot read the service kinds policy at .*docs\/code-organization\/kinds\.json/,
  );
});

test('an unreadable policy is refused, naming the file', async () => {
  const root = await scratchAsync('kinds-unreadable-');
  await mkdir(join(root, 'docs/code-organization/kinds.json'), { recursive: true });

  expect(readKinds(root)).rejects.toThrow(
    /cannot read the service kinds policy at .*docs\/code-organization\/kinds\.json/,
  );
});

test('a policy that is not JSON is refused, naming the file', async () => {
  const root = await policyFixture('kinds-not-json-', '{ "entries": [\n');

  expect(readKinds(root)).rejects.toThrow(/the service kinds policy at .*kinds\.json is not JSON/);
});

test('a policy that fails the schema is refused with the failing field', async () => {
  const root = await policyFixture(
    'kinds-schema-',
    JSON.stringify({ reviewed: '2026-09-20', entries: [{ path: 'x.ts', kind: 'service' }] }),
  );

  expect(readKinds(root)).rejects.toThrow(ValidationError);
  expect(readKinds(root)).rejects.toThrow(
    /entries\[0\]\.kind must be "delivery", "feature", "repository", "resource" or "support" \(was "service"\)/,
  );
});

test('a policy that classifies one path twice is refused, naming the path', async () => {
  const root = await policyFixture(
    'kinds-duplicate-',
    JSON.stringify({
      reviewed: '2026-09-20',
      entries: [
        { path: 'x.ts', kind: 'support', disposition: 'first' },
        { path: 'x.ts', kind: 'support', disposition: 'second' },
      ],
    }),
  );

  expect(readKinds(root)).rejects.toThrow(/classifies twice: x\.ts/);
});

test('a well-formed policy at the same fixture location is read, not refused', async () => {
  const root = await policyFixture(
    'kinds-control-',
    JSON.stringify({
      reviewed: '2026-09-20',
      entries: [{ path: 'x.ts', kind: 'resource', term: 'work item', rationale: 'why' }],
    }),
  );

  expect(await readKinds(root)).toEqual([
    { path: 'x.ts', kind: 'resource', term: 'work item', rationale: 'why' },
  ]);
});

test('an empty policy is well formed, so the inventory comparison is what catches it', async () => {
  const root = await policyFixture(
    'kinds-empty-',
    JSON.stringify({ reviewed: '2026-09-20', entries: [] }),
  );

  expect(await readKinds(root)).toEqual([]);
});

test('a kind asserted without the field that makes it checkable is named', () => {
  const entries: readonly KindEntry[] = [
    { path: 'a.ts', kind: 'feature', rationale: 'r' },
    { path: 'b.ts', kind: 'resource', rationale: 'r' },
    { path: 'c.ts', kind: 'support', rationale: 'r' },
    { path: 'd.ts', kind: 'feature', capability: 'realtime', rationale: 'r' },
    { path: 'e.ts', kind: 'resource', term: 'work item', rationale: 'r' },
    { path: 'f.ts', kind: 'support', disposition: 'pure domain code', rationale: 'r' },
    { path: 'g.ts', kind: 'repository', rationale: 'r' },
  ];

  expect(entriesMissingRequiredField(entries)).toEqual([
    'a.ts: capability',
    'b.ts: term',
    'c.ts: disposition',
  ]);
});

test('every entry but a re-export shim owes a written rationale', () => {
  const entries: readonly KindEntry[] = [
    { path: 'a.ts', kind: 'support', disposition: `${SHIM_DISPOSITION_PREFIX} delete when done` },
    { path: 'b.ts', kind: 'support', disposition: 'private member of c.ts' },
    { path: 'c.ts', kind: 'resource', term: 'work item' },
    { path: 'd.ts', kind: 'resource', term: 'work item', rationale: 'owns the estimate rules' },
  ];

  expect(entriesMissingRationale(entries)).toEqual(['b.ts', 'c.ts']);
});
```

- [ ] **A2. Watch it fail** because the module does not exist:

```sh
(cd tools/tool-devsync && bun test --preload ../test/scratch/preload.ts src/service-kinds.test.ts)
```

      Expected: exit non-zero with a resolution error naming `./service-kinds`. The subshell keeps
      you in the repository root afterwards, and the directory is the one the Nx target uses, so
      the preload path and the alias resolution are the target's own.

- [ ] **A3. Implement** `tools/tool-devsync/src/service-kinds.ts`. This is the whole file.

```ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// tool-devsync's `build` target runs shellcheck over `bin/*.sh` and bundles no TypeScript, so the
// buildable-library half of the boundary rule has no output to protect here. The half that does
// apply — `scope:infra` may reach `product:shared` — holds, and workspace-projects.test.ts checks
// it against the real Nx graph.
// eslint-disable-next-line @nx/enforce-module-boundaries -- no TypeScript build to protect
import { parseOrThrow, type } from '@shared/validation';

/** The reviewed classification, relative to the workspace root. */
export const KINDS_POLICY_PATH = 'docs/code-organization/kinds.json';

/** The directories whose non-test TypeScript files must each carry a kind. */
export const SERVICE_ROOTS = [
  'libs/wbs/application/core/src/service',
  'libs/wbs/application/core/src/use-cases',
  'apps/wbs/be-01/src/service',
] as const;

/** The filename endings that declare a kind on the file itself, so no policy entry is owed. */
export const KIND_SUFFIXES = ['.feature.ts', '.repository.ts', '.resource.ts'] as const;

/**
 * How every re-export shim's disposition starts.
 *
 * Shims are classified mechanically — the file contains nothing but `export … from` — so they are
 * the one group that owes no written rationale. {@link entriesMissingRationale} reads this prefix
 * to tell the two groups apart, which is why it is a constant rather than a phrase in a document.
 */
export const SHIM_DISPOSITION_PREFIX = 're-export shim;';

/** One reviewed classification of one file that carries no kind suffix. */
export const KindEntry = type({
  path: 'string>0',
  kind: "'delivery' | 'feature' | 'repository' | 'resource' | 'support'",
  'capability?': 'string>0',
  'term?': 'string>0',
  'disposition?': 'string>0',
  'rationale?': 'string>0',
});
export type KindEntry = typeof KindEntry.infer;

/** The whole policy file: the date it was last reviewed and every entry. */
export const KindsPolicy = type({
  reviewed: /^\d{4}-\d{2}-\d{2}$/,
  entries: KindEntry.array(),
});

/**
 * The entries whose kind is asserted without the field that makes it checkable, as
 * `<path>: <field>`, sorted.
 *
 * Rule K9 is the reason: a feature that names no capability and a resource that names no glossary
 * term are claims nobody can test. A support entry owes the disposition that says where the file
 * should end up instead.
 */
export function entriesMissingRequiredField(entries: readonly KindEntry[]): readonly string[] {
  const missing: string[] = [];
  for (const entry of entries) {
    if (entry.kind === 'feature' && entry.capability === undefined) {
      missing.push(`${entry.path}: capability`);
    }
    if (entry.kind === 'resource' && entry.term === undefined) missing.push(`${entry.path}: term`);
    if (entry.kind === 'support' && entry.disposition === undefined) {
      missing.push(`${entry.path}: disposition`);
    }
  }
  return missing.sort();
}

/**
 * The entries that owe a one-line rationale and do not carry one, sorted.
 *
 * Every classification but a re-export shim is a reading of the file's callers, its stores and the
 * glossary, and that reading is the only evidence a reviewer has: no check can prove a kind right.
 * A shim is exempt because its disposition already states the whole of its evidence.
 */
export function entriesMissingRationale(entries: readonly KindEntry[]): readonly string[] {
  return entries
    .filter(
      ({ disposition, rationale }) =>
        rationale === undefined && !(disposition ?? '').startsWith(SHIM_DISPOSITION_PREFIX),
    )
    .map(({ path }) => path)
    .sort();
}

/** True when the filename itself declares the kind, which is what rule K1 asks for. */
export function declaresKindBySuffix(path: string): boolean {
  return KIND_SUFFIXES.some((suffix) => path.endsWith(suffix));
}

/** A TypeScript source file a reader is expected to classify: no declarations, no tests. */
function isClassifiableSource(path: string): boolean {
  return (
    path.endsWith('.ts') &&
    !path.endsWith('.d.ts') &&
    !path.includes('.test.') &&
    !path.includes('.spec.')
  );
}

/**
 * Every tracked path matching one pathspec, in Git's own order.
 *
 * @throws When `git ls-files` exits non-zero, naming the pathspec, the root and Git's message.
 *   An unreadable tree is never read as an empty one.
 */
async function trackedMatching(workspaceRoot: string, pathspec: string): Promise<string[]> {
  const child = Bun.spawn(['git', '-C', workspaceRoot, 'ls-files', '-z', '--', pathspec], {
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const [listing, failure, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    throw new Error(
      `cannot list ${pathspec} in ${workspaceRoot}: git ls-files exited ${String(code)}: ${failure.trim()}`,
    );
  }
  return listing.split('\0').filter((path) => path.length > 0);
}

/**
 * Every backend service file that owes a policy entry, sorted and without duplicates.
 *
 * A file whose name ends in a kind suffix is excluded: it has already declared its kind, and
 * asking for an entry as well would mean deleting the entry again in the commit that adds the
 * suffix. {@link listSuffixDeclaredFiles} covers those.
 *
 * @throws When `git ls-files` fails, or when one of {@link SERVICE_ROOTS} tracks no file at all —
 *   a renamed root would otherwise silently shrink the inventory to nothing.
 */
export async function listServiceCandidates(workspaceRoot: string): Promise<readonly string[]> {
  const candidates = new Set<string>();
  for (const root of SERVICE_ROOTS) {
    const tracked = await trackedMatching(workspaceRoot, root);
    if (tracked.length === 0) {
      throw new Error(`${root} tracks no file in ${workspaceRoot}: the service roots are stale`);
    }
    for (const path of tracked) {
      if (isClassifiableSource(path) && !declaresKindBySuffix(path)) candidates.add(path);
    }
  }
  return [...candidates].sort();
}

/**
 * Every tracked file anywhere in the workspace whose name declares its kind, sorted.
 *
 * Empty today and expected to stay empty until a module task renames its first file; an empty
 * listing is therefore not an error here, unlike in {@link listServiceCandidates}.
 *
 * @throws When `git ls-files` fails.
 */
export async function listSuffixDeclaredFiles(workspaceRoot: string): Promise<readonly string[]> {
  const declared = new Set<string>();
  for (const suffix of KIND_SUFFIXES) {
    for (const path of await trackedMatching(workspaceRoot, `*${suffix}`)) {
      if (isClassifiableSource(path)) declared.add(path);
    }
  }
  return [...declared].sort();
}

/**
 * Reads and validates the classification policy.
 *
 * @throws When the file is absent or unreadable, is not JSON, fails the schema, or classifies one
 *   path twice. Never defaults: an empty policy would read as "nothing needs classifying".
 */
export async function readKinds(workspaceRoot: string): Promise<readonly KindEntry[]> {
  const path = join(workspaceRoot, KINDS_POLICY_PATH);
  let source: string;
  try {
    source = await readFile(path, 'utf8');
  } catch (cause) {
    throw new Error(`cannot read the service kinds policy at ${path}`, { cause });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (cause) {
    throw new Error(`the service kinds policy at ${path} is not JSON`, { cause });
  }
  const { entries } = parseOrThrow(KindsPolicy, parsed);
  const classified = new Set<string>();
  const twice = new Set<string>();
  for (const { path: entryPath } of entries) {
    if (classified.has(entryPath)) twice.add(entryPath);
    classified.add(entryPath);
  }
  if (twice.size > 0) {
    throw new Error(
      `the service kinds policy at ${path} classifies twice: ${[...twice].sort().join(', ')}`,
    );
  }
  return entries;
}
```

      The two `catch (cause)` blocks add context and rethrow, which R5 permits; neither swallows,
      and both are necessary: `EISDIR` and `JSON Parse error` carry no path of their own.

- [ ] **A4. Rerun.**

```sh
(cd tools/tool-devsync && bun test --preload ../test/scratch/preload.ts src/service-kinds.test.ts)
```

      Expected: `13 pass`, `0 fail`, exit 0. This is **this file's** count, not the devsync
      target's; the target runs 24 test files and is the planner's to run.

- [ ] **A5. Negative proofs.** Run every row of section 8 whose slice column says A, with the
      restore discipline stated there. Only after observing each failure, write its `Proof:`
      comment above the check it belongs to, describing what you actually saw and dating it.

- [ ] **A6. Type check, lint and format.**

```sh
NX_DAEMON=false bunx nx run tool-devsync:typecheck
NX_DAEMON=false bunx nx run tool-devsync:lint
bunx prettier --write tools/tool-devsync/src/service-kinds.ts tools/tool-devsync/src/service-kinds.test.ts
NX_DAEMON=false bunx nx format:check --all
```

      Expected: the first three exit 0 with no diagnostic; the fourth exits 0, or names only files
      outside this packet's plan, which you report and leave alone.

**Checkpoint A.** Stop. Report: the two paths, `13 pass / 0 fail`, every proof with its observed
failing line, and the commit subject `feat(devsync): read and validate the service kinds policy`.
Do not create `docs/code-organization/kinds.json`. Do not run the whole devsync target.

---

### Slices B to E2 — classification, in reviewed groups

Every classification slice follows the same shape. The decision table and the importer procedure
below are shared; the group differs.

**The decision table**, applied in order:

| If the file                                                                                              | Then                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contains only re-export statements                                                                       | `support`, disposition `re-export shim; delete when importers use <target> directly`, `<target>` being that file's own module                    |
| Coordinates two or more resources, opens or owns a transaction, or implements one user-visible operation | `feature`, with the accepted capability it serves                                                                                                |
| Holds the rules and invariants of one glossary aggregate and is built over stores                        | `resource`, with the exact glossary term                                                                                                         |
| Wraps one external thing with no decisions: a process, a socket, an HTTP client                          | `repository`                                                                                                                                     |
| Is a pure function over values with no store and no clock                                                | `support`, disposition `pure domain code; move to the domain library`                                                                            |
| Is a private helper of exactly one other file                                                            | `support`, disposition `private member of <file>`                                                                                                |
| Is a timer, buffer, throttle or broadcaster shared by several services                                   | `support`, disposition naming what it really is and the module that should own it                                                                |
| Has no importer anywhere, after the whole procedure below                                                | `support`, disposition `unreferenced; candidate for deletion, confirm before the ratchet task`, and list it at the checkpoint. Do not delete it. |

`optimized-schedule-reader.ts` and `optimizer-wiring.ts` re-export **and** declare their own
symbols, so the first row does not apply to them.

**Finding the importers.** With `<stem>` the basename without `.ts` (for
`libs/wbs/application/core/src/service/step.service.ts`, `step.service`):

1. `git grep -n "<stem>"` across the repository. One search covers all four spellings, because each
   contains the stem: the alias path `@wbs/core/service/<stem>`, the barrel entry
   `export * from './service/<stem>'` in `libs/wbs/application/core/src/index.ts`, the relative
   forms `./<stem>` and `../service/<stem>`, and the backend application's shim.
2. If the barrel re-exports the file, also `git grep -n "<ExportedSymbol>"` for each symbol it
   exports, because barrel consumers import from `@wbs/core` and never name the file.
3. Ignore matches inside the file itself, inside `docs/`, and inside this packet.
4. Classify by what the callers do with it, not by which directory they sit in.

**The rationale.** Every entry whose disposition does not begin with `re-export shim;` carries a
one-line `rationale` naming the evidence: which callers you read, which stores or ports the file
touches, and the glossary term or capability it serves. `entriesMissingRationale` enforces its
presence in slice F; only the planner's review can judge whether it is true.

**The file.** `docs/code-organization/kinds.json` is one object with `reviewed` set to the date you
write it and `entries` sorted by `path`. Slice B creates it; each later slice adds its group's
entries and re-sorts. Never remove another slice's entry.

- [ ] **Slice B — the 36 re-export shims.** Mechanical: a shim's classification is its target, and
      the target is in the file. Generate the list rather than reading 36 files by hand:

```sh
cat > "$TMPDIR/shims.ts" <<'TS'
const { listServiceCandidates } =
  await import(`${process.cwd()}/tools/tool-devsync/src/service-kinds.ts`);

const shim = /^\s*export\s+(?:\*|\{[^}]*\}|type\s+\{[^}]*\})\s+from\s+'([^']+)';?\s*$/;
let count = 0;
for (const path of await listServiceCandidates(process.cwd())) {
  if (!path.startsWith('apps/wbs/be-01/')) continue;
  const lines = (await Bun.file(path).text())
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => line.trim().length > 0 && !line.trim().startsWith('//'));
  const targets = lines.map((line) => shim.exec(line)?.[1]);
  if (targets.length === 0 || targets.some((target) => target === undefined)) continue;
  count += 1;
  console.log(`${path} -> ${[...new Set(targets)].join(', ')}`);
}
console.error(`shims ${String(count)}`);
TS
bun "$TMPDIR/shims.ts"
```

      Expected: `shims 36` on stderr, and 36 `path -> target` lines. Thirty-five targets begin
      `@wbs/core`; one, `apps/wbs/be-01/src/service/push-client.ts`, is `@wbs/runtime-portable`.
      A different count is a stop condition. Write one `support` entry per line, disposition
      `re-export shim; delete when importers use <target> directly` with that line's own target —
      **never "the core" for the push client**. No rationale field on these.
      Then `bun "$TMPDIR/queue.ts"` → expect `classified 36, left 59, stale 0`.

- [ ] **Slice C — the core's four use cases.** `replay.ts`, `retention-sweep.ts`,
      `run-command-batch.ts`, `save-plan.ts`. The use-cases README states what the core already
      calls a use case and declares its external consumers; read it and each file's callers.
      Then `bun "$TMPDIR/queue.ts"` → expect `classified 40, left 55, stale 0`.

- [ ] **Slice D — the nine backend files that hold real code.** The list is in section 3. These
      concern the optimizer, the optimized-schedule reader and the solver process; several wrap a
      child process or a socket, which is the `repository` row, and at least one is a private
      member of another. Read the callers; the directory name proves nothing.
      Then `bun "$TMPDIR/queue.ts"` → expect `classified 49, left 46, stale 0`.

- [ ] **Slice E1 — the first 23 core service paths in sorted order**, `assumed-assignee.ts`
      through `priority-band.service.ts` inclusive.
      Then `bun "$TMPDIR/queue.ts"` → expect `classified 72, left 23, stale 0`.

- [ ] **Slice E2 — the remaining 23**, `project.service.ts` through `work-item.service.ts`
      inclusive. `work-item.service.ts` is 4,594 lines; read its exported surface and its callers,
      and record its size at the checkpoint as a size-ratchet finding, not as a task for here.
      Then `bun "$TMPDIR/queue.ts"` → expect `classified 95, left 0, stale 0`.

**Checkpoint at the end of B, C, D, E1 and E2.** Stop. Report: the group's entries in full, the
queue script's three numbers against the expected ones, every `unspecified` capability with its
rationale, every `support` entry with its disposition and rationale, every unreferenced file with
the searches you ran, and the commit subject `docs(code-organization): classify <group>`. The
planner reviews each entry and its rationale before the next slice is dispatched. Run
`NX_DAEMON=false bunx nx format:check --all` before reporting; a JSON file Prettier reformats is
formatted with `bunx prettier --write docs/code-organization/kinds.json` and no other path.

---

### Slice F — integration

- [ ] **F1. Confirm the inventory is complete.** `bun "$TMPDIR/queue.ts"` → expect
      `left 0, stale 0` and your step 0 candidate count classified. Anything else is a stop
      condition.

- [ ] **F2. Add the four real-tree cases** to `tools/tool-devsync/src/service-kinds.test.ts`.
      Insert this import line into the existing `node:` group, keeping the sort order, and append
      the four tests at the end of the file. Change nothing else in that file.

```ts
import { fileURLToPath } from 'node:url';
```

```ts
const WORKSPACE = fileURLToPath(new URL('../../..', import.meta.url));

test('every backend service file with no kind suffix is classified exactly once', async () => {
  const classified = (await readKinds(WORKSPACE)).map((entry) => entry.path).sort();

  expect(classified).toEqual([...(await listServiceCandidates(WORKSPACE))]);
});

test('each kind carries the field that keeps it honest', async () => {
  expect(entriesMissingRequiredField(await readKinds(WORKSPACE))).toEqual([]);
});

test('every entry that is not a re-export shim states its rationale', async () => {
  expect(entriesMissingRationale(await readKinds(WORKSPACE))).toEqual([]);
});

test('no entry classifies a file that already declares its kind by suffix', async () => {
  const declaredTwice = (await readKinds(WORKSPACE))
    .map((entry) => entry.path)
    .filter((path) => declaresKindBySuffix(path));

  expect(declaredTwice).toEqual([]);
});
```

      `WORKSPACE` goes above the first `test`, beside `POPULATED_ROOTS`, and
      `declaresKindBySuffix` joins the import list from `./service-kinds`.

- [ ] **F3. Run the file.**

```sh
(cd tools/tool-devsync && bun test --preload ../test/scratch/preload.ts src/service-kinds.test.ts)
```

      Expected: `17 pass`, `0 fail`, exit 0.

- [ ] **F4. Negative proofs.** Run every row of section 8 whose slice column says F, then write the
      `Proof:` comments for those four checks.

- [ ] **F5. Write `docs/code-organization/README.md`:** what the policy is; that it is temporary
      until files carry kind suffixes; that an entry is deleted in the same commit that gives its
      file a suffix, because keeping both fails
      `no entry classifies a file that already declares its kind by suffix`; how to add an entry,
      including the rationale rule and its shim exemption; and a link to the design. Keep it inside
      the repository's document rules: no pre-move root spellings, and every local link resolves.

- [ ] **F6. Append to `openspec/changes/service-taxonomy/verify.md`,** beneath the headings 010.3
      wrote. Append only commands, outcomes and faults observed during this attempt: every command
      from section 10 with its exit status and decisive line, every slice F fault from section 8
      with the failure actually observed, and the queue script's final numbers. Mark slice A's
      command and mutation evidence as pending planner transcription; do not reconstruct earlier
      output from `Proof:` comments. Before accepting slice F, the planner appends that evidence
      from the retained slice A report and patch/log artifacts, identifying the originating
      attempt. Note the Nx cache experiment as pending planner verification.

- [ ] **F7. Type check, lint, format, validate.**

```sh
NX_DAEMON=false bunx nx run tool-devsync:typecheck
NX_DAEMON=false bunx nx run tool-devsync:lint
bunx prettier --write tools/tool-devsync/src/service-kinds.test.ts docs/code-organization/kinds.json docs/code-organization/README.md openspec/changes/service-taxonomy/verify.md
NX_DAEMON=false bunx nx format:check --all
```

      Then the README's **OpenSpec validation** block, verbatim. It already carries
      `OPENSPEC_TELEMETRY=0`, which is what stops 1.12.0 posting telemetry and checking the
      registry for updates, and the launcher has warmed the command into your temporary root, so it
      runs with the network off. Expected: one JSON report printed and the block exits 0. **A
      download attempt is a stop condition**: do not fetch the package and do not substitute a
      looser check. Report the block as not run under "Not verified" instead.

      The block's predicate requires `passed > 0` and `failed == 0` and asserts no absolute total.
      This packet adds no OpenSpec change, so the item count is whatever your step 0 clone already
      had; record it, do not pin it.

- [ ] **F8. Hand over. Do not commit.** Your clone's Git directory is read-only.
      `git status --short` → expect exactly this packet's paths, plus whatever other lanes already
      had, which stays untouched. Report the list and the subject
      `feat(devsync): classify backend services by kind`. Do not run `git add`, `git commit`,
      `git checkout -b`, `git stash` or `git restore --staged`.

- [ ] **F9. The host gate is not run here.** Say so in the report, with the reason. An unavailable
      required check is reported, never treated as passed.

**Checkpoint F.** Stop and report, with the counts per kind, every `unspecified` capability, every
`support` entry with its disposition, and the whole devsync target plus the cache experiment listed
as pending planner verification.

## 8. Negative proofs

Each row was injected and observed by the planner on 2026-09-20 against the supplied files outside
this clone; the executor repeats it in its own attempt and records what it sees. A row is only
believed when its **named** test fails.

**Restore discipline, every row.** Before injecting:
`cp <file> "$TMPDIR/<name>.passing"`. Write the mutation as a patch:
`diff -u "$TMPDIR/<name>.passing" <file> > "$TMPDIR/evidence/<name>.patch"` after editing. Save the
failing output beside it: `… > "$TMPDIR/evidence/<name>.log" 2>&1`. Restore with
`cp "$TMPDIR/<name>.passing" <file>` and prove it with
`cmp <file> "$TMPDIR/<name>.passing"`. Then rerun the check and see it pass. **Never restore from
Git**, and never mask a failure with `|| true` or a trailing `echo exit=$?`. This applies to files
you created in an earlier slice as much as to tracked ones.

| Slice | Fault to inject                                                                                                         | Test that must fail                                                                                                                                                                          |
| ----- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A     | In `isClassifiableSource`, replace `path.endsWith('.ts')` with `true`                                                   | `candidates are the non-test TypeScript files under the roots and nothing else`                                                                                                              |
| A     | Replace `!path.endsWith('.d.ts')` with `true`                                                                           | the same case                                                                                                                                                                                |
| A     | Replace `!path.includes('.test.')` with `true`                                                                          | the same case                                                                                                                                                                                |
| A     | Replace `!path.includes('.spec.')` with `true`                                                                          | the same case                                                                                                                                                                                |
| A     | In `listServiceCandidates`, replace `!declaresKindBySuffix(path)` with `true`                                           | `a file that declares its kind by suffix owes no policy entry, wherever it lives`                                                                                                            |
| A     | Remove `'.repository.ts'` from `KIND_SUFFIXES`                                                                          | the same case, missing the browser-storage repository path                                                                                                                                   |
| A     | Replace the emptiness `if (tracked.length === 0)` with `if (false)`                                                     | `a service root that tracks nothing is refused, not read as an empty inventory`                                                                                                              |
| A     | In `trackedMatching`, replace `if (code !== 0)` with `if (false)`                                                       | `a workspace Git cannot read is refused, not read as an empty inventory`. It fails because the emptiness refusal then fires with the wrong message, which is exactly what the assertion pins |
| A     | Replace the read `catch`'s `throw` with `return [];`                                                                    | `an absent policy is refused, naming the file` **and** `an unreadable policy is refused, naming the file`                                                                                    |
| A     | Replace the JSON `catch`'s `throw` with `return [];`                                                                    | `a policy that is not JSON is refused, naming the file`                                                                                                                                      |
| A     | Widen `KindEntry`'s `kind` to `'string'`                                                                                | `a policy that fails the schema is refused with the failing field`                                                                                                                           |
| A     | Replace the duplicate `if (twice.size > 0)` with `if (false)`                                                           | `a policy that classifies one path twice is refused, naming the path`                                                                                                                        |
| A     | Drop the `capability`, then the `term`, then the `disposition` clause from `entriesMissingRequiredField`, one at a time | `a kind asserted without the field that makes it checkable is named`                                                                                                                         |
| A     | In `entriesMissingRationale`, drop the `rationale === undefined` conjunct                                               | `every entry but a re-export shim owes a written rationale`                                                                                                                                  |
| F     | Delete exactly one entry from `kinds.json`, recording its path                                                          | `every backend service file with no kind suffix is classified exactly once`, with that path on a `-` line                                                                                    |
| F     | Add an entry for a path that does not exist                                                                             | the same case, with that path on a `+` line                                                                                                                                                  |
| F     | Remove `term` from one resource entry                                                                                   | `each kind carries the field that keeps it honest`, naming `<path>: term`                                                                                                                    |
| F     | Remove `rationale` from one non-shim entry                                                                              | `every entry that is not a re-export shim states its rationale`, naming that path                                                                                                            |
| F     | Change one entry's `path` to end in `.resource.ts`                                                                      | `no entry classifies a file that already declares its kind by suffix` **and** the completeness case                                                                                          |

Changing a resource entry to repository is not a usable fault: it preserves completeness and
satisfies the required-field checks. Use the mandatory deletion and stale-entry proofs above. Do
not weaken the completeness assertion.

**The Nx cache experiment is planner-only.** Narrowing it to `bun test` would stop testing Nx
caching at all. Section 10 states it.

## 9. OpenSpec

This task adds no change of its own. It is the first evidence for the `service-taxonomy` change
that 010.3 proposes, and slice F appends its commands, results and observed faults to
`openspec/changes/service-taxonomy/verify.md`.

**What that change's delta spec must say, and what to do if it does not.** The design says observe
mode reports debt and fails nothing. This task does make something fail, and the two are compatible
only if the spec separates them:

- **Inventory integrity is enforced independently of taxonomy observe mode.** A backend service
  file with neither a kind suffix nor a policy entry fails; an entry naming no such file fails; a
  file with both fails; a duplicate entry fails; an absent, unreadable or malformed policy fails.
  These are checks on the record, not on the code.
- **Taxonomy debt remains report-only.** Being the wrong kind, importing across a layer, naming
  `"capability": "unspecified"`, being a re-export shim or being over the size ceiling are reported
  at the checkpoint and change nothing's exit status in this task.

Read the delta spec at step 0 of every slice. If it does not make that distinction, **stop and
report it**: implementing a failing check that the accepted requirement forbids is the
contradiction R4 exists to prevent. Do not edit that specification — it belongs to 010.3, and the
correction is the 010.3 owner's to make.

## 10. Verification

### What the executor runs

| Command                                                                                              | Expected                                                                   |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `git cat-file -e HEAD:<the three service-taxonomy paths>`                                            | Three silent exits of 0.                                                   |
| `(cd tools/tool-devsync && bun test --preload ../test/scratch/preload.ts src/service-kinds.test.ts)` | Exit 0. `13 pass / 0 fail` in slice A, `17 pass / 0 fail` in slice F.      |
| `bun "$TMPDIR/queue.ts"`                                                                             | The slice's own `classified / left / stale` line; `stale 0` always.        |
| `bun "$TMPDIR/shims.ts"` (slice B)                                                                   | `shims 36` and 36 `path -> target` lines.                                  |
| `NX_DAEMON=false bunx nx run tool-devsync:typecheck`                                                 | Exit 0, no diagnostic.                                                     |
| `NX_DAEMON=false bunx nx run tool-devsync:lint`                                                      | Exit 0, no diagnostic.                                                     |
| `NX_DAEMON=false bunx nx format:check --all`                                                         | Exit 0, or failures naming only files outside this packet's plan.          |
| The README's OpenSpec validation block (slice F)                                                     | One JSON report printed, block exits 0 — or reported as not run, with why. |
| Each section 8 row for the slice                                                                     | The named test fails, then passes again after a `cmp`-verified restore.    |

A single case is run by name with
`(cd tools/tool-devsync && bun test --preload ../test/scratch/preload.ts src/service-kinds.test.ts -t '^<exact title>$')`.
`-t` matches the `describe` names and the title **joined**, so an anchored bare title selects
nothing inside a `describe`. Every test in this file is at the top level, in no `describe`, so the
anchored form is correct here — observed on 2026-09-20: `1 pass`, `16 filtered out`, `0 fail`.
**Exactly one test must run.** `0 pass` with everything filtered out is a success-looking result
that proves nothing, and it is a stop condition.

### What the planner runs afterwards, listed by the executor as pending planner verification

| Command                                                            | Why the executor cannot run it                                                                                                                                                   |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git add` of the slice's paths, then the commit with hooks enabled | The clone's Git directory is read-only here.                                                                                                                                     |
| `NX_DAEMON=false bunx nx run tool-devsync:test`                    | Its namespacing test runs the index checker, which writes Git objects into this clone. Expected: exit 0, zero failures, the total recorded — never this packet's own file count. |
| The Nx cache experiment, after slice F is staged                   | It needs the whole target and a warm cache.                                                                                                                                      |
| `bin/h2puni-gate.sh <sha>`                                         | The host gate cannot run on this machine.                                                                                                                                        |

**The cache experiment, in full, for the planner.** With the policy staged and the target's inputs
unchanged: `NX_DAEMON=false bunx nx run tool-devsync:test` twice, expecting the second to print
`Nx read the output from the cache instead of running the command`. Then copy the policy aside,
**delete exactly one entry**, rerun, and expect a cache miss and a failure of
`every backend service file with no kind suffix is classified exactly once` naming that path.
Restore by copying the bytes back and `cmp`. If the rerun happened, the workspace-wide input
already covers the policy: leave `tools/tool-devsync/project.json` unchanged and record that, do
not add a line and call it necessary. If the cache was reused despite the deletion, add one entry
naming `docs/code-organization/kinds.json` under the workspace root to the `test` target's
`inputs`, beside the existing exemptions-file line, and repeat.

**What none of this proves.** No command here proves a classification is right. The kind, the
capability, the glossary term and the disposition are readings of the code, and the only evidence
for them is the rationale field and the planner's review at each checkpoint. The checks prove the
record is complete, non-stale, non-duplicated, well formed, and that nothing asserts a kind without
the field and the sentence that make it reviewable.

## 11. Stop conditions

Stop and report rather than improvising when any of these happens.

1. Any of the three `git cat-file -e HEAD:` checks exits non-zero. The clone predates 010.3.
2. The `service-taxonomy` delta spec does not distinguish enforced inventory integrity from
   report-only taxonomy debt, as section 9 requires.
3. The queue script reports `stale` above zero, or a candidate count that your step 0 did not
   record.
4. `bun "$TMPDIR/shims.ts"` does not report 36, or a target outside `@wbs/core` and
   `@wbs/runtime-portable` appears.
5. A file fits no row of the decision table. Report it with what you read; do not force it.
   An unreferenced file is **not** a stop condition: it has its own row, and it is classified,
   reported and left in place.
6. Classifying a file seems to require moving or editing it.
7. More than a quarter of the feature entries in your group name no accepted capability. Report the
   list; the specification gap is then the real finding.
8. A section 8 injection does not produce the named failure, or produces it in another test.
9. A restore's `cmp` reports a difference, or a rerun after restoring is not green. Do not report
   anything else until the clone is clean.
10. The focused test file's count is not 13 at the end of slice A or 17 at the end of slice F.
11. A `-t` run matches zero tests. `0 pass` with everything filtered out exits 0 and proves
    nothing; treat it as a failure, not a pass.
12. Any step seems to need `git add`, `git commit`, the whole devsync target or the host gate.
    Section 10 says what to do instead.
13. The OpenSpec command is not already present in your temporary root. Report it; do not fetch it
    and do not substitute a looser check.
14. Anything requires editing a file section 12 names.

## 12. Out of lane

`tools/tool-devsync/src/toolchain-pins.test.ts` belongs to packet 020.1.
`tools/tool-devsync/src/repo-namespacing-handoff.test.ts` and everything about the upstream sync
belong to work item 110.6; this packet adds no README under `apps`, `libs` or `tools`, so it moves
no pinned count there. `tools/tool-devsync/project.json` is this packet's, but only the planner
edits it, and only if the cache experiment shows it is needed.
`openspec/changes/service-taxonomy/` is 010.3's, except for the append into `verify.md` that slice
F names: no other file there is edited, no heading 010.3 wrote is rewritten, and its delta spec is
never corrected from here. `CONTEXT.md` is 010.3's and is read only. The three frontend files with
kind suffixes belong to packet 040.6; they appear here only as fixture strings inside a test, never
as real files. No file under the three service roots is edited.

## Review disposition

Two Codex reviews and one high-effort grill were verified finding by finding against the
repository. All were accepted and fixed except the two below, which were checked and kept.

- **Second review, new important 1: "the `gitFixture` helper performs prohibited Git mutations."**
  Rejected. The batch README's execution contract says, in "Who does what": "Git inside a fixture
  repository under the attempt's temporary directory is fine for anyone." `gitFixture` takes its
  directory from `scratchAsync`, which builds it under `os.tmpdir()` — the attempt's own `TMPDIR` —
  and the preload removes it on exit. It never touches this clone's object database, which is the
  thing rule 4a protects. Those three cases stay with the executor, and on 2026-09-20 all three ran
  green outside any clone. Moving them to the planner would leave the executor unable to observe
  four of section 8's own proofs.
- **First review, important 5's ownership half.** Already settled by the README's file-ownership
  table, which gives `tools/tool-devsync/project.json` to 020.8. Recorded in sections 5, 10 and 12
  rather than re-decided. The rest of that finding is fixed: the experiment is now the planner's,
  its mutation is a deletion rather than a kind change, and the packet no longer claims the
  explicit input line is necessary.

Everything else was applied. From the second review: the prerequisite is now
`git cat-file -e HEAD:` against three paths rather than a working-tree `test -f` with an
unsupported merge-base claim; test expectations name the focused file and never the whole target;
the unreferenced-file contradiction between step 5 and section 11 is resolved in favour of
classifying it; the Nx cache experiment moved to the planner with a deletion as its fault; the
filter mutations now cover `.ts`, `.d.ts`, `.test.` and `.spec.` separately; the weakened-`toEqual`
experiment is described as a pair rather than as a proof that must fail; restoration covers files
this packet created; every Nx command carries `NX_DAEMON=false`; and the OpenSpec block names its
network dependency instead of assuming it. From the grill: the fixed `/tmp/kinds.json.passing` path
is gone in favour of `$TMPDIR` with an `evidence` directory; counts are recorded at step 0 and
compared relatively; the `verify.md` collision is resolved in this packet's section 5; and the
95-file classification is cut into five reviewed groups behind one machinery slice, each entry
carrying a rationale that `entriesMissingRationale` requires mechanically.

One correction runs the other way, against the first review's arithmetic, and is kept in section 3:
36 of the 45 backend files are re-export-only and nine hold code of their own, and two of those
nine also re-export, so a textual shim count and an implementation count are not complements.

### Third review, 2026-09-20 (Codex gpt-6-astra, high effort): dispatch, slice A ready

The verdict is DISPATCH: slice A can proceed once reviewed 010.3 is merged, and the four blocking
corrections apply only to slices B through F, which must not be dispatched before those
corrections land. The planner applied all four by hand: both temporary scripts resolve
`service-kinds.ts` through an absolute `process.cwd()` dynamic import instead of a path relative to
`$TMPDIR`; the queue script's catch block rethrows every policy failure except an absent-policy run
made under an explicit `--allow-absent-policy` flag, restricted to slice B's own first invocation;
the optional resource-to-repository fault is removed from section 8 as unusable, leaving the
mandatory deletion and stale-entry proofs as the load-bearing evidence; and F6 now marks slice A's
command and mutation evidence as pending planner transcription rather than assuming a slice F
executor can see an earlier attempt's report. These fixes are in place before slices B through F are
dispatched. No non-blocking note in this review was a one-line unambiguous change, so none were
applied; they remain open findings for the planner.
