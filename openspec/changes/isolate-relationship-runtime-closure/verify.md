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
