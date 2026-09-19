# 010.5 Short command `twib` beside the full name

| Field                                      | Value                                                         |
| ------------------------------------------ | ------------------------------------------------------------- |
| Work item                                  | 010.5 in "PUNI platform plan"                                 |
| Size class                                 | S                                                             |
| top-model-high-effort-planning-tokens      | 800000                                                        |
| mid-level-mid-effort-implementation-tokens | 2500000                                                       |
| top-model-high-effort-review-tokens        | 1000000                                                       |
| Implements                                 | Task 5 of the [rename plan](../2026-09-19-twilight-rename.md) |

Packet format, the execution contract and the standard blocks: [execution batch 1](README.md).
This packet is first in the execution order, so it also proves the pipeline: one executor, one
bounded session, no Git writes, evidence under `$TMPDIR`, hand-over instead of commit.

## 1. Goal and non-goals

**Goal.** Installing the Twilight Bureaucrat package exposes two commands that run the same
program: the documented full name and the short name `twib`. Both are proven by spawning the
installed launchers themselves, so the shebang and the executable bit are exercised, not only the
built file they point at.

**Non-goals.** No publication to any registry. No rename of the package, the Nx project, the source
directory, the legacy environment variables or any stored identifier. No change to what the program
does. No documentation edit: `apps/wiki/cli/README.md` belongs to packet 010.4, which adds the
sentence naming the short command. No Git state change of any kind.

## 2. Read first

| File                                                                 | Why                                                                                                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                                                          | Rules R1 to R5. R5 governs the four negative proofs in section 8.                                                   |
| `LLM_README.md`                                                      | The index. Read it before the packet, as the executor preamble requires.                                            |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`                | The execution contract, file ownership, the standard blocks, and "Counts are relative".                             |
| `docs/superpowers/plans/2026-09-19-batch-1/ASSUMPTIONS.md`           | The execution assumptions, including that no executor gets network access.                                          |
| `apps/wiki/cli/package.json`                                         | The manifest this task edits.                                                                                       |
| `apps/wiki/cli/project.json`                                         | The real target names: `build`, `pack`, `test:package`, `typecheck`, `lint:source`.                                 |
| `apps/wiki/cli/src/packaging/install.test.ts`                        | The test this task edits. Read `installTarball`, `run`, `invoke`, `invokeWithoutWorkspace`, `sanitizedEnvironment`. |
| `apps/wiki/cli/src/packaging/build.ts`                               | Lines 109 and 110 write the shebang and the 0755 mode that the new spawns exercise.                                 |
| `apps/wiki/cli/src/packaging/pack.ts`                                | `bun pm pack` reads the manifest, so the tarball is stale until `pack` reruns after a manifest edit.                |
| `apps/wiki/cli/src/packaging/release.test.ts`                        | Builds its own fixture manifest; read it to confirm it needs no change.                                             |
| `apps/wiki/cli/src/packaging/consumer-bootstrap.test.ts`             | Builds its own fixture manifests; read them to confirm they need no change.                                         |
| `openspec/changes/twilight-bureaucrat-package/specs/package/spec.md` | The capability this change extends, and the GIVEN/WHEN/THEN bullet form its scenarios use.                          |
| `openspec/changes/twilight-bureaucrat-package/.openspec.yaml`        | The exact two-line shape of the metadata file this packet's change needs.                                           |
| `openspec/schemas/sdd-lean/templates/`                               | `proposal.md`, `spec.md`, `tasks.md` and `verify.md` templates, on disk, usable with no network.                    |

## 3. Verified facts, checked on 2026-09-19 and 2026-09-20

### The manifest and the built launcher

- `apps/wiki/cli/package.json` has `"name": "twilight-bureaucrat"`, `"version": "0.1.0"`,
  `"type": "module"`, `"bin": { "twilight-bureaucrat": "dist/bin.mjs" }`,
  `"files": ["dist/", "README.md", "NOTICE"]` and `"engines": { "bun": "1.4.2" }`. It declares no
  `dependencies`.
- `apps/wiki/cli/src/packaging/build.ts:109` writes `#!/usr/bin/env bun` ahead of the bundle, and
  line 110 sets mode `0o755`. Nothing in the packaging tests runs a file through that shebang
  today: every existing run goes through `invoke`, which spawns `[process.execPath, executable,
...argv]` (`install.test.ts:86`). The shebang and the executable bit are untested until this task.
- `apps/wiki/cli/src/packaging/pack.ts:19` runs `bun pm pack` in the package root, so the packed
  tarball carries whatever `apps/wiki/cli/package.json` said at pack time. **Any manifest edit is
  invisible to the test until `pack` runs again.**

### The test file

- `run(command, cwd, env = sanitizedEnvironment(cwd))` (`install.test.ts:50`) returns
  `Bun.spawnSync(...)` directly, with no interpreter prefix and no try/catch. It is the helper that
  exercises a launcher, and a spawn error propagates out of it.
- `sanitizedEnvironment(home)` (`install.test.ts:42`) returns `HOME`, `PATH` copied unchanged from
  `process.env['PATH']`, and `VOLTA_HOME` when the parent has it. The PATH is not narrowed, so
  `#!/usr/bin/env bun` resolves in the child exactly when `bun` is on the PATH of the process that
  ran `bun test`.
- `installTarball` (`install.test.ts:54`) already spawns bare `bun` twice, at lines 67 and 74, with
  `installEnvironment = { HOME: consumer, PATH: process.env['PATH'] ?? '' }` (line 66). **Bun on
  PATH is therefore an existing precondition of the test, established long before any launcher
  runs.** Line 66 also redirects `HOME` into the scratch consumer, so Bun's install cache for those
  two spawns resolves under the consumer directory, not under the executor's home.
