# Verification plan — not observed results

This is a planning artifact, not a current completion report. The original proof matrix below
records requirements; observed implementation results and outstanding work live in `verify.md`
and `tasks.md`. Do not interpret this matrix or OpenSpec artifact presence as passing behavior.

Sequencing: this repair is the selected prerequisite route for PR #259 / WBS 010.5.2 while
the old lifecycle stamp is retained and authoritative nondeployment inventory is incomplete.
Do not use the draft or structural checks to unblock that PR. A separately evidenced safe
restamp can change the dependency only through an explicit PM update.

## Required failure proofs

| Check / slice                    | Injected fault                                                                  | Production-path test target                                                                                       | Status           |
| -------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------- |
| Exact selection / 1.1            | Replace set selection with old timestamp cutoff                                 | Actual CLI older-candidate/newer-baseline round trip; table and ledger remain, test fails                         | Planned, not run |
| Baseline preservation / 1.1      | Treat a captured older migration as newly added                                 | CLI preserves already-captured lifecycle and sentinel row                                                         | Planned, not run |
| Capture boundary / 1.2           | Remove absent/unreadable/malformed/duplicate refusal separately                 | Actual CLI receives each invalid capture; permission case runs as nonprivileged user                              | Planned, not run |
| Capture ownership / 1.2          | Remove target/attempt/candidate comparison separately                           | Actual CLI rejects another attempt before any schema change                                                       | Planned, not run |
| Ledger identity / 1.2            | Remove baseline name/hash or pending-membership comparison separately           | Real SQLite with deleted/edited baseline row or unrelated addition remains untouched on refusal                   | Planned, not run |
| Script identity / 1.2            | Remove forward/down hash checks separately; mutate/remove/unread each script    | Real rollback refuses before any down SQL, not after partially reversing another migration                        | Planned, not run |
| Per-migration transaction / 1.2  | Run first down statement outside its transaction                                | A later down statement fails; schema and ledger must remain paired                                                | Planned, not run |
| Convergence / 1.2                | Re-run an already-committed reversal on resume                                  | Interrupted real rollback resumes remaining additions only                                                        | Planned, not run |
| Durable capture / 2.1            | Remove persistence/readback barrier                                             | Compose command adapter proves forward CLI was not invoked on failed capture                                      | Planned, not run |
| Final equality / 2.1 and 2.2     | Return exit zero without restoring the ledger; remove equality check separately | Both callers refuse schema-success output on leftover or changed migration identities                             | Planned, not run |
| Transport / 2.2                  | Drop/change capture in generated Job environment or script invocation           | Execute actual BACKEND_TASK_SCRIPT against disposable SQLite and observe refusal                                  | Planned, not run |
| Legacy compatibility / 2.2       | Synthesize missing fields from current files                                    | Old journal is refused without mutation or migration calls                                                        | Planned, not run |
| Manual recovery / 2.1 and 2.2    | Delete referenced capture or depend on removed incoming container               | Exercise generated command in disposable environment after modeled cleanup; refusal/actionability assertion fails | Planned, not run |
| Existing recovery boundary / 3.1 | Reopen writes on failed schema restoration                                      | Real k3s rehearsal observes rollback-failed with writer fence and retained evidence                               | Planned, not run |

For each implemented check, record the exact source line, test command/name, injected diff,
observed failing output, restored passing output and candidate SHA in `verify.md`. Place an
adjacent `Proof:` comment on the production check. Existing tests alone do not prove a newly
introduced check is breakable.

## Candidate capability amendment / 3.2a and 3.2b

The observed old-candidate RED is recorded in `verify.md`; every new guard below remains planned.

| Boundary               | Injected fault                                                   | Required observed failure                                                                                                       |
| ---------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| DB-free advertisement  | Add a database/config read to the capability executable          | Real CLI with DB_PATH unset or nonexistent refuses rather than returning its advertised response; nonexistent DB remains absent |
| Executable protocol    | Remove capability invocation from the generated capture script   | Old `--to`-only candidate reaches snapshot instead of capability refusal                                                        |
| Successful executable  | Ignore nonzero exit or unavailable executable                    | Generated script accepts a missing, unreadable or failing capability boundary                                                   |
| Response shape/version | Remove strict response validation                                | Malformed/legacy JSON, extra keys or unsupported protocol/version proceeds toward capture                                       |
| Complete support       | Remove each required capability or uniqueness check separately   | Partial, duplicated or unknown capability response proceeds toward capture                                                      |
| Ordering               | Move the check after SQLite/snapshot access                      | Incompatible candidate opens the absent/malformed database or creates a snapshot before refusal                                 |
| Coordinator admission  | Treat a failed capability Job as successful capture              | State advances to `state-captured` or forward migration is invoked                                                              |
| Advertisement truth    | Break digest verification or exact-set selection in the real CLI | Advertised-protocol contract fails on altered capture bytes or older candidate after newer baseline                             |

Unreadability must be tested as a nonprivileged subprocess when permission bits distinguish it
from absence. Pair each fault with restored positives and an adjacent `Proof:` comment. The
generated script remains the production script, not a second test implementation. Run backend
CLI and deployment adapter suites plus affected type/lint/build/format and strict OpenSpec checks.
These offline results do not replace a subsequent live 3.1 run and exact-SHA gate on the integrated
candidate. Candidate availability on h2puni remains a prerequisite to that host's execution route.

## Planned commands

Run focused Bun files from their owning Nx project context using the repository's existing
test setup. The first slice uses the two production CLI/SQLite DB suites named in tasks.md;
caller slices add remote-scripts and tool-deploy suites. Do not run root `bun test`.

For infrastructure rehearsal, use `bunx nx run tool-deploy:test:k3s --skip-nx-cache` with the
supported heavy-lock wrapper and locked k3d/kubectl on a disposable cluster. No production
cluster credentials, customer database contents or live host changes are needed.

After implementation and review, run `bin/h2puni-gate.sh <exact-implementation-sha>` from a
verified PUNI checkout on h2puni. Record its printed running SHA and full exit status; do not
checkout that SHA before entering the gate or substitute another candidate's result. CI
secrets/migration/infrastructure checks remain required. Trusted activation status must be
reported truthfully and is not established by this packet.

Planning-only checks are scoped Markdown formatting, OpenSpec structural validation and diff
hygiene. Those can establish reviewability only; they do not satisfy any proof row above.

## Planning checks observed on 2026-10-06

The new change passes strict OpenSpec validation (1/1). Normal `validate --all --json` passes
147/147. `validate --all --strict --json` reports 141/147 passing: six unchanged main specs
have placeholder Purpose text (`dev-deploy`, `live-plan-snapshot`, `plan-command-registry`,
`plan-import`, `saved-plans`, `scheduler-optimization`). All 129 change packets pass strict
validation. These pre-existing canonical-spec findings are not repaired by this focused draft.
Scoped Prettier and staged diff hygiene pass. No product tests, fault injections, rehearsal,
full gate or implementation verification were run for this planning packet.
