# Tree announcement port verification

Verified 2026-10-16 in isolated clone `/tmp/wbs-tree-announcement-port-oct16`.
Reviewed base: `6491ea6666065d3b56cdfc655d65b1ddc6865291`.
Implementation candidate: `ac626760285d9eaa1c198fe8c9824519b773d141`.

## Scope

`ImportServices.workItems` accepts the neutral `TreeAnnouncement` port, whose only
method is `announceTreeNow(projectId: string): Promise<void>`. The existing
`batchServices` composition still passes the complete scoped work-item resource
from `servicesOver(scope.stores, ...)`, retaining the method receiver and import
collector. No wrapper or executable behavior changed. No domain term, ADR or
`design.md` is needed for this reversible interface extraction. The delta spec
remains unsynced pending release.

## Committed production K6 oracle

The exact reviewed [policy](evidence/policy.json.txt) was copied unchanged to
`/tmp/tree-announcement-k6-policy.json`; SHA-256
`5885c9123745f2ff469cf8f486abc3ba4b8bb729d4f3628eaccd501006fc9422`.
It selects the core production tsconfig and retains the prior rank public
entrypoint. No policy or rule activation was changed.

```sh
cp openspec/changes/tree-announcement-port-boundary/evidence/policy.json.txt /tmp/tree-announcement-k6-policy.json
TOOL_WIKI_TRUSTED_NODE_MODULES=/home/df/wd/puni/puni-00/node_modules \
  bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check committed \
  . <candidate-sha> /tmp/tree-announcement-k6-policy.json --rule K6 > /tmp/verdict.json
python3 openspec/changes/tree-announcement-port-boundary/evidence/check-boundary.py.txt \
  openspec/changes/tree-announcement-port-boundary/evidence/baseline.json.txt /tmp/verdict.json
```

Bun `1.4.2+744846f84`; trusted external TypeScript `6.0.2`; production CLI
source subtree `67f95403fffe6730aa1060e6132484d74d5f702b`.
`BUN_TMPDIR=/tmp bun install --frozen-lockfile` passed with
`Checked 1573 installs across 1447 packages (no changes)`; lockfile SHA-256
`15651c976776d7c1ab3a87935b53dae67e73939c6f7d06dec12ed10598cfe80c`.
The first install without BUN_TMPDIR failed on the read-only temporary directory;
the corrected frozen install supplied the dependencies before all recorded CLI runs.

| Committed candidate                                     | K6 observation                                                 | Retained boundary oracle                                 |
| ------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------- |
| Base `6491ea6666065d3b56cdfc655d65b1ddc6865291`         | Four findings, selected edge present                           | Exit 1, concrete work-item resource edge remains         |
| Port `ac626760285d9eaa1c198fe8c9824519b773d141`         | Three findings, selected edge absent                           | Exit 0, exact edge removed, unrelated findings identical |
| Direct fault `e294c710d0f7d13d9546cf65a39c70ceb640d8d3` | Four findings, selected edge restored                          | Exit 1, concrete work-item resource edge remains         |
| Barrel fault `b593552f4dc2f97c3a3700a7f763e29a0c3bfed0` | Four findings, selected edge restored through a port re-export | Exit 1, concrete work-item resource edge remains         |

All four CLI runs exited 0, selected only K6, and returned `unevaluated: []`.
Observe mode preserves `allowed: true`, debt findings and `certifies: false`.
The retained oracle asserts the four-finding baseline, absence of the selected
edge, exactly three candidate findings, and exact equality of all unrelated
findings. Raw verdicts, oracle transcripts and reconstructable fault patches live
in [evidence](evidence/). The faults are separate commit-tree objects based on
the implementation candidate, created with separate temporary indexes; the
working tree retained the neutral port throughout.

The unchanged findings are imported-plan resource → directory resource, and
space resource → project and work-item resources. This observes the selected core
graph; it does not survey the full repository or activate enforcement.

## Failure proofs