- `installTarball` installs with `bun add --exact --ignore-scripts <tarball>`, then
  `bun install --frozen-lockfile --ignore-scripts`, and returns `{ consumer, executable }` where
  `executable` is the installed `dist/bin.mjs`, not a launcher under `node_modules/.bin`.
- The consumer fixture `apps/wiki/cli/fixtures/consumer/package.json` is
  `{"name":"twilight-bureaucrat-consumer-fixture","version":"0.0.0","private":true}`: no
  dependencies.
- The test named `installs the exact tarball with scripts disabled and runs without workspace
resolution` asserts the installed manifest with `toMatchObject`, including
  `bin: { 'twilight-bureaucrat': 'dist/bin.mjs' }`, and runs the program as
  `invoke(executable, ['--version'], consumer)` expecting `0.1.0` and a newline. The same test also
  calls `invokeWithoutWorkspace`, which throws when `bwrap` is absent (`install.test.ts:91`).
- `existsSync`, `rmSync`, `writeFileSync`, `renameSync`, `join` and `expect` are already imported in
  `install.test.ts`. `chmodSync` and `realpathSync` are not; proofs 3 and 4 add them temporarily and
  remove them again.
- The describe block is `packed Twilight Bureaucrat installation` and contains nine tests.
- `release.test.ts` and `consumer-bootstrap.test.ts` write their own fixture manifests containing
  only the full command name. They are inputs to those tests, not assertions about the real manifest.

### What Bun 1.4.2 actually does, probed on this host in a throwaway directory

Run with `bun --version` reporting `1.4.2`, the version `apps/wiki/cli/package.json` pins.

- Spawning a **non-executable** path with `Bun.spawnSync` **throws**; it does not return a child
  exit status. Observed, for a file at mode `0644`:
  `Error EACCES: permission denied, posix_spawn '<path>'`. Observed identically when the spawned
  path is a symlink to a non-executable file.
- Spawning an **absent** path throws `ENOENT: no such file or directory, posix_spawn '<path>'`.
- Spawning an executable `#!/usr/bin/env bun` file that prints `9.9.9` **returns** normally with
  `exitCode` 0 and `stdout` `9.9.9\n`.
- `bun add --exact --ignore-scripts <local tarball>` into a dependency-free consumer succeeds with
  `HTTP_PROXY` and `HTTPS_PROXY` pointed at a dead port, and it creates **one symlink per `bin`
  entry** under `node_modules/.bin`. A two-entry `bin` map produced both links.
- `bun test <file> -t '^<bare title>$'` matches **zero** tests: Bun matches the concatenated
  describe-plus-test name. `-t '^packed Twilight Bureaucrat installation installs the exact tarball
with scripts disabled and runs without workspace resolution$'` matches exactly one.

### OpenSpec, and why the CLI may be unavailable

- The capability of the existing package change is exactly `package`. Its artifacts are
  `openspec/changes/twilight-bureaucrat-package/{.openspec.yaml,proposal.md,design.md,tasks.md,verify.md}`
  and `specs/package/spec.md`. Its `.openspec.yaml` is exactly two lines: `schema: sdd-lean` and
  `created: 2026-09-17`.
- `openspec/config.yaml` sets `schema: sdd-lean`, but `openspec new change --help` on 1.12.0 reports
  `--schema` defaulting to `spec-driven`. The README's "Creating an OpenSpec change" block passes
  the schema explicitly for that reason.
- `openspec/schemas/sdd-lean/templates/` holds `proposal.md`, `spec.md`, `tasks.md`, `verify.md` and
  `design.md` on disk. The artifacts can be written from those templates with no CLI and no network.
- `@fission-ai/openspec@1.12.0` calls `trackCommand` from its CLI pre-action hook.
  `dist/telemetry/index.js:30` posts to `https://edge.openspec.dev`, and `dist/core/version-check.js:11`
  queries `https://registry.npmjs.org`. **One variable disables both:** `dist/telemetry/index.js:73`
  and `dist/core/version-check.js:34` each return early on `OPENSPEC_TELEMETRY === '0'`.
- **`bunx @fission-ai/openspec@1.12.0` needs the registry unless its `bunx` directory is already
  warm.** Probed: with a fresh `TMPDIR`, the command printed `Resolved, downloaded and extracted
[67]` before running. With the directory already present for that exact version, the command ran
  to `1.12.0` with both proxy variables pointed at a dead port. `bunx` keys that directory by
  `TMPDIR`, and this attempt's `TMPDIR` is new, so **assume the CLI is unavailable** and use the
  probe in step 1 to find out.
- The planner's orientation reading at `1eeacb0b` on 2026-09-20 was
  `{"items":95,"passed":95,"failed":0}`. That number is orientation only; step 0 records the one
  that matters.

### Tools present

`bwrap` at `/usr/bin/bwrap`, `jq` at `/usr/bin/jq`, and local `node_modules/.bin/{nx,tsc,eslint,prettier}`,
so `bunx nx`, `bunx tsc`, `bunx eslint` and `bunx prettier` resolve without the registry.

## 4. Unknowns

- Whether the OpenSpec CLI can run in this attempt. Step 1 probes it and branches; it is never
  assumed.
- Whether the real tarball installs offline the way the probe package did. The probe used a
  dependency-free package and a dependency-free consumer, which is what section 3 shows both really
  are, but the real `bun pm pack` output was not installed offline by the planner. Step 0 finds out
  before anything is edited: if the untouched test cannot go green, nothing in this packet can.
- Whether `bun add` links `.bin` entries as symlinks or regular files in this attempt. The probe saw
  symlinks; proofs 2 to 4 move the entry aside with `renameSync` and move it back, so either shape
  works.

## 5. File plan

