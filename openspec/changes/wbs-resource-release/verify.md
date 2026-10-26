# Resource release design verification

## Status

Historical design-stage record, 2026-10-25. At that stage, no runtime, migration or automatic
deletion code had changed. The table below preserves the original broader acceptance matrix;
it is not the current implementation status. Executed local-provider proofs and review
closure now live in [tracking verification](../wbs-resource-release-tracking/verify.md) and
[automatic cleanup verification](../dash-resource-cleanup/verify.md). Unsupported transfers
and additional provider kinds remain future work.

Source basis: local `830e774d2302d852432c51ded1e1b38e85728f66`. Inspected WBS resource
occupancy, claim-lease sweep, attempts/commands/store, compute-provider reporting and
Twilight control-plane admission/settlement contracts. Existing staged website documents
are unrelated and are outside this change.

## Document checks

Observed on 2026-10-25:

- `node_modules/.bin/openspec validate wbs-resource-release --strict --json --no-interactive`:
  exit 0, one change passed, zero issues; 12 requirements and 32 scenarios.
- `node_modules/.bin/prettier --check` on both modified glossaries and the five new
  OpenSpec Markdown files: exit 0, `All matched files use Prettier code style!`.
- `git diff --check`: exit 0, no output.
- Static self-review: proposal 356 words (within the 400-word limit); every requirement
  has a scenario; local Markdown links resolve; no unresolved placeholder markers.
- Compared glossary edits to the pre-edit snapshots: only the five new definitions in
  each glossary were added. Compared the Git index digest before/after: unrelated staged
  website work is unchanged.

Design review checked the one-authority boundary, separation from logical occupancy,
per-copy attribution, partial release, preservation and shared dependencies, charged
retention and backups, transfer without a capacity gap, incarnation/fence checks,
request-versus-release reporting, restart/outage replay, tenant scope and deleted planning
references. Proposed behavior is consistently marked as design rather than deployed code.

## Required failure proofs

| Guard                             | Injected fault                             | Required independent observation                                 | Status               |
| --------------------------------- | ------------------------------------------ | ---------------------------------------------------------------- | -------------------- |
| Register before creation          | Create before durable intent               | Provider inventory contains an unowned target and the test fails | Not run; design only |
| Whole-vector host admission       | Skip atomic pool check                     | Two launches consume the last unit                               | Not run; design only |
| Cleanup pending remains charged   | Free on claim expiry                       | A replacement starts while old disk remains held                 | Not run; design only |
| Fence and seal                    | Let old writer create after seal           | A canary appears outside the sealed manifest                     | Not run; design only |
| Target identity and containment   | Skip incarnation/root check                | Replacement or outside-root canary is removed                    | Not run; design only |
| Preservation                      | Ignore unreadable archive or late edit     | Unique source cannot be restored byte-for-byte                   | Not run; design only |
| Shared dependencies               | Skip alternates/symlink guard              | Retained checkout's Git/read oracle fails                        | Not run; design only |
| Process and open-handle release   | Treat unlink/local exit as all-free        | Original held bytes or remote worker still exists                | Not run; design only |
| Transfer accounting               | Drop reservation before receiver accepts   | A competing request consumes uncharged capacity                  | Not run; design only |
| Atomic event and release          | Split commit or replay settlement          | Double release, missing history or duplicate capacity            | Not run; design only |
| Cleanup owner fencing             | Accept old generation/epoch                | Old owner changes replacement's reservation                      | Not run; design only |
| Report authority and tenant scope | Accept ordinary agent/foreign organization | Unauthorized event mutates the projection                        | Not run; design only |
| Event continuity                  | Accept a release across a sequence gap     | Green release appears without ownership history                  | Not run; design only |
| History survives plan deletion    | Cascade unresolved uses                    | Live resource disappears from recovery view                      | Not run; design only |
| Request versus verified outcome   | Render request acceptance as release       | UI falsely shows cleanup complete                                | Not run; design only |
| Retained versus reclaimed         | Render transfer as freed bytes             | UI overstates recovered disk                                     | Not run; design only |

## Scope of evidence

Static design validation alone cannot prove deletion safety, enforcement, capacity bounds,
recovery or harness integration. This record predates implementation. Use the companion
verification records above for current tests, build/type/lint gates and supported coverage;
no live enrollment or remote gate is implied by either the design or local fixture tests.
