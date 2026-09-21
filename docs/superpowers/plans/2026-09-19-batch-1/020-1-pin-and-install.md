# 020.1 Rewrite adoption slices 1 and 2, pin and install the three libraries

| Field                                      | Value                                                                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Work item                                  | 020.1 in "PUNI platform plan"                                                                       |
| Size class                                 | S                                                                                                   |
| Execution order                            | 2 of 8 in this batch                                                                                |
| Network                                    | On: the package registry, plus Nx's analytics host as on every Nx run                               |
| top-model-high-effort-planning-tokens      | 800000                                                                                              |
| mid-level-mid-effort-implementation-tokens | 3500000                                                                                             |
| top-model-high-effort-review-tokens        | 1000000                                                                                             |
| Implements                                 | The 2026-09-19 amendment of the [package adoption plan](../2026-09-17-personal-package-adoption.md) |

## 1. Goal and non-goals

**Goal.** The three owner-maintained libraries are installed at exact versions, a test holds those pins and the report library's single resolved copy and version, two probes show what the runtime actually loads, and slices 1 and 2 of the adoption plan describe the libraries as they are today.

**Non-goals.** No production code imports any of the three libraries in this task. No shared failures module yet; that is work item 020.2. No change to the TypeScript compiler alias. No edit to slices 3 to 8 of the adoption plan beyond the two stale strings named in section 5, which the coverage-table edit would otherwise contradict.

**Network.** This is the one packet in the batch whose attempt runs with network access, and the only host it may deliberately contact is `registry.npmjs.org` (Nx additionally contacts its analytics host on every Nx command, because `nx.json` enables analytics and no environment variable overrides that; see the third review note at the end): step 0 reads package metadata from it, `bun add` and `bun install` fetch tarballs from it, and every `bunx` invocation in this packet — the OpenSpec validator included — resolves through it. Contact nothing else. No credential is needed or permitted; every fetch is of a public package.

## 2. Read first

