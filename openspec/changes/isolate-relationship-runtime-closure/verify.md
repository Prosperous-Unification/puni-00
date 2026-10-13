# Verification

Change: `isolate-relationship-runtime-closure`. Base: `d8ab25825b21f374c75bd972ecb687aaa0fcb9d9` (PR #387). Verification performed 2026-10-13 in `/tmp/puni-relationship-fix`.

## Focused checks

- `BUN_TMPDIR=/tmp bun install --frozen-lockfile`: exit 0, `Checked 1573 installs across 1447 packages (no changes)`.
- `TOOL_WIKI_TRUSTED_NODE_MODULES=/tmp/puni-relationship-fix/node_modules bun test ./apps/twilight-structure/twilight-burokrat/cli/src/relationships/relationships.test.ts ./apps/twilight-structure/twilight-burokrat/cli/src/relationships/selectors.test.ts ./apps/twilight-structure/twilight-burokrat/cli/src/relationships/committed-target-facts.test.ts --timeout=60000`: `63 pass, 0 fail, 1091 expect() calls`, 111.53 seconds. The two subsequently added snapshot-cleanup/configured-outside-declaration tests separately passed: `2 pass, 0 fail, 16 expect() calls`. Final rerun including every fixture: `64 pass, 0 fail, 1098 expect() calls`, 105.02 seconds.
- `NX_DAEMON=false bunx nx run twilight-burokrat:lint:source --skip-nx-cache`: exit 0, `Successfully ran target lint:source for project twilight-burokrat`, 20.9 seconds. Nx socket isolation was unavailable; Nx visibly ran plugins in the main process. The project graph was generated; module-boundary lint ran.
- `NX_DAEMON=false bunx nx run twilight-burokrat:typecheck --skip-nx-cache`: exit 0, `Successfully ran target typecheck for project twilight-burokrat`, 1.0 second.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json`: exit 0; 186 items passed, 0 failed (168 changes, 18 specs). This change has `valid: true`, no issues.
- `bunx prettier --check` over all changed TypeScript, runbook and change Markdown: exit 0, `All matched files use Prettier code style!`; `git diff --check`: exit 0.
- Repeated scoped Nx source lint after final code/comment changes: exit 0, 17.1 seconds.

The first broader test invocation omitted the required trusted-modules environment for selectors and accidentally collected generated dist tests. It failed with unconfigured trusted modules and unresolved generated aliases. The explicit source-file invocation above replaced it. The initial typecheck used the shared installation and failed for missing `@noble/hashes` exports; the frozen isolated install corrected that installation state.

## Failure proofs

All fixtures invoke the production `extract-relationships` CLI. Mutations were temporary and restored before final checks.

| Boundary                    | Injected fault                                                                                    | Observed production oracle                                                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Physical topology           | Restore original materializer/compiler direct symlink                                             | A-to-B augmentation expected exit 0, received 1: `Property 'value' does not exist on type 'Shape'` and absent augmentation. Missing trusted B with compatible ancestor expected exit 1, received 0. |
| Missing closure dependency  | Delete trusted B, both with and without an ancestor decoy                                         | Corrected production CLI exits 1 in both cases. Original direct-link mutation incorrectly exits 0 with compatible decoy.                                                                            |
| Trusted symlink containment | Remove copier containment; B symlink reaches compatible ancestor bytes                            | Escaping-package refusal expected exit 1, received 0.                                                                                                                                               |
| Trusted unreadability       | Remove mode check; supply mode-000 declaration                                                    | Named unreadability oracle fails: native `EACCES ... copyfile` replaces `trusted runtime path unreadable`.                                                                                          |
| Trusted cycle               | Remove ancestor-cycle check; declaration links to its containing package                          | Named cycle oracle fails with `ENAMETOOLONG`.                                                                                                                                                       |
| Special file                | Ignore a FIFO instead of refusing it                                                              | Named special-file oracle fails with unresolved vendor B.                                                                                                                                           |
| Outside filesystem probes   | Allow arbitrary outside probes                                                                    | Absolute-import oracle loses its early unresolved-input refusal and observes `compiler realpath outside trusted closure`.                                                                           |
| Loaded declarations         | Bypass filesystem admission and canonical containment; then remove post-program source validation | With validation active, outside config-listed declaration refuses. Removing validation changes CLI exit 1 to 0 and fails the negative test.                                                         |
| Config filesystem facade    | Substitute raw ts.sys for config parsing                                                          | Scoped config success oracle fails: `File '@fixture/config' not found`.                                                                                                                             |
| Compiler/copy cleanup       | Omit outer workspace cleanup; inject broken package symlink                                       | Scratch directory contains `tool-wiki-candidate-*`; empty-directory assertion fails.                                                                                                                |
| Snapshot cleanup            | Omit materializer catch cleanup; inject escaping candidate symlink                                | Snapshot-cleanup test finds retained candidate directory and fails.                                                                                                                                 |

The scoped-config and nested-dependency fixture passes with the guards restored. Candidate-supplied modules and effective intermediate candidate symlink escapes remain refused. Standard libraries are read only at the bundled compiler's actual library directory, with exact lib declaration filenames and compiler default-library classification on loaded sources.

## Exact survey diagnostic

Extracted the existing policy unchanged from commit `350925b697aa113e012c47ac8509aedb34abcc55`, path `openspec/changes/wbs-burokrat-evaluation/evidence/candidate-a478c109/diagnostic-policy.json.txt`.

`sha256sum /tmp/relationship-diagnostic-policy.json`:

```text
ffc33d5b91dcfae0e622294936f732c366c501d202fc53d15c6a744d266f2690
```

Command:

```sh
TOOL_WIKI_TRUSTED_NODE_MODULES=/home/df/wd/puni/puni-00/.worktrees/wbs-090-100-runtime-modules bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check committed /tmp/puni-relationship-fix d8ab25825b21f374c75bd972ecb687aaa0fcb9d9 /tmp/relationship-diagnostic-policy.json --rule REL-EXTRACT
```

Exit 1, with the former vendor compiler failure gone and independent selector debt exposed:

```json
{
  "schemaVersion": 1,
  "candidate": "128b19b70529d37c4801e66c5fce553a467b1244b4c805048820d78f2aef195e",
  "policy": "rules.puni-00.v1",
  "allowed": false,
  "ruleIds": ["REL-EXTRACT"],
  "findings": [],
  "unevaluated": [
    {
      "ruleId": "REL-EXTRACT",
      "reason": "TypeScript public entrypoint libs/shared/domain/failures/src/index.ts resolved by 6 configs; expected exactly one"
    }
  ],
  "certifies": false
}
```

Survey policy, observation modes and zero adoption are unchanged. This diagnostic certifies nothing. The independent selector ambiguity is still open.

## Cost and limits

Packages are copied completely when requested, including nested dependencies. An observed exact repository extraction materialized approximately 191 MiB of requested modules instead of the development installation's 1.6 GiB. Large individual packages still cost a full package copy. No persistent cache or shared mutable hardlinks are introduced.

Full host gate, full repository format/test/lint/typecheck/build, CI, merge, archive and deployment are intentionally not run: this task requests focused verification and a stacked draft PR. Delta specs remain pending archive sync. Draft publication remains pending review.

## Review correction: nested candidate modules

Astra's review of `e01a9f9d8a3b268781435312805f5a08d7834bdd` identified a candidate nested-module bypass. New production CLI fixtures supply `src/node_modules/hidden/index.d.ts` directly or via `src/node_modules -> dependencies`. Before correction both expected exit 1 and received 0, with `external:hidden` and empty reverse edges.

The materializer now rejects the node_modules segment at every candidate path depth, including symlink entries. Loaded sources classified as external by TypeScript must resolve canonically under the physical copied workspace/node_modules root. Generic containment for nonexternal candidate sources and the standard-library exception remain in force. The prior candidate-local Nx wrapper test now expects early module refusal while retaining its no-execution sentinel.

| Boundary                   | Injected fault                                                        | Observed production oracle                                                                                                                                            |
| -------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nested candidate paths     | Restore root-only materializer predicate                              | Direct nested-module test loses the early `relationship candidate may not supply trusted runtime modules` refusal and fails against the later external-source guard.  |
| External canonical closure | Restore root-only predicate, then remove external loaded-source guard | Alias fixture first refuses with the loaded-source guard active; removing it admits `external:hidden` and incorrectly exits 0, failing the expected-exit-1 assertion. |

Both guards restored: nested direct, symlink alias and candidate-local Nx tests passed (`3 pass, 0 fail, 24 expect() calls`). No survey policy, adoption mode or certification change. Draft publication remains pending exact-head review.

Correction checks: fresh scoped Nx source lint passed in 17.0 seconds; scoped Nx typecheck passed in 1.3 seconds; all 186 OpenSpec items validated with zero failures; changed-file Prettier and git diff checks passed. Nx again reported its plugin socket was unavailable and ran plugins in the main process. Full gate and publication remain intentionally unrun.

Final correction focused suite (the same three explicit source files and trusted-modules environment listed above): `66 pass, 0 fail, 1113 expect() calls`, 103.11 seconds, exit 0.

## Integration CI fixture reconciliation — 2026-10-13

PR #390 run `38327059752`, completed Twilight job `115068172929`, ran integration
head `a424e81402e6518e08f619c127af8e87733e41ad`: 1084 tests passed and two failed.
Both failures reproduced together locally (0 pass, 2 fail, 38 assertions) through
the production CLI. These were stale test fixtures after runtime closure isolation.
No production containment or other production source changed.

The preserved enforce-launcher fixture commits `.nx/installation/node_modules/nx`.
It now requires the named candidate-module refusal, no certificate output and its
existing wrapper nonexecution sentinel. Restoring only the old root-level module
predicate in production made the launcher return exit 0 with `accepted:true` and
`certified:true`; the corrected negative expected exit 1 and failed. The original
guard was restored in `finally`. Mutation log: `/tmp/pr390-launcher-mutation.log`.

The scoped React rule fixture formerly linked TypeScript outside its declared
trusted root. The new copier correctly refused that escape, yielding the F1
unevaluated reason `trusted TypeScript compiler identity is unreadable`. The fixture
now physically copies the complete compiler package with symlinks dereferenced,
retaining its exact scoped React import and F1 finding assertions. CLI exit-code
assertions now include the verdict so future typed unevaluated reasons are visible.

The two corrected production-path cases passed (2 pass, 0 fail, 41 assertions).
The complete policy/rules files passed 120 tests, 0 failures, 2033 assertions in
48.75 seconds. After replacing the initial physical compiler-identity-only fixture
with the complete copied package, the rules file passed again: 64 tests, 0 failures,
569 assertions in 16.37 seconds. The final preserved-launcher case additionally
checks empty stdout so a refusal cannot carry certification output. Adjacent
`Proof:` comments identify the old fixture fault and watched guard mutation.

Full host gate, full repository tests/build, browser suites and deployment remain
unrun by this worker; the coordinator owns the canonical gate. The first GitHub
run-level log command withheld logs while other jobs were running; the completed
job log was retrieved directly with the Actions jobs/logs API.

Final checks: the preserved-launcher refusal/no-certificate case passed (1 test,
33 assertions); scoped Nx source lint passed in 14.0 seconds and scoped Nx
TypeScript check passed in 0.99 seconds, both uncached. Three-file Prettier and
`git diff --check` passed. Pinned OpenSpec 1.12.0 validated all 186 items with zero
failures. Logs use `/tmp/pr390-twilight-final-{lint,types}.log`,
`/tmp/pr390-launcher-final.log` and `/tmp/pr390-twilight-fix-openspec.json`.
