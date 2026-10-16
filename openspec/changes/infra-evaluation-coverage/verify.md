# Verification Report

**Change**: `infra-evaluation-coverage`

**Verified at**: 2026-10-16

**Verifier**: WBS120 implementation worker, PM source review

## 1. Structural Validation

`bunx @fission-ai/openspec@1.12.0 validate --all --json` exited 0.
Actual summary:

```json
{
  "totals": { "items": 231, "passed": 231, "failed": 0 },
  "byType": {
    "change": { "items": 213, "passed": 213, "failed": 0 },
    "spec": { "items": 18, "passed": 18, "failed": 0 }
  }
}
```

All 231 items were valid. Revalidation after this report was added also exited 0
with 231 passed and 0 failed.

## 2. Task Completion

Implementation slices 1.1–3.2 and evidence slice 4.1 are complete;
PM review of the final diff, commit, push and draft PR remain outstanding. The
change is not ready for archive, and WBS120 remains `blocked_by_proxy`.

## 3. Delta Spec Sync

| Capability          | Status  | Note                                                           |
| ------------------- | ------- | -------------------------------------------------------------- |
| evaluation-coverage | Pending | New delta remains in this active change; no archive requested. |

The four requirements map to the strict review and identity joins, exact selector
expansion and Cartesian matrix, bounded engine footprints with separate
applicability/evaluation/attribution, and the separate noncertifying CLI report.

## 4. Failure Proofs

[Mutation receipts](evidence/mutation-proofs.json) retain each killed mutation,
test filter, observed failing test names and SHA-256 of the raw assertion receipt.
Raw disposable receipts and the serial mutation runner remain under
`/tmp/wbs120-proof-*` and `/tmp/wbs120-*-mutation-proofs.py` on the worker host.
Every mutation was restored before subsequent validation. A killed mutation
requires both a nonzero Bun test exit and an observed `(fail)` assertion.

| Check                        | Fault injected                                                                          | Production-path observation                                                                                                                                                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact identity joins         | Disable the shared comparator                                                           | All seven candidate revision/tree/digest, policy, adopted-set, registry and runtime mismatch tests fail.                                                                                                    |
| Complete inventory           | Disable tuple equality                                                                  | Omitted YAML/executable and changed mode/object negatives emit a report and fail.                                                                                                                           |
| Nonempty subjects            | Remove named guard                                                                      | Empty selection loses its boundary diagnostic; test fails.                                                                                                                                                  |
| Unique subjects              | Remove uniqueness guard                                                                 | Repeated-subject test fails on later scope comparison.                                                                                                                                                      |
| Subject membership           | Remove exact tuple membership                                                           | Fresh absent-subject and unique-path changed-object tests both lose the exact-membership diagnostic and fail. The changed tuple now retains its unique path; the refreshed receipt names both failed tests. |
| Selector resolution          | Permit unmatched prefix                                                                 | Unresolved-scope negative emits a report and fails.                                                                                                                                                         |
| Exact selector expansion     | Disable expanded-subject equality                                                       | YAML and executable selected-subject omissions fail with inventory retained complete.                                                                                                                       |
| Unique exclusions            | Permit duplicate map key                                                                | Duplicate-exclusion negative emits a report and fails.                                                                                                                                                      |
| Exact exclusion tuple        | Remove tuple membership                                                                 | Changed executable mode is accepted; changed-tuple test fails.                                                                                                                                              |
| Registry exclusion support   | Remove supported-code boundary                                                          | Unsupported rule/code tests lose their registry diagnostic and fail.                                                                                                                                        |
| Exclusion predicate          | Disable predicate guard                                                                 | Review can exclude measured TS input; false-predicate test fails.                                                                                                                                           |
| Strict review schema         | Bypass schema decoding                                                                  | Reviewer-supplied evaluation claim is accepted; its negative fails.                                                                                                                                         |
| Explicit adopted set         | Remove presence guard                                                                   | Missing adopted-set test loses its boundary and fails.                                                                                                                                                      |
| Supported footprint          | Remove supported condition                                                              | Matrix falsely evaluates an unadapted rule; matrix test fails.                                                                                                                                              |
| Actual engine judgment       | Ignore whole-rule unevaluated outcome                                                   | Deliberately unclassifiable YAML becomes evaluated; whole-rule-failure test fails.                                                                                                                          |
| Actual index ownership       | Attach every index                                                                      | Nested-index assertion fails: src/entry.ts incorrectly gains root ownership.                                                                                                                                |
| Finding attribution          | Replace unavailable with exact-path empty list                                          | Structural/unsupported attribution assertions fail.                                                                                                                                                         |
| Noncertification             | Set certifies true                                                                      | Complete matrix test fails.                                                                                                                                                                                 |
| No admission                 | Set allowed true                                                                        | Complete matrix test fails.                                                                                                                                                                                 |
| Exact commit object identity | Remove input-to-resolved-commit comparison                                              | A real annotated-tag object SHA with the correct reviewed target emits a report; its production negative fails.                                                                                             |
| Full committed SHA           | Remove full-SHA guard                                                                   | Abbreviated selection emits a report; CLI negative fails.                                                                                                                                                   |
| Unresolved exit              | Remove exit-code assignment                                                             | Complete matrix returns 0; production CLI assertion fails.                                                                                                                                                  |
| Actual runtime bytes         | Replace artifact hashes with zeros                                                      | Imported dependency edit keeps its digest; runtime identity assertion fails.                                                                                                                                |
| Existing F7 authority        | Remove existing size-ceilings input disjunct                                            | New production coverage missing-F7-ceilings test loses its named refusal and fails.                                                                                                                         |
| External authority reads     | Remove each file, chmod 000, supply malformed JSON and place authority inside candidate | Both policy and review independently refuse before stdout; missing and EACCES are distinct fresh tests.                                                                                                     |
| Complete registry policy     | Remove INV-CLASSIFY mode                                                                | New production command reaches existing missing-mode refusal before stdout.                                                                                                                                 |
| Packaged registration        | Omit command registration before implementation                                         | Actual built executable reports unknown command; dispatch assertion fails. After registration it reaches installed package-manifest authority.                                                              |