| File                                                             | Why                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                                                      | Rules R1 to R5. Bun only; never npm.                                                                                                                                                                                                                                                                                 |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`            | The "Execution contract" in full, the standard blocks, and the file-ownership table that keeps this packet out of 020.8's lane.                                                                                                                                                                                      |
| `docs/superpowers/plans/2026-09-19-batch-1/ASSUMPTIONS.md`       | The two assumptions recorded under "Libraries" for this packet: the proposed report budget, and the two slice-7 strings corrected here.                                                                                                                                                                              |
| `docs/superpowers/plans/2026-09-17-personal-package-adoption.md` | The amendment at the top is authoritative; the sections named in section 5 are what you rewrite.                                                                                                                                                                                                                     |
| `package.json`                                                   | The root manifest. It declares no `workspaces`, so it owns every dependency this task installs. Separate manifests exist and are not touched: `apps/wiki/cli/package.json` packages `twilight-burokrat`, and `apps/wiki/cli/fixtures/consumer/package.json` and `infra/ci/burokrat/package.json` serve that package. |
| `nx.json`                                                        | `namedInputs.sharedGlobals` and the `test` target default. This is why the new tests' reads are already cache inputs, and why nothing in `tools/tool-devsync/project.json` needs changing.                                                                                                                           |
| `tools/tool-devsync/src/toolchain-pins.test.ts`                  | The pin tests you extend. Read the header comment about Nx inputs.                                                                                                                                                                                                                                                   |

## 3. Verified facts, 2026-09-19

Registry metadata, read from `registry.npmjs.org` with the command in step 0:

- `di-bag` latest is `0.4.0` with no runtime dependencies. `caught-object-report-json` latest is `11.0.1` with no runtime dependencies. `application-exception` latest is `0.5.0`, depending on `caught-object-report-json ^11.0.1` and `nanoid ^3.3.19`.
- `application-exception` `0.4.0` depends on `caught-object-report-json ^10.0.0` and `nanoid ^3.3.19`. That `^10` is what makes the duplicate proof in step 7 a real second copy rather than a contrived one.

Repository state:

- The root `package.json` has 25 dependencies, 8 exact and 17 with a caret, and no `workspaces` key. None of the three libraries is present.
- `bun.lock` resolves `nanoid` to `3.3.18`, shared with `postcss@8.5.28`, which asks for `^3.3.18`. Installing `application-exception` must move it to 3.3.19 or later.
- In `bun.lock` a top-level package is a line beginning with four spaces and `"<name>": ["<name>@<version>",`. A nested duplicate is spelled `"<parent>/<name>": [`. Example, read from the file: `    "pino": ["pino@10.3.1", "", { … } ],`.
- `nx.json` defines `sharedGlobals` as an explicit list that includes `{workspaceRoot}/package.json` and `{workspaceRoot}/bun.lock`; `namedInputs.default` is `["{projectRoot}/**/*", "sharedGlobals"]`; the `test` target default takes `["default", "^production"]`; and `tool-devsync`'s own `test` inputs begin with `"default"` and also list `{workspaceRoot}/**/*`. Both files the new tests read are therefore already declared inputs, twice over. Nothing in `tools/tool-devsync/project.json` needs adding, and this packet does not own that file.
- `tools/tool-devsync/src` holds **20** `*.test.ts` files, all of which `tool-devsync:test` runs. `tools/tool-devsync/src/toolchain-pins.test.ts` alone held **17 passing tests, 0 failures, 70 `expect()` calls** when run on its own on 2026-09-19. Seventeen is this file's number, never the target's.
- `toolchain-pins.test.ts` defines `WORKSPACE` and an async `read(path)` helper and uses `describe`, `it` and `expect` from `bun:test`. `tools/tool-devsync/tsconfig.spec.json` includes `src/**/*.test.ts`, so `tool-devsync:typecheck` compiles the file this task changes.
- `readProjects('<workspace>')` returns **35** projects. `tool-fleet` (`tools/tool-fleet`) is one of them and is absent from the adoption plan's coverage table. The Burokrat project's current Nx name is `twilight-burokrat` (`apps/wiki/cli`); the coverage table still calls it `wiki-cli`, and so does slice 7's lint instruction.
- The classic compiler alias is `"typescript": "npm:@typescript/typescript6@6.0.2"`. `require('typescript/package.json').version` is `6.0.2` and `require('typescript').version` is `6.0.3`. The compiler API consumers see is 6.0.3, which is di-bag's documented floor, so no alias bump is needed. The existing `the two TypeScripts` tests assert only the major, so they are unaffected.
- `apps/wiki/cli/src/packaging/build.ts` reads the root `package.json` and the installed `typescript` package directory, and its only Git call is `git rev-parse HEAD`, which is read-only. `twilight-burokrat:build` is therefore both runnable here and the check that a root-manifest change did not break packaging; a frontend build is not.

### Why the warm-cache proof cannot be an executor step

Two independent reasons, each sufficient:

- `tool-devsync:test` runs every test file under `tools/tool-devsync/src`, including `repo-namespacing-handoff.test.ts`, whose `the production index checker resolves current Markdown links and anchors` case (line 429) shells out to the wiki index checker. That path reaches `apps/wiki/cli/src/inventory/read-candidate.ts`, which runs `invokeGit(repository, ['write-tree'], env)` at line 278 and `invokeGit(repository, ['add', '--update', '--', '.'], env)` at line 355 — writes into this clone's object database. The executor preamble's rule 4a reserves the whole target for the planner for exactly this reason.
- Even if that test could run, a warm cache needs a **passing** run to exist. Nx 23.2.0's `shouldCacheTaskResult` in `node_modules/nx/dist/src/tasks-runner/task-orchestrator.js` line 1281 reads `task.cache && (process.env.NX_CACHE_FAILURES == 'true' ? true : code === 0)`, and line 347's comment says a cached result is replayed only under the same condition. A failing target neither writes nor replays a cache entry, so "warm the cache, then mutate" is unreachable in a clone where that target cannot reach exit 0.

So the cache proofs belong to the planner, after staging. The executor proves the same two mutations at the assertion level with the focused test file, which is the part it can genuinely observe, and reports the cache behaviour as pending planner verification. Neither side edits, skips or works around the index checker, and neither side edits `tools/tool-devsync/project.json`.

### Bun's package cache is outside the writable area

`node_modules/bun-types/docs/pm/global-cache.mdx` line 6: Bun stores every downloaded package in a global cache at `~/.bun/install/cache`, or the path set by `BUN_INSTALL_CACHE_DIR`. The attempt may write only inside the clone and under `$TMPDIR`, so step 0 points that variable into `$TMPDIR` and every later shell re-exports it.

## 4. Unknowns

| #   | Unknown                                                                                                | How it is resolved                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Whether Bun's local resolution in this clone reproduces the single copy the registry metadata implies. | Step 6's probe B answers it. Nothing in this packet assumes it. The same probe pair was run on 2026-09-19 against a throwaway install of the same three versions and behaved as step 6 and step 7 describe. |
| 2   | Whether `tool-devsync:test` invalidates its cache on each of the two root files.                       | Not resolvable by the executor, for the two reasons in section 3. The planner runs it after staging; the executor reports it as pending planner verification and writes no cache claim into any comment.    |
| 3   | The focused file's test count in this clone today.                                                     | Step 0 records it before anything is edited. Every later expectation is that recorded number plus two, never a hardcoded 19.                                                                                |
| 4   | Whether this machine is the shared build host.                                                         | It is not. The host gate is not run here; step 13 says so and the report names it.                                                                                                                          |

## 5. File plan

| File                                                             | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                                                   | Three new exact dependencies.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `bun.lock`                                                       | Regenerated by Bun.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `tools/tool-devsync/src/toolchain-pins.test.ts`                  | One new `describe` block with two tests and its proof comment.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `docs/superpowers/plans/2026-09-17-personal-package-adoption.md` | Eight named edits, all supplied verbatim in step 9: (a) the amendment's first paragraph; (b) the Intent project count; (c) the `## Published baseline and compatibility` table and its compatibility bullets; (d) the `### Reporting` subsection of `## Proposed integration contract`; (e) the `wiki-cli` row of `## Coverage of every current project` plus a new `tool-fleet` row; (f) slices 1 and 2 in full; (g) two stale strings in slice 7; (h) the opening `**Spec:**` paragraph's OpenSpec sentence. |

`tools/tool-devsync/project.json` is **not** in this list. See section 12.

## 6. Interfaces

Later tasks rely on the three packages being importable at these versions, from one copy of the report library:

```text
di-bag                      0.4.0
application-exception       0.5.0
caught-object-report-json   11.0.1
```

Work item 020.2 builds the shared failures module against these names, whose signatures step 9's rewritten slice 2 fixes:

```ts
toReports(caught: unknown, options?: ToReportsOptions): CapturedReports;
createRedactionPolicy(options?: RedactionPolicyOptions): RedactionPolicy;
// CapturedReports = { occurrence_id: string; diagnostic: DiagnosticReport; public: PublicReport }
// ToReportsOptions = { occurrenceId?: string; diagnostic?: …; public?: … }
// every corj option travels as `corj`, and `redact` is top level on each report's bag
```

## 7. Steps

Each box is one action. Test steps come before implementation steps. Every command states what success looks like, scoped to the command that produces it. Every Nx command carries `NX_DAEMON=false`. Any command that changes directory runs in a subshell from the repository root.

### Step 0 — Baseline and scratch root, before touching anything

- [ ] `git rev-parse HEAD` → record the starting revision. Every count below belongs to it.
- [ ] Establish the attempt's scratch area and point Bun's package cache into it. **Re-export these two lines at the start of every later shell**; shell state does not persist between steps.

```sh
export BUN_INSTALL_CACHE_DIR="$TMPDIR/bun-cache"
mkdir -p "$TMPDIR/evidence" "$BUN_INSTALL_CACHE_DIR"
```

Expected: exit 0, and both directories exist. If `TMPDIR` is unset or `mkdir` fails, stop and report; do not fall back to `~/.bun` or to a fixed path under the system temporary directory.

- [ ] Record the focused file's baseline:

```sh
bun test tools/tool-devsync/src/toolchain-pins.test.ts
```

Expected: exit 0. Record the `N pass` / `M fail` line. **That recorded N, not the planner's, is what every later comparison uses.** For orientation only, the planner saw `17 pass`, `0 fail`, `70 expect() calls` on 2026-09-19; a different number means the revision moved and is not by itself a problem. This is one file of the twenty under `tools/tool-devsync/src`; it is never the `tool-devsync:test` target's total.

- [ ] Confirm the registry still says what section 3 says. This is the packet's first network use, and `registry.npmjs.org` is the only host it may reach.

```sh
bun -e '
for (const name of ["di-bag", "application-exception", "caught-object-report-json"]) {
  const meta = await (await fetch("https://registry.npmjs.org/" + name)).json();
  const latest = meta["dist-tags"].latest;
  console.log(name, latest, JSON.stringify(meta.versions[latest].dependencies ?? {}));
}
const appex = await (await fetch("https://registry.npmjs.org/application-exception")).json();
console.log("0.4.0", JSON.stringify(appex.versions["0.4.0"].dependencies));
'
```

Expected, exit 0 and exactly these four lines:

```text
di-bag 0.4.0 {}
application-exception 0.5.0 {"nanoid":"^3.3.19","caught-object-report-json":"^11.0.1"}
caught-object-report-json 11.0.1 {}
0.4.0 {"nanoid":"^3.3.19","caught-object-report-json":"^10.0.0"}
```

If the registry is unreachable, a latest version differs, or `application-exception` 0.4.0 no longer asks for `caught-object-report-json ^10`, stop and report. Do not substitute a version.

- [ ] `git status --short` → expect no modification to any of the four files in section 5. Unrelated modifications from other lanes may be present; leave them exactly as they are.

### Step 1 — Write the failing tests

- [ ] Append to `tools/tool-devsync/src/toolchain-pins.test.ts`:

```ts
/**
 * The three owner-maintained libraries are pinned exactly, because their report formats are
 * stored data: the diagnostic format changed twice in two days in September 2026.
 *
 * The second test reads lock KEYS and the version each key resolves, which is what the
 * lockfile can say. That the copies a duplicate would produce are actually one module at
 * runtime is a different claim, proved by the resolution probe in the task's verification.
 */
const OWNER_PACKAGES = {
  'di-bag': '0.4.0',
  'application-exception': '0.5.0',
  'caught-object-report-json': '11.0.1',
} as const;

describe('the owner-maintained libraries', () => {
  it('are pinned to exact versions in the root manifest', async () => {
    const manifest = JSON.parse(await read('package.json')) as {
      dependencies?: Record<string, string>;
    };
    const pinned = Object.fromEntries(
      Object.keys(OWNER_PACKAGES).map((name) => [name, manifest.dependencies?.[name]]),
    );
    expect(pinned).toEqual({ ...OWNER_PACKAGES });
  });

  it('resolve to one copy of the report library, at the pinned version', async () => {
    const lock = await read('bun.lock');
    // The key names the copy — a nested one is `"<parent>/caught-object-report-json"` — and
    // the first array element names the version. Asserting the key alone would accept a
    // single entry resolving 10.0.0.
    const copies = lock.split('\n').flatMap((line) => {
      const entry =
        /^ {4}"((?:[^"]+\/)?caught-object-report-json)": \["caught-object-report-json@([^"]+)"/.exec(
          line,
        );
      return entry === null ? [] : [`${entry[1]}@${entry[2]}`];
    });
    expect(copies).toEqual(['caught-object-report-json@11.0.1']);
  });
});
```

### Step 2 — Watch them fail

```sh
bun test tools/tool-devsync/src/toolchain-pins.test.ts
```

Expected: exit 1, with step 0's recorded N still passing and **2 failing**. `are pinned to exact versions in the root manifest` fails with three `undefined` values against the expected map. `resolve to one copy of the report library, at the pinned version` fails on `Expected: ["caught-object-report-json@11.0.1"] · Received: []`. At the planner's 2026-09-19 baseline that reads `17 pass`, `2 fail`; expect your own N, not 17.

### Step 3 — Install

```sh
export BUN_INSTALL_CACHE_DIR="$TMPDIR/bun-cache"
bun add --exact di-bag@0.4.0 application-exception@0.5.0 caught-object-report-json@11.0.1
```

Expected: exit 0, three additions reported, `bun.lock` rewritten, and every tarball fetched into `$TMPDIR/bun-cache` rather than the home directory. Then check placement and the transitive move:

```sh
git diff -- package.json
grep -n '"nanoid": \["nanoid@' bun.lock
```

Expected: the three appear under `dependencies`, not `devDependencies`, each without a caret; `nanoid` is at 3.3.19 or later.

### Step 4 — Watch them pass

```sh
bun test tools/tool-devsync/src/toolchain-pins.test.ts
```

Expected: exit 0, step 0's recorded N plus 2 passing, 0 failing.

### Step 5 — Compile and lint the changed file

```sh
NX_DAEMON=false bunx nx run tool-devsync:typecheck
NX_DAEMON=false bunx nx run tool-devsync:lint
```

Expected: both exit 0 with no diagnostic. `tsconfig.spec.json` includes `src/**/*.test.ts`, so these are the checks that compile and lint what step 1 added.

### Step 6 — Probe what the runtime loads

The tests read text. These two probes read resolution, and they are deliberately **separate**: a single probe that asserted versions first would throw on the version before ever reaching the duplicate comparison, so its duplicate message would be unreachable.

- [ ] Probe A — versions and imports:

```sh
bun -e '
import { createRequire } from "node:module";
const fromRoot = createRequire(process.cwd() + "/package.json");
const expected = {
  "di-bag": "0.4.0",
  "application-exception": "0.5.0",
  "caught-object-report-json": "11.0.1",
};
for (const name of Object.keys(expected)) {
  const entry = fromRoot.resolve(name);
  const start = entry.lastIndexOf("/node_modules/") + "/node_modules/".length;
  const directory = entry.slice(0, entry.indexOf("/", start));
  const { version } = await Bun.file(directory + "/package.json").json();
  console.log(name, version, entry);
  if (version !== expected[name]) {
    throw new Error(name + " resolved " + version + ", expected " + expected[name]);
  }
}
const { DiBag } = await import("di-bag");
const { toReports, createRedactionPolicy } = await import("application-exception");
const { makeCorj } = await import("caught-object-report-json");
console.log("imports", typeof DiBag.createBuilder, typeof toReports, typeof createRedactionPolicy, typeof makeCorj);
'
```

Expected: exit 0, three `<name> <version> <path>` lines matching the pins with every path directly under the clone's `node_modules`, then `imports function function function function`. The version is read from the resolved package directory rather than by requiring `<name>/package.json`, because `di-bag` does not export that subpath.

- [ ] Probe B — one copy of the report library:

```sh
bun -e '
import { createRequire } from "node:module";
const fromRoot = createRequire(process.cwd() + "/package.json");
const rootCopy = fromRoot.resolve("caught-object-report-json");
const fromAppex = createRequire(fromRoot.resolve("application-exception"));
const appexCopy = fromAppex.resolve("caught-object-report-json");
console.log("root  corj", rootCopy);
console.log("appex corj", appexCopy);
if (rootCopy !== appexCopy) {
  throw new Error("two copies of the report library: " + rootCopy + " and " + appexCopy);
}
console.log("one copy");
'
```

Expected: exit 0, the two paths identical, then `one copy`. Both probes were run on 2026-09-19 against a throwaway install of these exact versions and printed exactly this shape.

### Step 7 — Negative proofs

Follow the README's restore block and the preamble's evidence rule. Snapshot first, and keep the snapshot until step 7 ends:

```sh
export BUN_INSTALL_CACHE_DIR="$TMPDIR/bun-cache"
cp package.json bun.lock "$TMPDIR/"
```

Expected: exit 0. Never restore any of these files from Git; Git would discard the passing uncommitted work.

**How every fault in this step is recorded.** Never use `|| true`. `diff` exits 1 when the files differ, which is what a real mutation must produce, so check it: 1 is required, 0 means nothing was injected and the proof is void, anything else is an evidence failure. Run each test or probe with its output redirected straight to its evidence file, capture its real exit status at once, and save that status beside the output. A pipeline through `tee` would return `tee`'s status, not the test's. Both new tests sit inside `describe('the owner-maintained libraries', ...)`, and Bun's `-t` matches the describe name and the title joined, so the filters below anchor the joined name. A run that matches zero tests is not evidence; stop.

```sh
save_patch() { # save_patch <passing-copy> <mutated-file> <patch-name>
  if diff -u "$1" "$2" >"$TMPDIR/evidence/$3"; then echo "no mutation in $2" >&2; return 1
  else status=$?; test "$status" -eq 1; fi
}
run_red() { # run_red <evidence-name> <command...>: requires exit 1, keeps the output and the status
  name=$1; shift
  if "$@" >"$TMPDIR/evidence/$name.out" 2>&1; then status=0; else status=$?; fi
  echo "$status" >"$TMPDIR/evidence/$name.status"
  test "$status" -eq 1
}
```

On any unexpected outcome, restore and compare the saved bytes before stopping.

**7a — the exact pin.** Change `"di-bag": "0.4.0"` to `"di-bag": "^0.4.0"` in `package.json`. Save the mutation and the failing output as files:

```sh
save_patch "$TMPDIR/package.json" package.json 7a-caret.patch
run_red 7a-caret bun test tools/tool-devsync/src/toolchain-pins.test.ts \
  -t '^the owner-maintained libraries are pinned to exact versions in the root manifest$'
```

Expected: `1 fail`, `0 pass`, the diff showing `"di-bag": "^0.4.0"` against the expected map. Restore and prove it:

```sh
cp "$TMPDIR/package.json" package.json
cmp "$TMPDIR/package.json" package.json
bun test tools/tool-devsync/src/toolchain-pins.test.ts \
  -t '^the owner-maintained libraries are pinned to exact versions in the root manifest$'
```

Expected: `cmp` silent and exit 0; the named test back to `1 pass`.

**7b — a real second copy.** During step 7b only, the intentional `application-exception` downgrade from 0.5.0 to 0.4.0 is permitted, with its manifest and lockfile changes and the resulting nested `caught-object-report-json` 10.0.0 copy. During step 7c only, the specified lock-entry version mutation is permitted. These exceptions end after restoration. All network restrictions, peer and resolution-conflict stops and unrelated-change stops remain active.

```sh
export BUN_INSTALL_CACHE_DIR="$TMPDIR/bun-cache"
bun add --exact application-exception@0.4.0
save_patch "$TMPDIR/package.json" package.json 7b-package.patch
save_patch "$TMPDIR/bun.lock" bun.lock 7b-lock.patch
grep -n 'caught-object-report-json": \[' bun.lock >"$TMPDIR/evidence/7b-lock-keys.out"
run_red 7b-tests bun test tools/tool-devsync/src/toolchain-pins.test.ts
```

Expected: the `grep` prints two lines, the second being `"application-exception/caught-object-report-json": ["caught-object-report-json@10.0.0",`. The focused file reports `2 fail`: the pin test on `application-exception` `0.4.0`, and `resolve to one copy of the report library, at the pinned version` on `Received: ["caught-object-report-json@11.0.1", "application-exception/caught-object-report-json@10.0.0"]`.

Then run **both** probes of step 6, each capturing its own output — this is the negative for each:

```sh
run_red 7b-probe-a bun -e '<probe A from step 6>'
run_red 7b-probe-b bun -e '<probe B from step 6>'
```

Expected: probe A exits 1 on `error: application-exception resolved 0.4.0, expected 0.5.0`, and probe B exits 1 on `error: two copies of the report library: …/node_modules/caught-object-report-json/index.js and …/node_modules/application-exception/node_modules/caught-object-report-json/index.js`. Both messages were observed on 2026-09-19 against a throwaway install downgraded the same way. Probe B is run **because** probe A already failed: separating them is what makes the duplicate message reachable.

Restore, reconcile what is installed, and prove the restoration by bytes:

```sh
cp "$TMPDIR/package.json" package.json
cp "$TMPDIR/bun.lock" bun.lock
bun install --frozen-lockfile
cmp "$TMPDIR/package.json" package.json
cmp "$TMPDIR/bun.lock" bun.lock
bun test tools/tool-devsync/src/toolchain-pins.test.ts
```

Expected: `bun install --frozen-lockfile` exits 0, reports reinstalling `application-exception@0.5.0` and removes `node_modules/application-exception/node_modules`, without rewriting either file; both `cmp` silent; the focused file back to step 0's N plus 2 passing. Rerun both probes of step 6 and expect their passing output again. If any of that does not hold, restore by hand before reporting; never leave the tree with a downgraded dependency, and never stage a clone with an unrestored mutation.

**7c — the pinned version, not just the key.** A lockfile-only fault, proving the version half of the second test. No install, and `node_modules` is untouched.

```sh
cp "$TMPDIR/bun.lock" "$TMPDIR/evidence/7c-before.lock"
```

Edit `bun.lock` text alone: in the single top-level `"caught-object-report-json": ["caught-object-report-json@11.0.1",` entry, change `11.0.1` to `11.0.0` inside the bracketed version only.

```sh
save_patch "$TMPDIR/bun.lock" bun.lock 7c-version.patch
run_red 7c-version bun test tools/tool-devsync/src/toolchain-pins.test.ts \
  -t '^the owner-maintained libraries resolve to one copy of the report library, at the pinned version$'
```

Expected: `1 fail`, `0 pass`, on `Expected: ["caught-object-report-json@11.0.1"] · Received: ["caught-object-report-json@11.0.0"]`. Restore:

```sh
cp "$TMPDIR/bun.lock" bun.lock
cmp "$TMPDIR/bun.lock" bun.lock
bun test tools/tool-devsync/src/toolchain-pins.test.ts
```

Expected: `cmp` silent; the file back to N plus 2 passing.

**7d — the proof comment.** Only after watching 7a, 7b and 7c, add above the new `describe` block, with the date you actually observed them:

```ts
// Proof: `"di-bag": "^0.4.0"` failed `are pinned to exact versions in the root manifest` on the
// expected map. Installing application-exception 0.4.0, which needs the report library at ^10,
// put an `application-exception/caught-object-report-json` key at 10.0.0 in bun.lock and failed
// `resolve to one copy of the report library, at the pinned version` on the two-element list,
// while the resolution probe failed on two copies under node_modules. A bun.lock-only edit of
// the version inside the single key failed the same test on `11.0.0` (<date>).
```

Write nothing about the Nx cache in this comment. That observation belongs to the planner and does not exist until step 14 is run.

### Step 8 — Build and format

```sh
NX_DAEMON=false bunx nx run-many -t typecheck --projects=wbs-core,wbs-be-01,wbs-fe-01
NX_DAEMON=false bunx nx run wbs-fe-01:build
NX_DAEMON=false bunx nx run twilight-burokrat:typecheck
NX_DAEMON=false bunx nx run twilight-burokrat:build
```

Expected: all four exit 0. `twilight-burokrat:build` runs `apps/wiki/cli/src/packaging/build.ts`, which reads the root `package.json` and the installed `typescript` package directory; its only Git call is a read-only `git rev-parse HEAD`. It is the check that the manifest change did not break packaging.

```sh
bunx prettier --write tools/tool-devsync/src/toolchain-pins.test.ts \
  docs/superpowers/plans/2026-09-17-personal-package-adoption.md
NX_DAEMON=false bunx nx format:check --all
```

Expected: the write touches only those two files — never a repository-wide format write — and the check exits 0. If the check names a file **not** in section 5, that file belongs to another lane: leave it and report.

### Step 9 — Rewrite the adoption plan

Eight edits in `docs/superpowers/plans/2026-09-17-personal-package-adoption.md`. The replacement text is given in full. Substitute `<date>` **only** where it marks work you are doing now; the archive and API observations carry the planner's 2026-09-19 date and are not restamped, because nothing in this packet re-inspects those archives.

**9a.** Replace the amendment's first paragraph, currently beginning "This plan was written against older package versions", with:

```markdown
This plan was written against older package versions and an older scope. It is kept as the
record of that day. Slices 1 and 2, the published baseline, the reporting contract and the
project inventory were rewritten on <date> by work item 020.1; the rest of the plan below
still predates this amendment, and the facts here replace the matching statements in it.
```

**9b.** In `## Intent`, replace `The workspace has 34 Nx projects` with `The workspace has 35 Nx projects`. The two `34`s under `## Evidence gathered while writing this plan` are dated observations of 2026-09-17 and stay exactly as they are, as does that section's `9.0.1 / 0.3.0 / 0.3.0`.

**9c.** Replace the table and the compatibility bullets of `## Published baseline and compatibility`, from the `Inspected on 2026-09-17` line through the bullet ending `impose and test a bound on the final serialized record as well.`, with:

```markdown
Inspected on 2026-09-19 against the published registry artifacts and their exact archives, whose README, CHANGELOG, `docs/agent/api-card.md` and type declarations were read; GitHub `main` is not the installation source. The 2026-09-17 inspection of 9.0.1 / 0.3.0 / 0.3.0 is recorded under "Evidence gathered while writing this plan" and is superseded here.

| Package                                                                                  | Exact baseline | Verified surface                                                                                                                                                                                                                                                       | Consequence for this repo                                                                                                                                                               |
| ---------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [caught-object-report-json](https://registry.npmjs.org/caught-object-report-json/11.0.1) | `11.0.1`       | `makeCorj`, `makeCorjArray`, `CorjMaker`, `restoreExpectedValues`; report format `corj/v0.14`, `occurrence_id` and `fingerprint` on by default, one `maxReportSize` over the whole report                                                                              | Use for diagnostic serialization. Compact reports can omit `message` and constructor fields; consumers must understand that representation. No runtime dependencies.                    |
| [application-exception](https://registry.npmjs.org/application-exception/0.5.0)          | `0.5.0`        | `defineException`, `isTypedException`, `isTrustedException`, `createTrustRealm`, `createRedactionPolicy`, `toDiagnosticReport`, `toPublicReport`, `toReports`, `decodePublicReport`                                                                                    | Own typed failures locally. Public policies select disclosed content; diagnostics contain substantially more. Depends on CORJ `^11.0.1` and `nanoid ^3.3.19`; `nanoid` moves to 3.3.19. |
| [di-bag](https://registry.npmjs.org/di-bag/0.4.0)                                        | `0.4.0`        | `DiBag.createBuilder`, `register`, `build`, `buildModule`, `installModule`, `verifyGraph`, `fromFactory`, `fromSyncFactory`, `fromAsyncFactory`, `withDisposal`, `withLifetime`, `buildAndStart`, `resolve`, `fork`, `createScope`, `close`; `factoryCtx.pushDisposer` | Compose explicit factories and preserve resource lifetimes with portable factory helpers. Zero runtime dependencies.                                                                    |

Primary documentation: [CORJ](https://github.com/dany-fedorov/caught-object-report-json), [application-exception](https://github.com/dany-fedorov/application-exception), [DI Bag](https://github.com/dany-fedorov/di-bag).

Compatibility work precedes production adoption:

- The classic compiler prerequisite is already met. DI Bag documents classic TypeScript **6.0.3** as its floor and tests native **7.0.2**. This repo uses native 7.0.2 for `tsc` and exposes the compiler API through `typescript: npm:@typescript/typescript6@6.0.2`, whose `require('typescript').version` is **6.0.3**. Do not bump the alias and do not replace the two-compiler arrangement.
- CORJ and application-exception publish CommonJS. Verify Bun import interoperability and the actual Vite/browser bundle, including nanoid's browser resolution. A Bun import does not prove browser execution.
- Use `di-bag`, not `di-bag/node`, in portable code. Register synchronous providers with `DiBag.fromSyncFactory` and asynchronous ones with `DiBag.fromAsyncFactory`: both fix the acquisition mode by name, so a graph built from them runs on a host without `process.getBuiltinModule` and needs no classifier. An async provider still exposes a `Promise<T>` to its consumers, and a Promise that is itself the service keeps `fromFactory(create, { acquisitionMode: 'raw' })`.
- `build()` does not eagerly run every provider or establish readiness. Explicitly acquire required startup services before reporting ready. A factory that acquires a resource before it can return hands it to the bag with `factoryCtx.pushDisposer`; pushed disposers run exactly once, last first, at once if the factory throws.
- `verifyGraph() satisfies void` is a compile-time composition check, not runtime proof that every dependency exists or that no cycle can execute. Exercise runtime graph failures too. `di-bag-graph` is a separate package and is outside this three-package plan.
- Capture both reports with one `toReports` call. It resolves the occurrence id once and shares it, so `diagnostic.occurrence_id === public.occurrence_id` holds for thrown primitives too, and it validates every option bag before building either report rather than returning half a pair.
- `corj: { maxReportSize }` bounds the whole diagnostic report, `context` and `reporting_errors` included: over budget CORJ drops `context` whole and sets `context_omitted: 'max_size'`, then drops `reporting_errors`, and only then trims error content, never `occurrence_id`, `fingerprint` or `v`. One budget replaces the two this plan used to specify; the floor is 512 bytes.
- Redaction is one reusable policy. `keys` and `paths` skip properties, so an excluded getter never runs but its text survives elsewhere; `patterns` and `transform` scrub text wherever it appears. Use key and pattern rules only: a `transform` receives raw containers, and a 0.4-era `transform` keyed on `path` or `stage` silently matches nothing on 0.5.
- Reporting can still throw. A revoked `Proxy` as a cause made `toReports` throw on 11.0.1, observed through the two-report call, so every production reporting call sits behind the never-throw wrapper below.
- Build the options and the policy once, as module constants. The library caches one report maker per options object and policy; creating either per call throws that away.
```

**9d.** Replace the whole `### Reporting` subsection, from ``Add `libs/shared/domain/failures` `` through the paragraph ending `possibly omitted compact values.`, with:

````markdown
Add `libs/shared/domain/failures` as `shared-failures`, alias `@shared/failures`, tagged `scope:shared`, `ring:domain`, `runtime:isomorphic`, `product:shared`. Like `shared-validation`, it contains framework-free transformations, not a logger, process hook, container, or product-specific exception catalogue. It introduces one additional project; the migration inventory must then cover 36.

The libraries now do what this plan once had the repository build: one call returns both reports under one occurrence identifier, redaction is a reusable policy of key and pattern rules, and one byte budget bounds the whole diagnostic report, context included. The module therefore keeps only the four things the libraries cannot decide for this repository — the limits, the sensitive key list, a policy builder over caller-owned secrets, and a never-throw wrapper.

Its public surface is:

```ts
import type { AppexCorjOptions, CapturedReports, RedactionPolicy } from 'application-exception';

/** The one options bag every reporting call shares. Built once; never per call. */
export const FAILURE_REPORT_LIMITS: AppexCorjOptions;

/** Property names skipped in both reports, matched case-insensitively wherever they appear. */
export const SENSITIVE_KEYS: readonly string[];

/** A reusable policy over the secrets the calling boundary owns. Built once at startup. */
export function createFailureRedaction(secrets: readonly string[]): RedactionPolicy;

/**
 * Both reports of one failure, or a visible refusal when reporting itself failed.
 * Reporting loss is modeled, never silent, and never a successful operation.
 */
export type FailureReporting =
  | { readonly reported: true; readonly reports: CapturedReports }
  | { readonly reported: false; readonly occurrenceId: string; readonly reason: string };

export function reportFailure(
  caught: unknown,
  options: { readonly redact: RedactionPolicy; readonly context?: unknown },
): FailureReporting;
```

This is a proposed interface, not existing code. `reportFailure` makes one `toReports` call with `FAILURE_REPORT_LIMITS` as each bag's `corj` and the given policy as each bag's `redact`, and returns `reported: false` with a fixed terminal reason if that call throws, without invoking the reporter again.

Reporting requirements:

1. `FAILURE_REPORT_LIMITS` is `{ maxReportSize: 32_768, maxDepth: 4, maxChildren: 16, inspection: 'no-invoke' }`. The single budget covers the whole report including `occurrence_id`, `fingerprint`, context and reporting errors; there is no second final-size pass and nothing slices JSON text. `inspection: 'no-invoke'` is what keeps a throwing getter from running during a report. Validate the final object against the installed diagnostic schema.
2. `SENSITIVE_KEYS` is `authorization`, `cookie`, `set-cookie`, `password`, `token`, `access_token`, `refresh_token`, `secret`, `jwtKey`, `internalAuthSecret`, passed as the policy's `keys`. Keys skip properties, which hides the value but not its text elsewhere, so `createFailureRedaction` additionally compiles each caller-owned secret into a global `patterns` rule that scrubs it from messages, stacks, `as_string`, `as_json`, `context` and `reporting_errors`. Callers supply only the secrets they own; never attach whole config, request or environment objects. Unknown embedded secrets cannot be guaranteed detectable, so arbitrary request payloads are excluded by construction. A policy that throws fails closed: the value becomes the replacement and the diagnostic report records a `stage: 'redact'` reporting error.
3. Send only selected public reports to user/agent audiences. The policy applies to the public report too, and it sees only what the kind's `public.details` selector returned, so a mistaken selector cannot bypass redaction; validate the public schema after it. Unknown exceptions get `INTERNAL_ERROR` and a generic message. Browser consoles and agent transcripts are disclosure boundaries too; server diagnostics go only to the operator sink. There is no new browser telemetry endpoint in this plan.
4. Expected inspection failures become the package's visible `reporting_errors` and truncation fields. This models diagnostic loss, not successful execution of the failed operation. Reporter configuration errors and sink failures must not become silent success. `reported: false` preserves the original failure and reports the loss; it never retries reporting and never becomes a success.
5. Report an unexpected failure once at its owning boundary. Lower layers may add typed context and rethrow; they do not each emit a duplicate record. Keep cancellation and normal loading/empty/refusal states in their existing control flow.

The logging migration retains the Pino envelope (`level`, `time`, `msg`, service and correlation fields) and changes `err` to the sanitized diagnostic report. Update `log-schema.ts` in the same slice, adding `fingerprint` beside `occurrence_id`: both reports carry one now, and a schema that omits it drops a retry signal. Do not manufacture legacy `name/message/stack` fields from possibly omitted compact values.
````

**9e.** In `## Coverage of every current project`, replace the `wiki-cli` row's first two cells with `twilight-burokrat` and `apps/wiki/cli`, keeping its third cell, and insert this row in the tools block between `tool-devsync` and `tool-git-hooks`:

```markdown
| `tool-fleet` | `tools/tool-fleet` | R/E/D at fleet command and host-connection boundaries; a host it cannot reach is a failing command, never a skipped one. |
```

**9f.** Replace slices 1 and 2 in full, from `### 1. Freeze scope, package versions, and executable acceptance criteria` through slice 2's `**Deliverable:**` line, with:

````markdown
### 1. Freeze scope, package versions, and executable acceptance criteria

**Files:** `package.json`, `bun.lock`, `tools/tool-devsync/src/toolchain-pins.test.ts`; new `tools/tool-devsync/src/package-adoption.ts` and `package-adoption.test.ts`. Inventory reading uses existing `tools/tool-devsync/workspace-projects.mjs`.

- [ ] Install the exact versions using Bun. There is no compiler alias bump: the installed alias already answers the compiler API with 6.0.3.

```sh
bun add --exact di-bag@0.4.0 application-exception@0.5.0 caught-object-report-json@11.0.1
NX_DAEMON=false bunx nx run tool-devsync:typecheck
NX_DAEMON=false bunx nx run twilight-burokrat:build
```

- [ ] Hold the pins in `toolchain-pins.test.ts`, asserting the exact manifest versions and that `bun.lock` carries exactly one `caught-object-report-json` key at 11.0.1. Prove both by mutation: a caret on one pin, a lockfile-only edit of that version, and installing `application-exception` 0.4.0, whose `caught-object-report-json ^10` cannot share the pinned copy.
- [ ] Prove the installation as well as the lockfile text, with two separate probes so that each failure is reachable: one asserts the three resolved versions and imports them, the other asserts that the root and `application-exception` resolve the same `caught-object-report-json` path. A duplicate copy invalidates `isTypedException` and constructor assumptions, and a lockfile key cannot say what the runtime loaded. Keep npm registry URLs and the `npm:` alias syntax; never run npm as a task runner.
- [ ] Add an inventory keyed by Nx project name with three dispositions: `direct`, `via-caller` (naming the owning boundary), or `not-applicable` (with reason). The test compares exact project sets using `readProjects`; a new project, stale entry, or missing package disposition fails. This measures coverage, not successful adoption: completion additionally needs each boundary's behavioral evidence. The set is the 35 current projects plus `shared-failures`, which is 36 once slice 2 lands.
- [ ] Prove the inventory check by adding an unclassified fixture project and by removing its set comparison. Test unreadable/malformed inventory separately from missing project disposition. Confirm `tool-devsync`'s Nx cache inputs cover the inventory file behaviourally, by mutating it under a warm cache; that proof needs a passing run of the whole target, so it belongs to whoever can stage files.
- [ ] Encode scenarios for all requirements above: unknown/primitive failures, secret exclusion, limits, protocol preservation, portable graph execution, readiness, ownership, transaction isolation, tool exits, and complete project coverage. Keep general programming terms out of `CONTEXT.md`; the glossary format excludes them. Any newly resolved product term belongs there immediately.
- [ ] Create no OpenSpec change in this slice. Installing unused dependencies, holding pins and correcting this document change no observable behavior, contract, migration, deploy safety or architecture, and use R4's docs exemption. Each change is created at the start of the slice that first implements under it, as the opening "Spec" paragraph now says: `adopt-failure-reporting` at the start of slice 2, because that slice adds an Nx project, an alias and an exported contract; `adopt-di-composition` at the start of slice 4; `complete-package-adoption` at the start of slice 7. Each has `proposal.md` (intent ≤400 words), delta `specs/`, `tasks.md`, `verify.md`, and `design.md` for its technical shape.

**Deliverable:** locked dependencies at 0.4.0 / 0.5.0 / 11.0.1, a proved single resolved copy of the report library, and exhaustive project accounting. No OpenSpec change is owed by this slice; slices 2, 4 and 7 each open their own. Package changes needing upstream work remain blocked by a named required release; never vendor a workaround silently.

### 2. Build and prove the shared reporting policy

**Create:** `libs/shared/domain/failures/{project.json,tsconfig.json,tsconfig.lib.json,tsconfig.spec.json}`, `src/{index.ts,report-failure.ts,report-failure.test.ts}`; alias in `tsconfig.base.json`. Mirror `shared-validation`'s project structure and test/typecheck/lint targets. Put symbol behavior and limits in JSDoc.

- [ ] Open the `adopt-failure-reporting` OpenSpec change before writing any file of this slice. It covers slices 2 and 3: a new Nx project, a new alias and a new exported reporting contract are architecture and contract under R4, whether or not an application caller has adopted them yet. Its delta spec states the reporting behaviour this slice and the next must exhibit, and its `verify.md` collects both slices' observations.
- [ ] Start with these two acceptance cases, watch them fail against an empty module, then implement `FAILURE_REPORT_LIMITS`, `SENSITIVE_KEYS`, `createFailureRedaction` and `reportFailure` as the contract above defines them:

```ts
import { expect, test } from 'bun:test';

import { createFailureRedaction, reportFailure } from './report-failure';

test('correlates a primitive failure without publishing its contents', () => {
  const redact = createFailureRedaction(['private-marker']);
  const reporting = reportFailure('private-marker leaked', { redact });

  expect(reporting.reported).toBe(true);
  if (!reporting.reported) return;
  const { diagnostic, public: disclosed } = reporting.reports;
  expect(disclosed.occurrence_id).toBe(diagnostic.occurrence_id);
  expect(disclosed.code).toBe('INTERNAL_ERROR');
  expect(JSON.stringify(reporting.reports)).not.toContain('private-marker');
});

test('a cause that cannot be inspected is reported as reporting loss, not as a throw', () => {
  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();
  const reporting = reportFailure(new Error('boom', { cause: proxy }), {
    redact: createFailureRedaction([]),
  });

  // `toReports` throws on a revoked Proxy: `Array.isArray cannot be called on a Proxy that
  // has been revoked`. The boundary must still learn that the operation failed.
  expect(reporting.reported).toBe(false);
});
```

- [ ] Keep report transformation free of Pino, Node/Bun globals, network, and filesystem access. Require the secret policy explicitly; an empty list is appropriate only where the caller owns no secrets.
- [ ] Build `FAILURE_REPORT_LIMITS` and each boundary's policy as constants, never per call: the library caches one report maker per options object and policy.
- [ ] Cover `Error.cause`, ordered `AggregateError`, circular objects, `undefined`, `null`, BigInt, throwing getters, revoked proxies, long Unicode strings, sensitive nested keys, secrets inside stack and message strings, and package inspection failures. Assert the budget behaviour by its visible fields — `context_omitted`, `reporting_errors_omitted`, `truncated` — rather than by byte arithmetic. Validate diagnostic and public schemas after redaction and truncation. Never claim output bounds isolate a nonterminating getter or hook.
- [ ] Add integration tests for secret-bearing config/HTTP/CLI fixtures at their actual call sites in later slices. Remove the key rules, the pattern rules, the shared `toReports` call and the never-throw wrapper separately; record which production test fails for each mutation in the change's `verify.md`.
- [ ] Verify with `NX_DAEMON=false bunx nx run shared-failures:test --skip-nx-cache`, `shared-failures:typecheck`, and `shared-failures:lint`. Add a browser execution fixture to the portable test path; Vite build success alone is insufficient.

**Deliverable:** one reporting policy reusable by WBS, wiki, and infrastructure without cross-product imports, under an OpenSpec change opened before its first file.
````

**9g.** In slice 7, replace ``Use `wiki-cli:lint:source` for source lint`` with ``Use `twilight-burokrat:lint:source` for source lint``, and replace ``all 34 baseline projects plus `shared-failures` `` with ``all 35 baseline projects plus `shared-failures` ``.

**9h.** In the opening `**Spec:**` paragraph, replace the final sentence `Create the OpenSpec implementation packets in slice 1 before changing behavior.` with:

```markdown
Create each OpenSpec change before its first implementation: reporting in slice 2, composition in slice 4, and completion in slice 7. Slice 1 installs dependencies and corrects this document and opens none.
```

### Step 10 — Re-run the focused checks after the document edits

```sh
bun test tools/tool-devsync/src/toolchain-pins.test.ts
NX_DAEMON=false bunx nx format:check --all
```

Expected: the focused file at step 0's N plus 2 passing, 0 failing; the format check exit 0.

### Step 11 — OpenSpec validation

- [ ] Run the batch's standard block, which is the only accepted contract — a loose success check accepts three malformed reports the gate script documents. Use the launcher-warmed validator in this attempt's temporary root. If it attempts a download, stop and report. Every OpenSpec invocation carries `OPENSPEC_TELEMETRY=0`.

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
rm -f -- "$report"
```

