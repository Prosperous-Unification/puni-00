# Bounded generated MCP node command parity

2026-10-23, based on `9ceb50181`, isolated branch `packet-mcp-node-parity`.
Only the existing child backend fixture, parity tests and this evidence packet
change. Production external authoring remains dormant. The fixture uses the
existing explicit synthetic active authoring seam; it introduces no activation
or bootstrap path. Task 3.2 and the broader change remain open.

The generated tool runs over the actual SDK linked transport into the real
machine-key HTTP backend and migrated SQLite. Direct HTTP uses the same machine
credential. Each transport proves split work-item/step and encoded `sn1` remote
FS node endpoints; the successor is created as dotted alias `REMOTE.010`, made
ready and estimated earlier in the same batch. SQLite assertions inspect both
stable project/row/step identities, node scopes, FS type, minted response IDs,
local relationship absence, staged row revision 3, one new batch journal and
remote revision receipts 0→1. The journal retains the stable row ID and omits the
alias. The remote's two serial one-day steps end at 2; the new successor's
one-day node reads 2→3. Generated MCP tree reads equal the complete HTTP tree.
The MCP write retains the exact serialized command body.

Both transports atomically refuse an owner-project step on the remote node,
descendant-step scope on a remote leaf, explicit project plus workItemRef (both
remote and route-owner projects), ordinary dormant authoring and an absent patch
after the admitted relationship. Full snapshots cover every non-internal SQLite
table, including staged rows/estimates, revisions, relationship, journal, events
and sequencers; refused batches send no delivery pushes. The later patch fails
at command 4; endpoint/dormant refusals fail at command 3. Explicit project plus
alias is rejected during command normalization with HTTP 400.

## Watched negatives

The adjacent `mutations.py.txt` records exact independent injected faults and
selected tests. Each file is restored in `finally`; none of the production
mutations belongs to this commit. Individual transcripts are stored beside this
report. Temporary injection into production scope/authoring guards was explicitly
authorized by the parent; the final diff is limited to the bounded packet.

## Verification and limits

Dependencies reuse the existing workspace installation through an untracked
node_modules symlink; no fresh install is claimed. The initial restricted focused
run failed because loopback listen returned EPERM. The initial restricted
configured lint exited 1 without diagnostics and establishes no lint pass.
Subsequent verified loopback-capable commands are recorded below.

This packet does not establish delegated OAuth authority, restricted-project
permissions, SS/FF, update/remove/history matrices, full endpoint scope coverage,
production activation, deployed behavior or canonical host acceptance. Existing
whole-endpoint and lifetime controls remain in the configured MCP suite. Shared
OpenSpec tasks/verify integration and independent review remain parent-owned.

| Independently injected fault                             | Observed selected MCP failure                                               |
| -------------------------------------------------------- | --------------------------------------------------------------------------- |
| Serializer drops nested projectId                        | Split-node success expected 200, received tool refusal (status sentinel 0). |
| Endpoint binder always substitutes owner project         | Split-node success expected 200, received tool refusal.                     |
| Endpoint binder omits batch alias lookup                 | Split-node success expected 200, received tool refusal.                     |
| Semantic normalizer skips explicit-project alias refusal | Explicit route-owner alias command committed (200 instead of refusal).      |
| Endpoint evidence omits step identity comparison         | Remote wrong-step command raised unexpected HTTP 500 instead of typed 404.  |
| Semantic evidence skips descendant-step-on-leaf check    | Leaf scope command raised unexpected HTTP 500 instead of typed 409.         |
| Dormant capability changed to active                     | Ordinary dormant node command committed (200 instead of refusal).           |

Every selected mutation run reported 0 pass / 1 fail (24 filtered out). The
step/shape mutations prove loss of the typed refusal, not an unsafe commit or
post-error snapshot equality: their mutated tests stop at the unexpected 500.
The restored-source tests separately prove complete rollback. `git diff
--name-only` after all seven restorations lists only the two intended TypeScript
files; the new evidence directory is additional untracked content until staging.

MCP and backend configured typechecks passed. MCP typecheck initially rejected a
generic matcher direction against an unknown HTTP body; comparing the unknown
body against the typed tree corrected it. A loopback-capable lint retry exposed
two numeric template-expression diagnostics; explicit String conversion corrected
them. Its scoped backend fixture lint passed with exit 0 and no diagnostics.
The first loopback-capable focused run reported 24 pass / 1 fail, 181 assertions:
the HTTP route-owner alias case exceeded the existing 15-second backend readiness
deadline while other checks ran. That failed run is not a passing packet claim;
its MCP equivalent and the other 24 cases passed. The configured run reproduced that startup-only timeout: 548 pass / 1 fail, 3,134 assertions across 549 tests. This remains a failed run. The readiness budget was then increased from 15 to 25 seconds and the bounded per-test total from 30 to 45 seconds. A new one-millisecond injected readiness deadline proves actual child reaping before returning; it passed with 3 assertions. Independently bypassing outer setup cleanup made its live-child assertion fail (0 pass / 1 fail), and emergency test cleanup reaped that child. The receipt and exact mutation script are beside this report. No cleanup failure is ignored.

## Final restored verification

All seven production mutations and the fixture cleanup mutation are restored.

| Command                                                                                                         | Fresh observed result                                                                    |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `bun test apps/wbs/mcp-01/src/connected-command-parity.test.ts`                                                 | 26 pass / 0 fail, 188 assertions.                                                        |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-mcp-01:test`                                          | 550 pass / 0 fail, 3,141 assertions across 22 files; target succeeds uncached.           |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-mcp-01:lint`                                          | Final corrected target succeeds uncached.                                                |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-mcp-01:typecheck`                                     | Final forced build succeeds uncached.                                                    |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-be-01:typecheck`                                      | Backend plus module prerequisite succeeds uncached; backend fixture unchanged afterward. |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx eslint apps/wbs/be-01/src/testing/mcp-command-parity-backend.ts` | Exit 0; no diagnostics.                                                                  |
| `git diff --check`                                                                                              | Exit 0.                                                                                  |

Fresh command logs are `/tmp/mcp-node-{focused-final,suite-restored,lint-final,types-restored,be-types,be-lint}.log`.
Canonical host gate, broad backend suite/lint/build, deploy, independent review
and external CI secrets/migration scans were not run by this packet owner.

`bun node_modules/.bin/openspec validate cross-project-dependencies --json` passed one change with zero failures; existing requirement-length warnings remain.

Normal commit hooks passed scoped lint, Prettier, plaintext secrets,
private nesting, prepare-commit-msg and commit-msg. The Tool Wiki hook explicitly
reported inactive/uncertified because its external activation root is not
provisioned. Migration, website migration and doc-cap hooks skipped because no
matching paths were staged. No hook was bypassed. The initial commit receipt is
`/tmp/mcp-node-commit.log`; the evidence-only amendment uses the same normal hooks.