All 24 deliberate code mutations were killed. Additional broken-artifact and
registration probes above exercise their real production boundaries. Adjacent
`Proof:` comments identify the injected fault and observed test.

## 5. Scoped Validation and Gate Output

Commands were run serially. Actual focused output:

```text
bun test .../evidence/evaluation-coverage.test.ts
42 pass
0 fail
181 expect() calls
Ran 42 tests across 1 file. [10.20s]

bun test .../evidence/coverage-runtime.test.ts
3 pass
0 fail
11 expect() calls
Ran 3 tests across 1 file. [2.99s]

bun test .../rules/rules.test.ts -t 'rule policy boundary|F7 the size ratchet|prints the registry record'
21 pass
43 filtered out
0 fail
178 expect() calls
Ran 21 tests across 1 file. [4.09s]
```

A separate regression assertion exposed an extra parent index in
the nested direct-entry-count attribution. The assertion was observed failing
with `[README.md, src/README.md]` and passes after restricting that row to its
actual declaration. Fresh focused output:

```text
bun test .../evidence/evaluation-coverage.test.ts -t 'complete inventory and matrix'
1 pass
40 filtered out
0 fail
40 expect() calls
Ran 1 test across 1 file. [1.60s]
```

The coverage suite builds and executes the actual validator bundle. Its report
identifies that bundle's bytes, differs from source runtime identity, retains
unsupported YAML relationships and returns complete JSON with exit 1. The
runtime suite builds the actual launcher and proves registration reaches the
installed manifest boundary; it does not construct a complete installed toolkit.

`bunx tsc --build --force apps/twilight-structure/twilight-burokrat/cli/tsconfig.json`
exited 0 with no diagnostics after the final F7 narrowing change.

Final scoped ESLint over all 11 changed TypeScript files exited 0 with no
diagnostics and no skipped module-boundary warning. Changed-file Prettier
exited 0 with this actual output:

```text
Checking formatting...
All matched files use Prettier code style!
```

`git diff --check` exited 0.
The first ESLint pass exposed seven issues and skipped Nx module boundaries
without a cached graph. Those issues were corrected. A metadata-only
`NX_DAEMON=false bunx nx show project twilight-burokrat --json` generated the
cache; socket isolation was denied and Nx ran its plugins in the main process.
No Nx gate was run. Final scoped lint uses that cache.

`bun install --frozen-lockfile` was attempted in the worker and failed with
`EROFS accessing temporary directory`. This is not evidence of a passing install.
The worker instead uses an ignored symlink to the existing dependency tree at
`.worktrees/shared-restore-activation-sol/node_modules`; both lockfiles freshly
matched SHA-256 `15651c976776d7c1ab3a87935b53dae67e73939c6f7d06dec12ed10598cfe80c`.