Expected: one JSON report is printed and the block exits 0. This packet creates and deletes no OpenSpec change, so the item count must equal whatever it was at step 0's revision; record the number rather than expecting a fixed one. If the validator is not runnable from the warmed temporary root, report the block, not a pass.

### Step 12 — Hand over, do not commit

This executor's Git directory is read-only, so there is nothing to stage and nothing to commit.

- [ ] Confirm `$TMPDIR` holds no unrestored mutation: `cmp "$TMPDIR/package.json" package.json` and `cmp "$TMPDIR/bun.lock" bun.lock` must both be silent, and `git diff -- bun.lock package.json` must show only step 3's install. A clone with an unrestored mutation is never handed over.
- [ ] `git status --short` → expect exactly the four paths of section 5 as modified, plus whatever other lanes already had in the tree, which stays untouched. Record the list.
- [ ] Report, under "Ready to commit": the four paths, and the subject `chore: pin the owner-maintained libraries and refresh the adoption plan`, with a body carrying step 0's baseline count, step 4's count, and every negative proof of section 8 with the exact failure line seen.
- [ ] Point the planner at `$TMPDIR/evidence`, listing its files. Do not delete it.
- [ ] Do not run `git add`, `git commit`, `git checkout -b`, `git stash` or `git restore --staged`. They fail here, and the planner commits after reviewing the diff.