| File                                                                       | Change                                                                                  |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `apps/wiki/cli/package.json`                                               | Add one entry to `bin`.                                                                 |
| `apps/wiki/cli/src/packaging/install.test.ts`                              | Extend one existing test: manifest expectation, two launcher spawns, one proof comment. |
| `openspec/changes/twilight-bureaucrat-short-command/.openspec.yaml`        | Two lines: `schema: sdd-lean` and the creation date.                                    |
| `openspec/changes/twilight-bureaucrat-short-command/proposal.md`           | The intent artifact, at most 400 words, listing `package` under Capabilities.           |
| `openspec/changes/twilight-bureaucrat-short-command/specs/package/spec.md` | The delta spec adding one requirement to the `package` capability.                      |
| `openspec/changes/twilight-bureaucrat-short-command/tasks.md`              | Ordered TDD slices matching section 7.                                                  |
| `openspec/changes/twilight-bureaucrat-short-command/verify.md`             | Commands, real output and the failure-proof table from section 8.                       |

Seven files. No `design.md`: under `sdd-lean` it is optional and this change has no technical shape.

Build outputs `apps/wiki/cli/dist/` and `dist/twilight-bureaucrat-pack/` change as a side effect of
`build` and `pack`. They are generated, not edited, and are not part of the hand-over list.

## 6. Interfaces

The package manifest's `bin` map after this task:

```json
{ "twilight-bureaucrat": "dist/bin.mjs", "twib": "dist/bin.mjs" }
```

Both names point at the same file. Nothing else reads the map. The installed launchers the test
spawns are `node_modules/.bin/twilight-bureaucrat` and `node_modules/.bin/twib` inside the scratch
consumer the test creates.

## 7. Steps

Each box is one action. Test steps come before implementation steps. Every command states what
success looks like. Every Nx command carries `NX_DAEMON=false`. Every command runs from the clone
root unless it is wrapped in a subshell that says otherwise.

### Step 0 — Record the baseline before touching anything

Nothing is edited here. These recorded numbers, not the planner's, are what every later comparison
uses.

- [ ] `git rev-parse HEAD` → record the starting revision.
- [ ] `printf '%s\n' "$TMPDIR"` → expect a non-empty path that exists. Every backup, patch and
      output file in this packet lives under it. `mkdir -p "$TMPDIR/evidence"`.
- [ ] `bun --version` → expect `1.4.2`, matching the manifest's `engines.bun`. A different version
      is a stop condition, because section 3's spawn behaviour was probed on 1.4.2.
- [ ] `command -v bwrap` → expect a path. The named test calls `invokeWithoutWorkspace`, which
      throws without it.
- [ ] Read the manifest's current `bin` map, anchored so the bare package name elsewhere in the file
      cannot match:

```sh
grep -nE '^[[:space:]]*"twilight-bureaucrat": "dist/bin\.mjs"$' apps/wiki/cli/package.json
```

      Expected: exactly one line. Zero lines means the manifest is not the shape section 3 recorded;
      stop and report.

- [ ] `NX_DAEMON=false bunx nx run twilight-bureaucrat:pack --skip-nx-cache` → expect exit 0 and
      `dist/twilight-bureaucrat-pack/twilight-bureaucrat-0.1.0.tgz` present afterwards
      (`ls -l dist/twilight-bureaucrat-pack/twilight-bureaucrat-0.1.0.tgz`).
- [ ] Run the focused test, untouched, and record its summary:

```sh
TOOL_WIKI_TRUSTED_NODE_MODULES="$PWD/node_modules" bun test \
  --preload ./tools/test/scratch/preload.ts \
  ./apps/wiki/cli/src/packaging/install.test.ts \
  -t '^packed Twilight Bureaucrat installation installs the exact tarball with scripts disabled and runs without workspace resolution$'
```

      Expected: exit 0, `1 pass`, `0 fail`, and the other tests of the file reported as filtered out
      (the planner counted nine tests in that describe block, so `8 filtered out` unless another
      lane added one). Record the exact summary line. **If this fails before any edit, stop and
      report**: the offline install assumption in section 4 did not hold, and nothing later in this
      packet can be trusted.

### Step 1 — Probe the OpenSpec CLI, and choose the branch

- [ ] Run, once:

```sh
OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 --version
```

      Expected, branch A: it prints `1.12.0` and exits 0. The launcher installs the command into
      this attempt's `TMPDIR` before dispatch, and the planner confirmed on 2026-09-20 that it then
      runs inside the offline sandbox, so branch A is the normal case. Branch B: it fails while
      resolving or downloading packages. Record which branch happened and the exact error if it
      failed.

- [ ] **Branch A only. Measure the OpenSpec baseline before creating the change.** Run the README's
      standard validation block with the report kept as evidence, and do not delete it:

```sh
set -euo pipefail
report="$TMPDIR/evidence/openspec-before.json"
OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json | tee "$report"
jq -s -e '
  length == 1 and
  (.[0] | type == "object") and
  (.[0].summary.totals.failed | type == "number" and floor == . and . == 0) and
  (.[0].summary.totals.passed | type == "number" and floor == . and . > 0)
' "$report" >/dev/null
```

      Expected: exit 0. `summary.totals.passed` in that file is the baseline that step 12 compares
      against.

- [ ] Do not install the CLI, do not fall back to another version, and never use npm, pnpm or yarn.
      Branch B is an expected outcome, not a failure of the packet.
- [ ] `OPENSPEC_TELEMETRY=0` stays on **every** OpenSpec invocation in this packet, including the
      producer inside the validation pipeline of step 12. It disables both the telemetry post to
      `edge.openspec.dev` and the update check against `registry.npmjs.org`.

### Step 2 — Create the OpenSpec change directory

- [ ] **Branch A only.** Use the README's standard block:

```sh
OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 new change twilight-bureaucrat-short-command --schema sdd-lean
grep -n "schema: sdd-lean" openspec/changes/twilight-bureaucrat-short-command/.openspec.yaml
```

      Expected: the second command prints exactly one line. If it prints nothing, stop.