The following checks were not run under the task's laptop memory constraint:
`bunx nx format:check --all`, full `bunx nx run-many -t test lint typecheck build`,
full Burokrat/tool-wiki lint, browser suites, complete package/toolkit build,
native infrastructure gates and `bin/h2puni-gate.sh <sha>`. Hosted CI and the
canonical host gate remain unverified. Observed MemAvailable stayed between
about 17 and 21 GB during the focused work; no host operation was attempted.

## 6. Implementation Signal

Base: `58334f1d3548e8ded83fc72eb224731ee06a63a8`. Branch:
`feat/wbs120-evaluation-coverage`; isolated worktree:
`/home/df/wd/puni/puni-00/.worktrees/wbs120-evaluation-coverage`.

`TOOL_WIKI_ACTIVATION_ROOT` was checked without printing its value: it is not
configured and does not exist; `TOOL_WIKI_REQUIRE_CERTIFIED` is not required.
The actual pre-commit launcher command
`bash bin/tool-wiki-lint.sh staged . HEAD` freshly exited 0 with:

```json
{
  "schemaVersion": 1,
  "status": "inactive",
  "certified": false,
  "reason": "external activation root is not provisioned"
}
```

This is an inactive launcher probe, not a Burokrat scan; normal hooks can run
without a bypass in this environment. No push has occurred. PM approved the implementation/evidence commit; see the
wave9 integration record below. PM reviewed the cohesive implementation and
found no new P0–P2 issues after the scope/attribution/exit refinements; final
evidence review remains pending. The local full gate is unverified, so this
report is scoped implementation evidence and does not authorize archive,
admission, activation, native certification, deployment, live health or WBS120
closure.

## 7. Wave9 Integration

Implementation/evidence commit: `fa9c0bfd5dd0722d52694b522c5587fa22dd5af0`,
created through normal pre-commit and trailer hooks. Tool-wiki returned inactive;
format, lint, plaintext-secrets and private-nesting passed. A two-line Markdown
hard-break whitespace issue caught after staging was removed and the unpublished
commit amended through normal hooks; the corrected staged diff check passed.

Fetched `origin/integration/wbs-wave9-20261016` and verified its exact identity
`8ab865f3f36052f4caac846aee7e5206f681d056` before merging that commit. The only
content conflict was the unknown-command help list in `cli.ts`. The resolution
retains both `inspect-evaluation-coverage` and `inspect-browser-t2`; both route
bodies and the launcher registrations/help merged automatically. A built-help
assertion now checks both commands. The glossary merged automatically.

Both lockfiles still match SHA-256
`15651c976776d7c1ab3a87935b53dae67e73939c6f7d06dec12ed10598cfe80c`, so the existing
ignored dependency symlink remains the exact-lock setup.

Fresh affected tests ran serially against the integrated working tree:

```text
evaluation-coverage.test.ts: 42 pass, 0 fail, 181 expect() calls [11.82s]
coverage-runtime.test.ts: 3 pass, 0 fail, 12 expect() calls [3.54s]
browser-t2.test.ts -t 'retains the complete citation partition|refuses .* CLI input':
5 pass, 78 filtered out, 0 fail, 40 expect() calls [3.96s]
gate-entrypoints.test.ts -t 'CI gives the complete uncached gate its chosen finite allowance':
1 pass, 57 filtered out, 0 fail, 2 expect() calls [1087.00ms]
```

The timeout assertion proves the inherited CI repair expects the actual
90-minute workspace allowance. No Browser process, full Burokrat scan or full Nx
gate was run. The focused Browser T2 tests inspect diagnostic receipts only.

Integrated CLI typecheck, ESLint over the 11 TypeScript paths changed from
wave9, and Prettier over all 19 branch paths each exited 0. Typecheck and lint
emitted no diagnostics; format printed `All matched files use Prettier code
style!`. OpenSpec `--all --json` exited 0 with 235 items passed and 0 failed
(217 changes, 18 specifications). No unresolved index entries remain, and the
branch diff check relative to exact wave9 exited 0. The merge will
be committed through normal hooks; the resulting exact head and tree go to PM
before any guarded push. WBS120 remains `blocked_by_proxy` and noncertifying.

## 8. Ordinary installed-root runtime identity repair

Aggregate #546 source `a4caaeea41e53334c7deabc62ad00575b8aae649` failed hosted
Twilight job `116882377923` in run `38873282372`. The retained job artifact
`12035039562` reports `trusted node modules carry a non-regular entry: .bin/acorn`
in the coverage fixture setup and executed-dependency identity test. The source target explicitly
configures ordinary workspace `TOOL_WIKI_TRUSTED_NODE_MODULES`; the new runtime identifier had
incorrectly sent that installation to the strict sealed-archive hasher. A focused reproduction
with the same environment returned 2 pass, 1 fail and the same `.bin/acorn` refusal. This is a
deterministic source-mode integration defect, not a timing flake.