### Step 13 — Completion gate, not run here

- [ ] Do **not** run `bin/h2puni-gate.sh`. The host gate cannot run on this machine.
- [ ] Say in the task report that the host gate was not run, and why. An unavailable required check is reported, never treated as passed.

### Step 14 — Planner only, after staging

These are listed here so the executor can name them as pending, and so nobody runs them in the wrong place. **Not executor steps.**

- [ ] `NX_DAEMON=false bunx nx run tool-devsync:test --skip-nx-cache` → expect exit 0 with the whole target green, twenty test files. The target's total is not the focused file's total; compare it against the same target's number at the base revision.
- [ ] Warm-cache proof, manifest: run `NX_DAEMON=false bunx nx run tool-devsync:test` twice and confirm the second reports the cache. Change `"di-bag": "0.4.0"` to `"^0.4.0"`, run again, and expect a fresh run that fails `are pinned to exact versions in the root manifest`. Restore from a saved copy and rerun green.
- [ ] Warm-cache proof, lockfile: with the cache warm again, apply the step 7c version edit to `bun.lock` alone and expect a fresh run that fails `resolve to one copy of the report library, at the pinned version`. Restore from a saved copy and rerun green.
- [ ] Only after watching both may a sentence about cache invalidation be added to the `Proof:` comment, with the date and the observed lines. If either mutation is answered from cache, **stop**: `nx.json` already lists both files in `sharedGlobals` and `tool-devsync`'s `test` inputs already begin with `default`, so a cached false green is a finding for the catalogue, and `tools/tool-devsync/project.json` belongs to packet 020.8.
- [ ] `bin/h2puni-gate.sh <sha>` on the shared build host, with the committed hash, not checked out first and with no cleaning of a dirty gate tree. Record the printed `h2puni gate: running on <sha>` line and the exit status; exit 65 means named files must be moved or committed first.