- [ ] **Branch B only.** Create the directory and the metadata file by hand, in the shape section 3
      recorded from the existing change:

```sh
mkdir -p openspec/changes/twilight-bureaucrat-short-command/specs/package
printf 'schema: sdd-lean\ncreated: 2026-09-20\n' > openspec/changes/twilight-bureaucrat-short-command/.openspec.yaml
grep -n "schema: sdd-lean" openspec/changes/twilight-bureaucrat-short-command/.openspec.yaml
```

      Expected: the last command prints exactly one line. Use the real current date if it is not
      2026-09-20.

### Step 3 — Write the intent

- [ ] **Branch A only.** Read the instructions first:

```sh
OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 instructions intent --change twilight-bureaucrat-short-command --json
```

      Expected: exit 0, and the output carries the template plus the `intent` rules from
      `openspec/config.yaml`.

- [ ] **Both branches.** Write `openspec/changes/twilight-bureaucrat-short-command/proposal.md` from
      `openspec/schemas/sdd-lean/templates/proposal.md`. Keep it within 400 words. It must have a
      `## Why` section of 50 to 1000 characters, a `## What Changes` section, and a Capabilities
      section naming exactly `package`. No design interview is run for this change: the decision to
      add the alias is already taken in Task 5 of the rename plan, which the proposal links.

### Step 4 — Write the delta spec

- [ ] **Branch A only.**
      `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 instructions specs --change twilight-bureaucrat-short-command --json`
      → expect exit 0.
- [ ] **Both branches.** Write
      `openspec/changes/twilight-bureaucrat-short-command/specs/package/spec.md` with the exact
      content in section 9. The folder is `package` because that is the existing capability folder;
      do not invent a new capability name.

### Step 5 — Write the tasks

- [ ] **Branch A only.**
      `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 instructions tasks --change twilight-bureaucrat-short-command --json`
      → expect exit 0.
- [ ] **Both branches.** Write `tasks.md` as ordered slices matching steps 6 to 11, each naming the
      test that proves it, and the slice that adds the launcher checks naming the four negatives of
      section 8.

### Step 6 — Make the test fail first

- [ ] `cp apps/wiki/cli/src/packaging/install.test.ts "$TMPDIR/install.test.ts.baseline"` → the
      pre-edit bytes, kept so the planner can diff the whole change.
- [ ] In `install.test.ts`, inside the test named in section 3, replace the manifest expectation
      with:

```ts
expect(manifest).toMatchObject({
  name: 'twilight-bureaucrat',
  version: '0.1.0',
  bin: { 'twilight-bureaucrat': 'dist/bin.mjs', twib: 'dist/bin.mjs' },
});
```

- [ ] Directly after the existing `version` assertions, the pair ending
      `expect(version.stdout.toString()).toBe('0.1.0\n');`, add:

```ts
const shortCommand = join(consumer, 'node_modules/.bin/twib');
const fullCommand = join(consumer, 'node_modules/.bin/twilight-bureaucrat');
expect(existsSync(shortCommand), 'the installer did not link the short command').toBe(true);
expect(existsSync(fullCommand), 'the installer did not link the full command').toBe(true);
const shortRun = run([shortCommand, '--version'], consumer, sanitizedEnvironment(consumer));
expect(shortRun.exitCode, shortRun.stderr.toString()).toBe(0);
expect(shortRun.stdout.toString()).toBe('0.1.0\n');
const fullRun = run([fullCommand, '--version'], consumer, sanitizedEnvironment(consumer));
expect(fullRun.exitCode, fullRun.stderr.toString()).toBe(0);
expect(fullRun.stdout.toString()).toBe(shortRun.stdout.toString());
```

      `join`, `existsSync`, `run` and `sanitizedEnvironment` are already in scope. These spawn the
      launcher itself, so the shebang written by `build.ts:109` and the mode set at `build.ts:110`
      are both exercised. The existing `invoke` checks against `dist/bin.mjs` stay exactly as they
      are; nothing above replaces them. Add no PATH guard: `installTarball` already spawns bare
      `bun` at `install.test.ts:67` and 74, long before these lines, so a missing Bun fails there
      first and a guard here would be a check that cannot fail.

- [ ] `cp apps/wiki/cli/src/packaging/install.test.ts "$TMPDIR/install.test.ts.step6"` → **this is
      the byte source proofs 2 to 4 restore to.** The step 0 baseline is the pre-edit file and must
      never be copied back over the finished test.

### Step 7 — Watch it fail

- [ ] Run the focused command of step 0 again, capturing the output:

```sh
( set -o pipefail
  TOOL_WIKI_TRUSTED_NODE_MODULES="$PWD/node_modules" bun test \
    --preload ./tools/test/scratch/preload.ts \
    ./apps/wiki/cli/src/packaging/install.test.ts \
    -t '^packed Twilight Bureaucrat installation installs the exact tarball with scripts disabled and runs without workspace resolution$' \
    2>&1 | tee "$TMPDIR/evidence/step-7-red.txt" )
```

      Expected: a non-zero exit status, `1 fail`, and the failure on the `toMatchObject` manifest
      expectation, because the packed tarball's manifest has no `twib`. The launcher assertions are
      not reached. Record the failing line.

### Step 8 — Add the entry

- [ ] `cp apps/wiki/cli/package.json "$TMPDIR/package.json.baseline"`.
- [ ] In `apps/wiki/cli/package.json` change `bin` to the map in section 6. Change nothing else in
      that file.

### Step 9 — Repack, then watch it pass

- [ ] `NX_DAEMON=false bunx nx run twilight-bureaucrat:pack --skip-nx-cache` → expect exit 0. **This
      is mandatory.** `pack.ts:19` runs `bun pm pack`, so without it the test installs the old
      tarball and the manifest expectation fails for a reason that has nothing to do with the code.
