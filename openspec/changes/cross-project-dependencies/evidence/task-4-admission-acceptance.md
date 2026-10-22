# Packet A: bounded command admission and graph acceptance

Observed 2026-10-22 in an isolated clone of `a31f8b5c871aaf36d1169d4f9f8b83d78cb36a2f`.
Production external authoring remains dormant. Production edits add only observed
`Proof:` comments; no capability, command behavior, graph or scheduler is changed.
No parent OpenSpec task is closed by this packet.

## Acceptance witnesses

- **Mounted public HTTP, dormant external authoring:** `mounted remote predecessor
refuses a real owner project step with equal labels` and its `third` variant
  use actual distinct UUIDs in A, B and C, equal step names/codes, B's real row,
  and A's or C's actual step ID. An earlier successful local patch rolls back;
  indexed HTTP404/not_found and the full application-table snapshot are checked.
- **Admitted external semantic SQLite:** `admitted add refuses step-identity
misdelivery before storage` and `step-project` retain genuine authorized
  project/row/tree reads, corrupt only returned steps and install an add/update
  storage-attempt tripwire. Both refuse not_found with every table unchanged.
  The two corresponding endpoint-evidence tests also check the scoped read order.
- **Mounted HTTP plus admitted semantic SQLite:** `second successor owner add
refuses before protected facts and rolls back earlier local work` and its
  `update` variant use an actual distinct B successor in an A route batch.
  HTTP404 names command index 1; a separate admitted path trips if that protected
  successor's evidence is read. Both paths first perform a real local patch and
  compare all tables on refusal. The existing mounted create/link/undo/redo
  alias regression continues to cover omitted local project IDs.
- **Resulting ownership, admitted replay:** `admitted redo refuses a misowned
resulting relationship before storage` starts with a real admitted add/undo,
  changes the stored forward relationship to a consistently qualified B-owned
  successor, and requires stale_undo with detail not_found, with unchanged tables.
  It uses the admitted replay path; it does not call a private guard directly.
- **Actual qualified lookup and writer race:** `qualified address lookup then
queued external command refuses current membership` and `revocation` resolve
  REMOTE.010 through the real candidates/reference endpoints. The same principal
  submits retained stable endpoint IDs. A signal wrapping the genuine
  WriteCoordinator.enter confirms the request joined the held writer queue;
  no turn or callback is replaced. A second connection verifies foreign_keys=1
  then removes membership or inserts native credential revocation. The queued
  request returns current HTTP403 (not_a_member/no_active_organization), preserves
  all application effects and reaches neither fan-out capture nor pushes.
  The fan-out tripwire precedes graph opening and endpoint evidence reads in the
  installed composition. The identical request reaches dormant HTTP409 before
  the race and after authority restoration.
- **Mounted local commands:** `mounted low priority prerequisite finishes before
its high priority successor starts` creates/estimates a priority-100 prerequisite,
  priority-1 successor and FS link using a local alias batch. A real mounted read
  requires nonempty slices, positive predecessor finish and successor start at
  or after that finish.
- **Admitted external graph:** the retained `admitted distinct tasks interleave
projects until a local edge closes the remote cycle` uses the real connected
  SQLite graph for A→B→A across distinct task/step nodes, accepting both external
  edges and refusing only the closing local edge with complete rollback.

## Independent watched faults

Each fault was restored before the final regression. Full outputs and SHA-256
identities are in [task-4-admission-acceptance](task-4-admission-acceptance/sha256.tsv).
The test command was `bun test <suite> --test-name-pattern '<name>' --timeout=15000`.

| Fault                                                                      | Selected test / observed failure                                                                           | Scope and limit                                                                                                                                                                                                  |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remove only step-ID equality in createEndpointEvidence                     | admitted step-identity: real graph throws `no step … in work item …`                                       | Earlier admission matters; graph still refuses, no unsafe commit demonstrated.                                                                                                                                   |
| Remove only step-project equality                                          | admitted step-project: `misdelivered step reached storage`                                                 | Both UUID and project ownership are independently required before storage.                                                                                                                                       |
| Remove only add entry successor-owner guard                                | second successor owner add: `second successor owner facts were read`                                       | typedRefusal remains; proves the earlier protected-read boundary, not unsafe committed success.                                                                                                                  |
| Remove only update entry successor-owner guard                             | second successor owner update: same protected-read tripwire                                                | Add and typedRefusal guards remain.                                                                                                                                                                              |
| Remove only typedRefusal resulting-owner guard                             | misowned resulting redo: working-plan `cannot read project …` throw                                        | Entry add/update guards remain installed and are not replay entry points. Later ownership defense still refuses.                                                                                                 |
| Move same source CommandAccess.resolve before writer admission             | qualified lookup membership/revocation: HTTP500 instead of403, `refused authority reached fan-out capture` | A temporary preResolve capability forwards the same production resolver; runner consumes its pre-writer answer. Signal proves queue admission before fault injection. No second authorizer or actor-ID stand-in. |
| Admit all nodes to the priority heap before prerequisite eligibility       | mounted low priority: HTTP500 instead of200, unplaced predecessor `finish` access                          | Rejects this scheduling algorithm fault during mounted publication, before the final inequality assertion; does not demonstrate a committed inverted schedule.                                                   |
| Independently discard cross-task predecessor bound during placement        | mounted low priority: HTTP500 instead of200, `violates FS real boundary on publication`                    | Real boundary validation remains installed and refuses. Do not claim the final inequality assertion alone detected the fault.                                                                                    |
| Refuse reciprocal project pairs in DependencyGraphGuard after real capture | admitted distinct tasks: second valid external edge returns cycle instead of ok:true                       | Exact project-level shortcut fails the valid interleaving success assertion. Actual step graph remains authoritative after restoration.                                                                          |

Only the lookup race, mounted refusal/local command and alias cases exercise
public HTTP. Successful external writes and graph interleaving here are explicitly
admitted semantic SQLite fixtures with synthetic active authority. They do not
prove public activation, enabled generated MCP parity or the complete 3.2/4.2/4.3
obligations. No host gate, deployment or production activation was performed.

## Verification development observation

A clean rerun under concurrent typechecking exposed the existing queued
`redo refuses queued credential` fixture's clock assumption: its injected clock
was initialized before setup and advanced by only 301 seconds, so slow setup
could leave it less than the policy's 300 seconds after actual JWT issuance.
The test now sets the injected clock to the retained first-party principal's
exact `issuedAt + 301_000`. The focused redo control passed after that test-only
change. No credential policy or production timing behavior was altered.