## 8. Negative proofs

Entries rather than a table: two of the expected diagnostics contain `|`, and a Markdown table would split them across cells.

**Restore discipline, every entry.** Copy the passing file under `$TMPDIR` before mutating, write the mutation as a patch under `$TMPDIR/evidence/`, save the failing output beside it, restore by copying the saved bytes back, prove it with `cmp`, then rerun the named check green. Never restore from Git. Never mask a failing check with `|| true`, not even on `diff`: use the `save_patch` and `run_red` helpers from step 7, which require the exit status a real fault produces.

**Proof 1 — the exact pin.** Fault: `"di-bag": "^0.4.0"` in the root manifest. Must fail `are pinned to exact versions in the root manifest` on the expected map. Step 7a.

**Proof 2 — one lock key for the report library.** Fault: install `application-exception` 0.4.0, which needs the report library at `^10`. Must fail `resolve to one copy of the report library, at the pinned version` on `Received: ["caught-object-report-json@11.0.1", "application-exception/caught-object-report-json@10.0.0"]`. Step 7b.

**Proof 3 — the resolved versions.** Fault: the same downgrade. Must make probe A exit 1 on `application-exception resolved 0.4.0, expected 0.5.0`. Step 7b.

**Proof 4 — one resolved copy.** Fault: the same downgrade, with probe B run separately so that it is reached. Must make probe B exit 1 on `two copies of the report library: …/node_modules/caught-object-report-json/index.js and …/node_modules/application-exception/node_modules/caught-object-report-json/index.js`. Step 7b.