- [ ] Run the focused command of step 7, into `"$TMPDIR/evidence/step-9-green.txt"`. Expected: exit
      0, `1 pass`, `0 fail`, and the same filtered-out count as step 0.
- [ ] Save the passing manifest: `cp apps/wiki/cli/package.json "$TMPDIR/package.json.passing"`.
      Keep `package.json.baseline` unchanged for the final implementation diff.
- [ ] This run is the first that reaches `expect(existsSync(shortCommand), ...)`. It is therefore the
      observation that `bun add --ignore-scripts` links the short command. If that assertion is what
      failed, stop and report: Unknown 3 did not hold.

### Step 10 — The four negative proofs

- [ ] Run each entry of section 8 in order, following the restore discipline stated there. Do not
      write any `Proof:` comment yet.

### Step 11 — Record the proof comment

- [ ] Only after observing all four failures, add this comment immediately above
      `const shortCommand = ...`, with the date actually observed and the failure text actually
      seen:

```ts
// Proof: removing the `twib` entry from the manifest and repacking failed the `toMatchObject`
// manifest expectation; renaming node_modules/.bin/twib aside failed the existence assertion;
// clearing its executable bit aborted the test with `EACCES: permission denied, posix_spawn`
// thrown out of `run`, before the exit-status assertion; and replacing it with a launcher
// printing 9.9.9 failed the output assertion (2026-09-20). Each was restored and rerun green.
```

- [ ] Rerun the focused command of step 7. Expected: exit 0, `1 pass`, `0 fail`.

### Step 12 — Executor verification

- [ ] `NX_DAEMON=false bunx nx run twilight-bureaucrat:typecheck` → expect exit 0, no diagnostic
      printed.
- [ ] `NX_DAEMON=false bunx nx run twilight-bureaucrat:lint:source` → expect exit 0, no ESLint
      problem reported.
- [ ] `NX_DAEMON=false bunx nx run twilight-bureaucrat:build` → expect exit 0.
- [ ] Create `openspec/changes/twilight-bureaucrat-short-command/verify.md` from
      `openspec/schemas/sdd-lean/templates/verify.md` now. Record the observations already collected
      and mark checks not yet run as pending. Do not claim their outcomes in advance.
- [ ] Format only the files this packet owns, then check the repository:

```sh
bunx prettier --write apps/wiki/cli/package.json apps/wiki/cli/src/packaging/install.test.ts \
  openspec/changes/twilight-bureaucrat-short-command/proposal.md \
  openspec/changes/twilight-bureaucrat-short-command/specs/package/spec.md \
  openspec/changes/twilight-bureaucrat-short-command/tasks.md \
  openspec/changes/twilight-bureaucrat-short-command/verify.md
NX_DAEMON=false bunx nx format:check --all
```

      Expected: the check exits 0, or names only files outside this packet's seven, which are
      reported and left alone. Never run a repository-wide format write.

- [ ] **Branch A only.** Run the README's OpenSpec validation block, with the telemetry variable on
      the producer:

```sh
set -euo pipefail
report=$(mktemp)
OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json | tee "$report"
jq -s -e '
  length == 1 and
  (.[0] | type == "object") and
  (.[0].summary.totals.failed | type == "number" and floor == . and . == 0) and
  (.[0].summary.totals.passed | type == "number" and floor == . and . > 0)
' "$report" >/dev/null
jq -e --slurpfile before "$TMPDIR/evidence/openspec-before.json" '
  .summary.totals.passed == ($before[0].summary.totals.passed + 1)
' "$report" >/dev/null
rm -f -- "$report"
```

      Expected: one JSON report is printed and the block exits 0. The comparison must exit 0: the
      final passed count equals the pre-change count recorded in step 1 plus exactly one, because
      this packet adds exactly one change. Never expect an absolute number; another lane can move
      the baseline. If the command tries to download, stop and report.

- [ ] **Branch B only.** Record OpenSpec validation as pending planner verification, naming the
      error from step 1. Do not approximate it with a different tool and do not claim it passed.

### Step 13 — Write the verification record

- [ ] Finalize the existing `verify.md` with the real output of every command above, the
      failure-proof table of section 8 filled in with all four observed failures, and an explicit
      list of the pending planner checks and why they were not run. Then run
      `bunx prettier --write openspec/changes/twilight-bureaucrat-short-command/verify.md` and
      `NX_DAEMON=false bunx nx format:check --all`. Require the formatting outcome step 12 states
      before hand-over.

### Step 14 — Hand over, do not commit

This executor's Git directory is read-only, so there is nothing to stage and nothing to commit.

- [ ] `git status --short` → expect exactly the seven paths of section 5, plus the generated
      `dist/` outputs if they are untracked, plus whatever other lanes already had in the tree, which
      stays untouched. Record the list.
- [ ] Confirm no mutation is left behind.
      `diff -u "$TMPDIR/package.json.baseline" apps/wiki/cli/package.json` must show exactly the one
      added `bin` line and nothing else.
      `diff -u "$TMPDIR/install.test.ts.step6" apps/wiki/cli/src/packaging/install.test.ts` must
      show exactly one hunk, the `Proof:` comment added in step 11, and no leftover line containing
      `temporary fault`. Every fault backup under `$TMPDIR` must already have been restored and
      compared in section 8.
- [ ] Report, under "Ready to commit": the seven paths, and the subject
      `feat(twilight-bureaucrat): add the twib command alias`, with a body carrying step 0's
      baseline, step 9's summary and each negative proof's observed failure line.
- [ ] Do not run `git add`, `git commit`, `git checkout -b`, `git stash` or `git restore --staged`.
      They fail here, and the planner commits after reviewing the diff.