| Check                                     | Injected fault                                                                           | Observed production-path failure                                            |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Retained K6 exact-edge oracle             | Restore the original concrete WorkItemService import and Pick                            | Direct candidate reports the edge; oracle exits 1 (`direct-oracle.log.txt`) |
| Same oracle through transitive resolution | Import WorkItemService through a re-export in the neutral-looking tree-announcement port | Barrel candidate reports the edge; oracle exits 1 (`barrel-oracle.log.txt`) |

Adjacent `Proof:` on `TreeAnnouncement` names both faults and this report.
No runtime safety check changed; filesystem absence/unreadability is not a new
boundary in this extraction.

## Scoped verification

```sh
bun test libs/wbs/application/core/src/module/plan-import/module.test.ts \
  libs/wbs/adapters/store-memory/src/import.service.test.ts \
  libs/wbs/adapters/store-sqlite/src/import.service.db.test.ts \
  apps/wbs/be-01/src/controller/import-export-organization.controller.db.test.ts \
  apps/wbs/be-01/src/service/announcement-ownership.db.test.ts --timeout=10000
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t typecheck -p wbs-core,wbs-be-01 --skip-nx-cache
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint -p wbs-core,wbs-be-01 --skip-nx-cache
BUN_TMPDIR=/tmp bunx @fission-ai/openspec@1.12.0 validate --all --json
```

Existing import module, memory source contract, SQLite source contract, mounted
organization and announcement ownership suites: **111 pass, 0 fail, 515 assertions**.
They retain import authority, scoped creation, collectors, committed delivery and
rollback coverage. Expected injected endpoint-failure logs are part of passing
negative tests. Core/backend typecheck: **4 tasks successful**. Core/backend lint:
**2 tasks successful**. OpenSpec: **216 passed, 0 failed** (198 changes, 18 specs).
Raw scoped command output is retained in evidence. Normal lefthook hooks were
installed and ran on the implementation commit. Changed production TypeScript
and change Markdown formatting passed. The original `git diff --check` claim
did not cover the subsequently retained patch evidence; the committed-range
correction and replay checks are recorded below.

Full workspace format/test/lint/typecheck/build and `bin/h2puni-gate.sh <sha>`
were not run; the coordinating agent owns release acceptance. No push, merge,
deployment, archive or policy activation was performed. This report claims scoped
verification only.

## Retained patch whitespace correction

Review reproduced `git diff --check
6491ea6666065d3b56cdfc655d65b1ddc6865291..80033ad582701cf5f430f123d450a28680fc0120`
exiting 2: line 21 in each retained fault patch contained a space-only context
line. Each line is now empty, preserving Git's blank-context matching. No source,
test, fault ID, verdict or oracle changed.

Both normalized patches passed `git apply --cached --check` and were then applied
with `git apply --cached` to separate temporary indexes initialized with
`git read-tree ac626760285d9eaa1c198fe8c9824519b773d141`.
`git write-tree` matched each original fault commit's tree exactly:

| Patch  | Replayed tree                              | Original fault commit                      |
| ------ | ------------------------------------------ | ------------------------------------------ |
| Direct | `fe3c5efec97eff52b0fbacbbfe85f129d64e3885` | `e294c710d0f7d13d9546cf65a39c70ceb640d8d3` |
| Barrel | `56b4ddc93d488f5d64ed75f982be921e067c5907` | `b593552f4dc2f97c3a3700a7f763e29a0c3bfed0` |

Fresh correction checks:

```sh
git diff --check 6491ea6666065d3b56cdfc655d65b1ddc6865291
bunx prettier --check openspec/changes/tree-announcement-port-boundary/*.md
BUN_TMPDIR=/tmp bunx @fission-ai/openspec@1.12.0 validate tree-announcement-port-boundary --json
```

The whitespace check covers the complete reviewed-base-to-corrected-tree range,
including the retained patches. Whitespace and Markdown formatting passed;
scoped OpenSpec validation reported **1 passed, 0 failed**. Normal commit hooks
ran for this documentation correction. K6 and the 111-test suites were not rerun:
the replayed fault trees are identical and no executable file changed. The full
workspace and host gates remain unrun as stated above.