**Proof 5 — the pinned version, not just the key.** Fault: change `11.0.1` to `11.0.0` inside the single lock entry, with no install. Must fail `resolve to one copy of the report library, at the pinned version` on `Received: ["caught-object-report-json@11.0.0"]`. Step 7c.

**Proofs 6 and 7 — the cache sees each of the two root files.** Planner only, step 14, for the two reasons in section 3. The executor writes no cache claim into the `Proof:` comment and reports both as pending planner verification.

Proofs 1 to 5 were rehearsed by the planner on 2026-09-19 against a throwaway install of the same three versions in a temporary directory, and each produced the message quoted above. That is orientation, not a substitute: the executor must watch each one fail in this clone and record what it actually saw.

## 9. OpenSpec

No change is created by this task. Adding unused dependencies and correcting a planning document changes no observable behaviour, contract, migration, deploy safety or architecture.

Step 9f and step 9h together remove the contradiction the adoption plan carried. Its opening `**Spec:**` sentence used to require the three changes in slice 1, while slice 1 changes nothing observable and slice 2 creates an Nx project, an alias and an exported contract with no change open. After this rewrite each change is opened at the start of the slice that first implements under it: `adopt-failure-reporting` at the start of slice 2, `adopt-di-composition` at the start of slice 4, `complete-package-adoption` at the start of slice 7.

