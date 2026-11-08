# Bounded mounted displaced-stage acceptance proof

2026-10-23. Base `82e360559`. Isolated branch `proof/mounted-displaced-stage`.
This packet extends the real migrated SQLite `buildServices` fixture with two
mounted HTTP acceptance cases. Production changes are adjacent proof comments
only. It does not complete tasks 7.3/7.4/8.4 or enable external authoring.

## Fixture and assertions

All three projects share Monday 2026-10-05 and isolated capacity mode. A (`a2`)
is disabled Fast, one day at [0,1]. B (`a1`) is enabled optimized, five days at
[1,6]. C (`a3`) is enabled Pri, with two priority-1 slices competing for a C-local
team capacity of one: long two days [6,8], short one day [8,9]. Authored FS edges
are A→B and B→each C slice. The real installed owned reader supplies the seed C
stage without admitting work. `captureConnectedQuestion`,
`buildConnectedSolverRequest` and `encodeConnectedSuccess` create a genuine
wire-5 durable candidate: quantum 48, short offset 288, long offset 336,
makespan 432, priority 768, movement 144. The cache reader validates and selects
it, reducing weighted completion from 17 to 16 and placing C.short [6,7] and
C.long [7,9]. No synthetic connected reader supplies a selected schedule.

The expected B stage comes directly from a separate non-admitting installed read,
independent of the Work item capture helper and mounted HTTP response. Its
retained C.short placement remains [8,9]. Mounted B live GET opens exactly one
owned observation. Writer entry and both process handoffs observe zero owned
readers. Held children isolate initial B-only Pri/time admission from subsequent
completion-driven event reactions. The response retains captured B start 1 and
idle objective states. Both launched stages match canonical retained bytes and
input hashes; complete requests, including question identity and scope, equal
independently prepared requests. Explicit fixed rows retain A [0,1], C.long
[6,8], C.short [8,9]. Named `b-to-c-short` outgoing FS maximumStartUnits is 144;
reconstructing final placement would yield 48. Incoming A FS minimumStartUnits
and B movement reference are both 48.

A fresh fixture seeds B's failed Pri answer and matching generation. Mounted
Retry with the final-composite hash returns 409 `stale-input-hash`, launches
nothing and preserves the generation/queue/slot/cache/event ledger. Retry with
the retained B hash returns 202 `retrying` and launches exactly one B Pri child
with the retained canonical stage, input hash and full independently prepared
request. Its writer and process handoff also see zero owned readers.

## Watched production faults

[proofs.mjs.txt](proofs.mjs.txt) documents both temporary mutations; each restores
source in `finally`. The watched receipts precede subsequent extra assertions.

- Shared `captureConnectedOptimization` helper reconstructs start/finish maps
  from final composite: [receipt](helper-final-placement.log.txt), exit 1,
  **0 pass / 2 fail**. Live fails canonical stage-byte equality. Retry still
  returns 409 but with `not-retryable` / `idle`, failing the expected
  `stale-input-hash` code. That run stops before the later no-mutation and
  accepted-retained-hash assertions; those are proven by the restored run.
- Only `treeWithin`'s post-close admission callback reconstructs final maps:
  [receipt](live-callback-final-placement.log.txt), exit 1,
  **1 pass / 1 fail**. Live fails canonical stage-byte equality; Retry passes.

The previous [SURVIVED receipt](../connected-live-admission/final-placement-unproven.log.txt)
is unchanged. Its cold fixture had identical retained and final maps. The newly
selected C candidate creates the missing distinction and kills both faults;
this does not rewrite the historical receipt as a success.

Setup iterations first exposed a missing organization satellite for the test
team, then corrected the asserted selection shape and seeded the matching Retry
generation. These fixture failures are not production fault proofs.

## Verification and limits

Final restored commands and normal hook observations are recorded below.
The fixture uses a controlled process adapter returning boundary-infeasible wire
answers. No installed Python/image worker, full stage/capacity matrix, production
activation, public authoring, deployment, full repository gate or canonical host
gate is claimed. Parent checkboxes remain open. No push or merge is performed.

Restored verification:

- Six-file regression command covering `services-connected.db.test.ts`, saved-plan
  service/controller, connected Retry controller, Work item module and connected
  optimization view: **101 pass / 0 fail / 840 assertions**;
  [receipt](restored-tests.log.txt).
- `bunx tsc --build --force apps/wbs/be-01/tsconfig.json`: exit 0, no diagnostics;
  [receipt](restored-typecheck.log.txt).
- Changed-file ESLint after `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx graph
--file=/tmp/displaced-graph.json`: exit 0, no diagnostics or boundary skips;
  [receipt](restored-lint.log.txt). The first lint run rejected an unnecessary
  optional chain on the asserted launch; it was removed before the final run.
- Changed-file Prettier: exit 0; [receipt](restored-format.log.txt).
- `bunx openspec validate cross-project-dependencies --json`: exit 0, existing
  long-requirement warnings; [receipt](restored-openspec.log.txt).
- `git diff --check`: exit 0.

Normal commit hooks passed without bypass: changed-file lint and format,
plaintext secrets, private nesting and both attribution stages. The tool-wiki
hook explicitly reported inactive/not-certified because no external activation
root is provisioned. Migration and doc-cap checks skipped because their staged
file patterns did not match. The [normalized commit receipt](normal-hooks.log.txt)
records the initial packet commit before adding this receipt; the evidence-only
amend also runs normal hooks.
