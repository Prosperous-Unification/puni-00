# Protected resource operation matrix verification — 2026-10-26

This private correction restores the existing HTTP resource/control admission
requirement in `specs/cross-project-dependencies/spec.md`: nine resource-authority
and resource-use declarations imported from main were missing from the independent
literal protected-operation expectation. Only the test expectation and this record
change. Runtime classification, exemptions and mounted authorization are unchanged.

Base: `e1601c92e29030b87899922524aac22958228500`.
Author tree: `/home/df/.codex/worktrees/1dde/puni-00`.
Branch: `integration/contracts-matrix-resource-operations-20261026`.
The local remote-tracking main is `994dd0d49c599db5e177867a55c663db3cc852c2`;
root reported a fresh fetch confirming that SHA. Main has the resource shapes but
lacks the held dependency feature's classifier and matrix test. This is a private
feature correction and grants no main integration or architecture acceptance.

## Exact tests and observed faults

Working directory for every command: the author tree above. Root's pre-change
receipt `/tmp/puni-protected-matrix-live-red-20261026.json`, SHA-256
`267c5fc67bcc9a47d73d7e0fdf8bbeb161ceb6b5cd8b2c3e9e8a245519dd0f72`,
records exit 1, one pass and one failed matrix assertion with nine protected
additions. The author read that receipt before editing.

Corrected and restored command:

```sh
bun test ./libs/wbs/domain/contracts/src/dependency-client.test.ts --timeout 10000
```

Corrected expectation: exit 0, two pass, zero fail, six expectations. For each row
below independently, insert only that operation into the production
`dependency-claim.ts` exemption set, leaving the expectation fixed, then run:

```sh
bun test ./libs/wbs/domain/contracts/src/dependency-client.test.ts --timeout 10000 --test-name-pattern 'pins the complete protected and exempt operation matrix'
```

Every injected fault: exit 1, zero pass, one filtered, one failed matrix assertion,
one expectation; the exact operation moves from protected to exempt in the diff.
Restore the classifier's exact original bytes after each fault, then run the full
two-test command: every restoration exited 0 with two pass, zero fail and six
expectations. Adjacent `Proof:` comments were added only after these observed
cycles; another two-test run with those comments also passed. These prove the
classification consumer and do not claim mounted authorization/security coverage.

| Fault | Operation                                               | Fault exit | Restored exit |
| ----- | ------------------------------------------------------- | ---------- | ------------- |
| 01    | `getApiOrganizationResourceAuthoritiesByAuthorityId`    | 1          | 0             |
| 02    | `getApiProjectsByIdResourceUses`                        | 1          | 0             |
| 03    | `getApiProjectsByIdResourceUsesByUseIdHistory`          | 1          | 0             |
| 04    | `getApiResourceAuthoritiesByAuthorityIdCleanupRequests` | 1          | 0             |
| 05    | `postApiProjectsByIdResourceUses`                       | 1          | 0             |
| 06    | `postApiProjectsByIdResourceUsesByUseIdEvents`          | 1          | 0             |
| 07    | `putApiOrganizationResourceAuthoritiesByAuthorityId`    | 1          | 0             |
| 08    | `putApiResourceAuthoritiesByAuthorityIdAdmissions`      | 1          | 0             |
| 09    | `putApiResourceAuthoritiesByAuthorityIdEvents`          | 1          | 0             |

## Finite static checks

All check commands use a private mode-0700 TMPDIR under
`/tmp/puni-protected-matrix-author-20261026/scratch`. The complete exact argv,
working directories, exit codes, output hashes, source hashes for proof runs and
UTC timestamps are in that packet's `commands.json`; root's original RED receipt,
all fault source snapshots and individual command logs are retained there.

- Finite compiler: `bun ./node_modules/@typescript/native/bin/tsc --project /tmp/puni-protected-matrix-author-20261026/tsconfig.matrix.json --noEmit --listFiles`,
  exit 0. The temporary config extends the real contracts test config, explicitly
  selects only `dependency-client.test.ts`, retains real aliases/options and
  resolves installed Bun types. `--showConfig` and `--listFiles` both explicitly
  include the changed test. This checks that test and its transitive type graph,
  not every project test.
- Fresh graph: `bun ./node_modules/nx/dist/bin/nx.js graph --file=/tmp/puni-protected-matrix-author-20261026/graph.json`,
  exit 0. `NX_DAEMON=false`, `NX_ISOLATE_PLUGINS=false`, private
  `NX_WORKSPACE_DATA_DIRECTORY` and `NX_CACHE_DIRECTORY`; fresh graph and file map
  exist and identify the `wbs-contracts` project root correctly.
- Scoped lint: `bun ./node_modules/eslint/bin/eslint.js libs/wbs/domain/contracts/src/dependency-client.test.ts --no-cache --max-warnings 0`,
  exit 0, no output or graph-skip warning. Effective configuration independently
  confirms `@nx/enforce-module-boundaries` severity 2 using the same graph caches.
- Two-file formatting is checked with the installed Prettier CLI on exactly the
  test and this record. `git diff --check` is scoped to these paths. Final output
  receipts and file hashes are retained in the frozen private packet.

Classifier restored SHA-256: `7300edcd5f0379966d6d2f34f72f9667d40f8a5bb92806a9d9d44702bfe90cf3`.
The final Git diff for `dependency-claim.ts` is empty. The explicit expected lists
remain independent; no expected operation is derived from the implementation.

## Limits

No full contracts suite, full Nx gate, CI, build, database, mounted route test,
provider/host/network/listener action, install, security certification, activation,
or architecture/main acceptance was performed or claimed. Root owns commit and
integration. This record and the finite packet establish only the described scope.