Step 11 still runs the strict validation block, because this task commits to a repository that must stay valid, and records the item count rather than expecting a fixed one.

## 10. Verification

**Executor runs, in this order.** Every expectation is scoped to the command that produces it.

| Command                                                                                 | Expected                                                                      |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `bun test tools/tool-devsync/src/toolchain-pins.test.ts`                                | Exit 0, step 0's recorded N plus 2 passing, 0 failing. One file of twenty.    |
| `NX_DAEMON=false bunx nx run tool-devsync:typecheck`                                    | Exit 0, no diagnostic.                                                        |
| `NX_DAEMON=false bunx nx run tool-devsync:lint`                                         | Exit 0, no diagnostic.                                                        |
| Probe A of step 6                                                                       | Exit 0, three pinned versions, `imports function function function function`. |
| Probe B of step 6                                                                       | Exit 0, two identical paths, `one copy`.                                      |
| `NX_DAEMON=false bunx nx run-many -t typecheck --projects=wbs-core,wbs-be-01,wbs-fe-01` | Exit 0.                                                                       |
| `NX_DAEMON=false bunx nx run wbs-fe-01:build`                                           | Exit 0.                                                                       |
| `NX_DAEMON=false bunx nx run twilight-burokrat:typecheck`                               | Exit 0.                                                                       |
| `NX_DAEMON=false bunx nx run twilight-burokrat:build`                                   | Exit 0. The packaging check that reads the root manifest.                     |
| `NX_DAEMON=false bunx nx format:check --all`                                            | Exit 0.                                                                       |
| The OpenSpec block of step 11                                                           | One JSON report, block exits 0, item count unchanged from step 0.             |