- [ ] Leave `$TMPDIR/evidence` in place. The planner copies it out of the temporary root.

### Step 15 — Completion gate, not run here

- [ ] Do **not** run `bin/h2puni-gate.sh`. The host gate cannot run on this machine.
- [ ] Record in the report: `Host gate not run: unavailable under the executor preamble`, and list it
      under pending planner verification. An unavailable required check is reported, never treated
      as passed.

## 8. Negative proofs

Four checks are new. R5 requires each to be watched failing on a production path before its `Proof:`
comment is trusted. **These are entries, not a table**, because two of the failure texts contain
characters a Markdown table would misrender.

**Restore discipline, for every entry.** The passing bytes are already saved: proof 1 restores to
`$TMPDIR/package.json.passing`, the copy taken in step 9 after the entry was added and the focused
test went green, and proofs 2 to 4 restore to `$TMPDIR/install.test.ts.step6`, the
copy taken at the end of step 6. For each proof: write the mutation as a patch under
`$TMPDIR/evidence`, save the failing output beside it, then restore by copying the saved bytes back
and proving it with `cmp`. Never restore from Git: Git would discard the passing uncommitted work.
Generate the patch with an explicit status check rather than masking it, for example:

```sh
diff -u "$TMPDIR/install.test.ts.step6" apps/wiki/cli/src/packaging/install.test.ts \
  > "$TMPDIR/evidence/proof-N.patch"; status=$?; test "$status" -eq 1
```

`diff` exits 1 when the files differ, which is what a real mutation must produce; exit 0 means
nothing was injected and the proof is void.

Throughout, `FOCUSED` means the command of step 7, with its `tee` target changed per proof.

### Proof 1 — the published manifest links both names

- **Fault.** Remove the `twib` entry from `bin` in `apps/wiki/cli/package.json`, then
  `NX_DAEMON=false bunx nx run twilight-bureaucrat:pack --skip-nx-cache`. The repack is part of the
  fault: without it the tarball still carries the passing manifest.
- **Must fail.** The `expect(manifest).toMatchObject({...})` manifest expectation, reporting the
  installed `bin` map without `twib`. This is the same failure as step 7.
- **Patch.** `diff -u "$TMPDIR/package.json.passing" apps/wiki/cli/package.json` into
  `$TMPDIR/evidence/proof-1.patch`, with the explicit status check above requiring 1.
- **Restore.** Run `cp "$TMPDIR/package.json.passing" apps/wiki/cli/package.json`, then
  `cmp "$TMPDIR/package.json.passing" apps/wiki/cli/package.json`, then repack and rerun `FOCUSED`.
  Require exit 0 and one passing test. Restoring to `package.json.baseline` would be wrong: that
  snapshot predates the entry, so the manifest expectation would fail again.

### Proof 2 — the installer creates the short launcher

- **Fault.** In `install.test.ts`, insert immediately above
  `expect(existsSync(shortCommand), ...)`:

```ts
renameSync(shortCommand, `${shortCommand}.absent`); // temporary fault, removed after observation
```

- **Must fail.** `expect(existsSync(shortCommand), 'the installer did not link the short command').toBe(true)`,
  with received `false` and that message. No repack is needed; the manifest stays valid.
- **Restore.** `cp "$TMPDIR/install.test.ts.step6" apps/wiki/cli/src/packaging/install.test.ts`, then
  `cmp "$TMPDIR/install.test.ts.step6" apps/wiki/cli/src/packaging/install.test.ts`, then `FOCUSED`
  green.

### Proof 3 — the launcher is executable

- **Fault.** Add `chmodSync` and `realpathSync` to the `node:fs` import, and insert immediately above
  the `shortRun` assignment:

```ts
chmodSync(realpathSync(shortCommand), 0o644); // temporary fault, removed after observation
```

- **Must fail.** Not an assertion. On Bun 1.4.2 `Bun.spawnSync` **throws** on a non-executable path,
  and `run` returns that call directly, so the test aborts inside
  `run([shortCommand, '--version'], consumer, sanitizedEnvironment(consumer))` with
  `EACCES: permission denied, posix_spawn '<consumer>/node_modules/.bin/twib'`, before the exit-status
  assertion, and `shortRun` is never assigned. **Expect exactly that:** a failing test whose reported
  error is the uncaught `EACCES`. The planner probed this on this host; see section 3. If instead the
  test reports a non-zero `exitCode` through the assertion, record what happened and report it — the
  runtime behaviour changed and the proof comment must say what was actually seen.
- **Restore.** `cp "$TMPDIR/install.test.ts.step6" apps/wiki/cli/src/packaging/install.test.ts`, then
  `cmp` the two, then `FOCUSED` green. The mode change lives only inside the throwaway consumer the
  test creates, so nothing tracked needs a mode restore.

### Proof 4 — the launcher runs the installed program

- **Fault.** Add `chmodSync` to the `node:fs` import, and insert immediately above the `shortRun`
  assignment:

```ts
// temporary fault, removed after observation
renameSync(shortCommand, `${shortCommand}.real`);
writeFileSync(shortCommand, "#!/usr/bin/env bun\nconsole.log('9.9.9');\n");
chmodSync(shortCommand, 0o755);
```

- **Must fail.** `expect(shortRun.stdout.toString()).toBe('0.1.0\n')`, with received `'9.9.9\n'`. The
  planner probed that an executable `#!/usr/bin/env bun` file printing `9.9.9` returns normally with
  exit 0, so this fault reaches the output assertion rather than throwing. It also proves the run goes
  through the launcher and not through `dist/bin.mjs`.
- **Restore.** `cp "$TMPDIR/install.test.ts.step6" apps/wiki/cli/src/packaging/install.test.ts`, then
  `cmp` the two, then `FOCUSED` green.

## 9. OpenSpec