The separate installed-root hasher now walks all content: the compiler can request arbitrary
packages, so release-only dependency selection would underbind its accessible bytes. Regular
files and modeled launchers use JSON-tagged path/content records. Only root or nested
`node_modules/.bin` launcher links are modeled, and their literal target plus contained regular
target bytes are pinned. Dependency symlinks, escape, absent/cyclic targets, directory/special
targets and unreadable inputs refuse. The existing `hashTrustedModules` archive routine is
unchanged and still rejects a launcher symlink. The configured root is canonicalized for both
reporting and traversal. This remains pre-execution hashing, with no concurrent-write snapshot
or race-resistance claim.

Coverage fixtures now use tiny explicit trusted roots, saved/restored around their suites. The
bundled subprocess receives that same environment explicitly; Bun child inheritance otherwise
retains the process-start environment. This prevents each fixture invocation from scanning the
1.9 GB workspace installation and preserves identical producer/consumer runtime pins.

Watched production-path faults (all restored before passing verification):

| Injected fault                                      | Observed focused failure                                                                     |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Allow symlinks outside modeled launcher directories | file-link and unmanaged-bin cases both failed: function did not throw                        |
| Remove canonical target containment                 | escape case failed: function did not throw                                                   |
| Remove target regular-file check                    | directory case failed its named refusal with raw EISDIR instead                              |
| Replace ordinary-file hashes with zeros             | unlinked arbitrary-package file edit retained its identity and failed the identity assertion |

Missing-root, unreadable-root, unreadable-file, dangling/cyclic launcher, directory/special target,
package symlink, nested launcher and strict-archive refusal cases are included in the focused
runtime suite. The unlinked-file test prevents launcher target hashing from masking omitted
ordinary-file hashing. Positive topology checks also distinguish literal link-target changes.

A single real ordinary-root call, serial under `NODE_OPTIONS=--max-old-space-size=768`,
`bun --smol` and a 60-second external timeout, succeeded in 5.29 seconds with measured maximum RSS
1,081,668 kB. NODE_OPTIONS is a configured JS heap budget, not a hard bound on total process RSS.
Every production call rereads the complete installed root; there is no metadata cache. Packaged
closures are smaller, while source-root IO remains a documented cost. No broad local suite, full
Nx, full Burokrat scan, browser run, host gate or deployment was performed. Final focused test,
static, OpenSpec and normal-hook results are recorded below after completion. Exact aggregate CI
and canonical h2puni gate remain pending; WBS120 remains blocked and noncertifying.

Final focused repair runs used the source target environment
`TOOL_WIKI_TRUSTED_NODE_MODULES=/tmp/wbs-wave10-20261016/node_modules` and
`NODE_OPTIONS=--max-old-space-size=768`, serially:

```sh
bun test apps/twilight-structure/twilight-burokrat/cli/src/evidence/coverage-runtime.test.ts --preload ./tools/test/scratch/preload.ts --timeout=60000
bun test apps/twilight-structure/twilight-burokrat/cli/src/evidence/evaluation-coverage.test.ts --preload ./tools/test/scratch/preload.ts --timeout=60000
```

Runtime: 16 pass, 0 fail, 30 assertions, 3.90 seconds elapsed, maximum RSS 833,268 kB.
Evaluation coverage: 42 pass, 0 fail, 181 assertions, 9.87 seconds elapsed, maximum RSS 590,448 kB.
Earlier intermediate runs are superseded by these restored final-source runs. The runtime special-file
fixture initially expected the launcher-target diagnostic, but directory enumeration reached the
FIFO directly first; its oracle now requires the production walker's non-regular-entry refusal.
The directory-target case separately names and proves the launcher target check.

Scoped ESLint over the four changed TypeScript files passed, with the Nx module-boundary rule
explicitly skipped because this isolated checkout has no cached ProjectGraph. Scoped CLI
`tsc --build --force` passed without diagnostics. Changed-file Prettier passed; pinned OpenSpec
1.12.0 validated this change with one passed, zero failed and no issues. Normal commit hooks are
required on the repair commit; aggregate CI and host acceptance remain pending. Explicit staged
pre-commit jobs passed: lint, format, plaintext-secrets and private-nesting. Tool Wiki returned
inactive/uncertified because no external activation root is provisioned; no admission is claimed.