**Pending planner verification.** The executor lists each of these in its report, never as passed:

- The whole `tool-devsync:test` target. Its index checker writes Git objects into the clone.
- Both warm-cache proofs, which need a passing run of that target to exist at all.
- `bin/h2puni-gate.sh <sha>`, which needs the shared build host.

**What none of this proves.** The three libraries are not imported by production code in this task, so these commands prove the pins, the single resolved copy, and that the checked projects still compile, lint and package. They do not prove that any project still behaves correctly at runtime beyond what its own suite covers, and they do not prove browser execution of the libraries; that is work item 040.1, which depends on this task.

## 11. Stop conditions

- `TMPDIR` is unset, or `$TMPDIR/bun-cache` cannot be created. Do not fall back to the home directory or to a fixed path under the system temporary directory.
- Step 0's registry output differs from section 3 in any line, or `registry.npmjs.org` is unreachable.
- Any host other than `registry.npmjs.org` turns out to be needed.
- Bun reports a peer or resolution conflict for any of the three.
- The lockfile diff does anything but add the three packages and move `nanoid` within 3.x. A major-version move of any other package is a stop, not a note. The explicitly listed temporary mutations in steps 7b and 7c are exempt only within their proof windows.
- A second copy of `caught-object-report-json` appears in the lockfile, or probe B reports two paths — except inside step 7b's proof window, where both are the injected fault.
- A negative proof does not fail, or fails on something other than the assertion named for it.
- A restore leaves `cmp` reporting a difference, or `bun install --frozen-lockfile` wants to rewrite either file.
- Any executor verification command in section 10 fails. Read the failure; do not assume it implies an unrelated dependency moved, and do not continue to the hand-over.
- Any step appears to need `git add`, `git commit`, a branch, a stash, a restore from Git, the whole `tool-devsync:test` target, or the host gate.
- Any image build context or Dockerfile needs a change to install the new dependencies.

## 12. Out of lane

- `tools/tool-devsync/project.json` belongs to packet 020.8. `nx.json` already lists `{workspaceRoot}/package.json` and `{workspaceRoot}/bun.lock` in `sharedGlobals`, `namedInputs.default` includes `sharedGlobals`, and `tool-devsync`'s `test` inputs start with `default` and also list `{workspaceRoot}/**/*`; nothing needs adding. If the planner's step 14 cache proof nevertheless fails, that is a finding, not permission to edit the file.
- `tools/tool-devsync/src/repo-namespacing-handoff.test.ts` and every other test file under `tools/tool-devsync/src` are read-only here. Do not edit, skip or work around the index checker.
- `apps/wiki/cli/package.json` belongs to packet 010.5.
- New files under `tools/tool-devsync/src` named for service kinds belong to packet 020.8.
- No file under `apps/wbs` or `libs/wbs` is touched.
- Slices 3 to 8 of the adoption plan are not rewritten here beyond the two stale strings in step 9g.

## 13. Review disposition

Every finding of both Codex reviews, and every grill point naming this packet, was verified against the repository or the released libraries. All were fixed. Three carry evidence worth recording.

- **Second review, new critical 2 — "no executable owner" for the cache proof.** Confirmed, and with a second reason the review did not give. Besides the index checker's `git write-tree` and `git add --update`, Nx 23.2.0 caches a task result only when `code === 0`: `shouldCacheTaskResult` at `node_modules/nx/dist/src/tasks-runner/task-orchestrator.js:1281` is `task.cache && (process.env.NX_CACHE_FAILURES == 'true' ? true : code === 0)`, and line 347's comment says a cached result is replayed under the same condition. A target that cannot pass in this clone can never be warm in it. The proofs moved to step 14, planner only; the executor keeps the assertion-level lockfile negative as step 7c.
- **Second review, new critical 1 — the unreachable duplicate message.** Confirmed by running it: with `application-exception` downgraded to 0.4.0 in a throwaway install, the combined probe threw `application-exception resolved 0.4.0, expected 0.5.0` at the version loop and never reached the path comparison. Split into probes A and B, both were observed failing with their own messages, and the lock showed exactly `"caught-object-report-json": ["caught-object-report-json@11.0.1"` and `"application-exception/caught-object-report-json": ["caught-object-report-json@10.0.0"`.
- **First review, minor 2 — the versions the reviewer could not check.** Both reviews lacked registry access. The metadata was read on 2026-09-19 and is now step 0, with its four expected lines and a stop on any difference. The finding's remedy is adopted; its framing of the versions as unverified is superseded by that output.

### Third review, 2026-09-20 (Codex gpt-6-astra, high effort): DISPATCH AFTER FIXES

Applied by the planner by hand. The two named-test filters now anchor the joined describe and title, because the bare anchored title matched zero tests. The proof-window exemption names the mutations it permits and leaves every other stop active. Evidence is captured with explicit status handling, never `|| true` and never through `tee`, and step 7b now saves both patches. Every OpenSpec invocation carries `OPENSPEC_TELEMETRY=0`, and the launcher installs that command into the attempt's temporary root.

One finding was answered differently, by a recorded assumption. The review asked for `nx.json` to be edited temporarily to switch Nx analytics off, because `"analytics": true` there makes every Nx command contact an analytics host and no environment variable overrides it (verified: the predicate is `nxJson?.analytics === true`). Mutating a root configuration file during an attempt is a larger risk than the traffic: it changes cache inputs and could leak into the diff. So the packet's network claim is corrected instead: this attempt may contact the package registry, and Nx's analytics host exactly as every Nx command run on this machine already does. Whether analytics should stay on in `nx.json` at all is a separate question for Dany.