This task changes what an installed package exposes, which is observable behaviour, so R4 requires a
change. The change is `twilight-bureaucrat-short-command` on the `sdd-lean` schema, with the five
files listed in section 5 and no `design.md`.

The capability is `package`, the one the existing `twilight-bureaucrat-package` change defines at
`openspec/changes/twilight-bureaucrat-package/specs/package/spec.md`. The delta spec is exactly:

```markdown
## ADDED Requirements

### Requirement: The package installs a short command

An installed Twilight Bureaucrat package SHALL link the command `twib` to the same executable as
`twilight-bureaucrat`, and both installed launchers SHALL be executable.

#### Scenario: Both installed launchers run the same program

- **GIVEN** the packed tarball is installed with lifecycle scripts disabled
- **WHEN** `node_modules/.bin/twib --version` and `node_modules/.bin/twilight-bureaucrat --version`
  are spawned directly
- **THEN** both exit zero and print the same version

#### Scenario: The short command is absent from the manifest

- **GIVEN** a packed tarball whose `bin` map lacks `twib`
- **WHEN** the package install test runs
- **THEN** it fails on the manifest expectation

#### Scenario: The short launcher is not executable

- **GIVEN** an installed package whose `node_modules/.bin/twib` has lost its executable mode
- **WHEN** the package install test spawns it directly
- **THEN** the spawn raises `EACCES` and the test fails before it can read an exit status
```

Scenarios use exactly four hashtags and the GIVEN/WHEN/THEN bullet form the existing `package` spec
uses.

## 10. Verification

Every row states the exit status and the line or count that says it worked.

### What the executor runs

| Command                                                                | Expected                                                                                     |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:pack --skip-nx-cache` | Exit 0. The tarball exists at `dist/twilight-bureaucrat-pack/twilight-bureaucrat-0.1.0.tgz`. |
| The `FOCUSED` command of step 7                                        | Exit 0, `1 pass`, `0 fail`, and step 0's filtered-out count.                                 |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:typecheck`            | Exit 0, no diagnostic printed.                                                               |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:lint:source`          | Exit 0, no ESLint problem reported.                                                          |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:build`                | Exit 0.                                                                                      |
| `NX_DAEMON=false bunx nx format:check --all`                           | Exit 0, or failures naming only files outside this packet's seven, reported and left alone.  |
| The OpenSpec block in step 12, branch A only                           | One JSON report printed, the block exits 0, `passed` exactly step 1's number plus one.       |

### What the planner runs afterwards, and the executor reports as pending

| Command                                                        | Why the executor cannot run it                                                                                                                                                            |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git add` of the seven paths, then the commit                  | The clone's Git directory is read-only here.                                                                                                                                              |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:test:package` | The whole target re-runs all nine tests of the file plus the other packaging suites; the executor ran its own named test only. Run it after staging, as part of integration verification. |
| The OpenSpec validation block, if step 1 took branch B         | `bunx` cannot fetch the CLI without the registry in this attempt.                                                                                                                         |
| `bin/h2puni-gate.sh <sha>`                                     | The host gate cannot run on this machine.                                                                                                                                                 |

`test:package` is listed for the planner because of scope, not because it writes Git objects into
the clone: its Git writes all happen inside scratch fixture repositories under the attempt's
temporary root, which the execution contract explicitly permits for anyone.

**What none of it proves.** Nothing here proves registry publication; that is a separate task that
needs Dany. Nothing proves behaviour on a host where `bun` is absent from PATH — the test's own
installer requires it two spawns earlier, and no check in this packet covers that. Nothing proves
the other eight tests of `install.test.ts` still pass; the executor runs one named test, and the
whole target is the planner's.

## 11. Stop conditions

Stop and report rather than improvising when any of these happens.

1. `bun --version` is not `1.4.2`. Section 3's spawn behaviour was probed on that version and
   proof 3 depends on it.
2. `bwrap` is absent. The named test calls `invokeWithoutWorkspace`, which throws without it.
3. The anchored `grep` in step 0 prints zero lines, or the untouched focused test in step 0 does not
   pass.
4. After the manifest entry is added and the package is repacked, step 9 finds no
   `node_modules/.bin/twib` in the consumer.
5. Any of the four negative proofs does not produce the named failure, or a restored file does not
   compare equal to its saved copy.
6. Any packaging test other than the edited one starts failing in a run the executor makes.
7. The release planner or the trusted module closure rejects the manifest change.
8. The capability folder `specs/package` is not the one the existing package change uses.
9. Any step would require a Git state change, a network fetch this packet has not named, or a file
   outside section 5.

## 12. Out of lane

- `apps/wiki/cli/README.md`. Packet 010.4 owns it and adds the sentence naming the short command.
- Everything under `apps/wiki/cli/src` except `packaging/install.test.ts`, including `cli.ts` and
  the new rules directory, which packet 010.4 owns.
- `openspec/changes/twilight-bureaucrat-package/`. This task adds a new change; it does not edit the
  existing one.
- `CONTEXT.md`, owned by 010.3. This packet introduces no new domain term: `twib` is a binary name,
  not a concept.
- Every other packet's files, and every tracked file not named in section 5.

## 13. One session, no checkpoints

This packet is size S: one manifest line, one test edit, five small documents and four proofs. It is
one bounded session with no mid-packet checkpoint. The executor stops only at a stop condition or at
step 15, and the planner reviews the whole diff at once.

## Review disposition

### First review, 2026-09-19 (Codex gpt-6-astra, high effort)

All seven findings were verified against the repository and applied in revision 2. The second review
confirmed six as fixed and one as partly fixed; that one is the first entry below.

### Second review, 2026-09-19 (Codex gpt-6-astra, high effort)

- **New critical 1, the permission fault cannot fail at the named assertion — CONFIRMED and fixed.**
  Verified independently in a throwaway directory on this host: Bun 1.4.2 `Bun.spawnSync` on a
  mode-0644 file throws `EACCES: permission denied, posix_spawn '<path>'` rather than returning an
  exit status, and does the same through a symlink to a non-executable target. `run`
  (`install.test.ts:50`) returns that call directly, so the test aborts before `shortRun` exists.
  Proof 3, the proof comment in step 11 and the third delta scenario now all state the uncaught
  `EACCES` as the expected failure, and proof 3 tells the executor to report rather than improvise if
  the runtime behaves otherwise. The direct spawn is preserved and no synthetic exit status is
  invented.
- **New important 1, the PATH guard is unproved and too late — CONFIRMED and fixed.** Verified:
  `installTarball` spawns bare `bun` at `install.test.ts:67` and `:74`, before any launcher run, so a
  missing Bun fails there first and the guard could never fail on its own. The guard is removed from
  the test snippet, and sections 3, 10 and 11 now state the existing precondition instead of claiming
  a new check.
- **New important 2, OpenSpec telemetry — CONFIRMED and fixed.** Verified in the cached 1.12.0
  package: `dist/telemetry/index.js:30` posts to `https://edge.openspec.dev`, and
  `dist/core/version-check.js:11` queries `https://registry.npmjs.org`. Both return early on
  `OPENSPEC_TELEMETRY === '0'` (`telemetry/index.js:73`, `version-check.js:34`), so one variable
  covers both. It is now on every OpenSpec invocation, including the producer inside the validation
  pipeline.
- **Nx daemon flag — fixed.** Every Nx command in the packet now carries `NX_DAEMON=false`.
- **Focused verification instead of the whole package target — fixed, with one correction.** The
  review's command shape is adopted, and repacking after a manifest mutation is now mandatory and
  explained from `pack.ts:19`. The correction: the review's and the batch instructions' `-t
'^<exact title>$'` form matches **zero** tests. Verified on Bun 1.4.2 in a throwaway directory —
  Bun matches the concatenated describe-plus-test name, so `^installs the exact tarball…$` matched 0
  tests while the full `^packed Twilight Bureaucrat installation installs the exact tarball…$`
  matched 1. The packet uses the full anchored form everywhere.
- **`test:package` assigned to the planner — fixed, and the review's correction adopted.** Section 10
  no longer describes it as writing Git objects into the executor's clone; its Git writes happen in
  scratch fixture repositories, which the execution contract permits. It is planner-only because of
  scope.
- **Step 15 hand-over instead of commit — fixed**, with the commit subject
  `feat(twilight-bureaucrat): add the twib command alias`.
- **Step 16 host gate — fixed.** The executor is told not to run it and to record it as unavailable.
- **A writable Bun cache — REJECTED, with evidence.** The review asked for
  `BUN_INSTALL_CACHE_DIR=/tmp/010-5-bun-cache` so a cache miss cannot write under the executor's
  home. The test already prevents that: `install.test.ts:66` builds `installEnvironment` as a fresh
  `{ HOME: consumer, PATH }` object, so the two `bun` spawns inherit no cache variable and resolve
  their cache under the scratch consumer, not under the real home. Adding a fixed
  `/tmp/010-5-bun-cache` would also violate the execution contract's rule that every scratch path
  lives under the attempt's `$TMPDIR`. Verified separately that a dependency-free tarball installs
  into a dependency-free consumer with both proxy variables pointed at a dead port, so there is no
  cache miss to service.

### Grill points naming this packet, 2026-09-19

- **Q6, the executable-bit mutation.** Same finding as new critical 1; fixed as above, with the
  planner's own probe recorded in section 3.
- **Q5, 010.4 and 010.5 jointly change the same built package.** Both edit different files that end
  up in one tarball. This packet cannot verify the combination; section 10 assigns
  `twilight-bureaucrat:test:package` and the integration matrix to the planner, and section 12 keeps
  the two lanes' files disjoint.
- **Unasked 4, restoration ownership.** Section 8 now persists, per fault, the backup path, the
  mutation as a patch under `$TMPDIR/evidence`, and the failing output beside it, and requires a
  `cmp` or `diff` before the attempt is considered restored.
- **Unasked 9, private state per attempt.** Every scratch path is `$TMPDIR`-relative. No fixed path
  under the system temporary directory appears anywhere in this packet. The scratch preload is used
  unchanged.
- **Unasked 12, OpenSpec counts.** Step 12 expects step 1's recorded number plus exactly one, never
  an absolute total. The planner's orientation figure of 95 at `1eeacb0b` is labelled orientation.
- **Unasked 3 and 11, proving the committed bytes.** Step 14 hands over a file list and a subject and
  forbids every Git write; the planner stages, inspects and replays.
- **Unasked 16, never masking a required check.** No `|| true` and no `; echo exit=$?` appears. The
  one place a non-zero status is expected, `diff` while generating a patch, uses an explicit
  `test "$status" -eq 1`, which fails loudly if nothing was injected.

### Open questions for the planner

- **Network.** This packet names no host and assumes none. If step 1 takes branch B, OpenSpec
  validation moves to the planner. The planner can remove that branch entirely by warming the
  attempt's `bunx` directory before dispatch: with
  `$TMPDIR/bunx-<uid>-@fission-ai/openspec@1.12.0` already populated, the command was observed
  running with both proxy variables pointed at a dead port.

### Third review, 2026-09-20 (Codex gpt-6-astra, high effort): DISPATCH AFTER FIXES

Applied by the planner by hand, with the reviewer's exact text: proof 1 now restores to a snapshot
taken after the entry was added, not before; step 1 measures the OpenSpec baseline that step 12
compares against; `verify.md` is created before the formatter is pointed at it. The planner also
recorded that the launcher installs the OpenSpec command into the attempt's temporary root, so
branch A is the normal case.
