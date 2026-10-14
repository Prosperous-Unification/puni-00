## 0. Intent and technical shape

- [x] 0.1 Record the status boundary, assumptions and ADR 0053; resolve “step blockage” in `CONTEXT.md`.
- [x] 0.2 Check migration, plan-document and saved-plan version allocation against the exact integration head before assigning constants.

## 1. Domain reading

- [x] 1.1 Red: add tests for direct blockage, work-item hold precedence, `done` precedence, in-progress precedence, unknown, direct causes, transitive causes, cycles, and node endpoint precision (`A.dev` is not `A.qa`).
- [x] 1.2 Extend canonical `nodeReadingsOf` and `nodeReadingOf` with direct blockage and precise roots over all graph edges; retain waiting/skipped, stop proxy at running attempts, and keep boundary nodes internal. Reuse existing `resolveDependencyGraph` without a second extraction. Keep `StepState`, `blockedByProxyOf` and `withoutHeldSubtrees` unchanged.
- [x] 1.3 Add schedule-neutrality tests proving the canonical input and full Fast schedule are byte-identical when blockage facts and projections are present. Watch a mutation that filters blocked nodes fail this test.
- [x] 1.4 Add production-path negatives for unknown work-item/step progress references (except known historical parent-owned progress, retained by the row fold and excluded only from leaf projection) and dependencies with absent typed/legacy endpoints, duplicate graph node identities and missing edge endpoints; disable each validation in turn and observe its test fail. Add adjacent `Proof:` comments.

## 2. Persistent blockage facts

- [x] 2.1 Red: add migration walk, SQLite constraint, repository round-trip, and rollback save/remove/restore tests. Include absent table, unreadable DB, malformed owner/step, duplicate fact and fact remaining during `down.sql`.
- [x] 2.2 Add the additive `step_blockage` table beside the step-progress repository, with project/work-item/step constraints and indexes needed by its project reads.
- [x] 2.3 Add guarded `down.sql` and a rollback CLI that saves, removes and restores exact blockage facts; extend swap compatibility discovery to refuse an old image if blockage facts would be lost.
- [x] 2.4 Watch the production rollback guard fail with a fact present and the swap check fail when the blockage inventory is omitted. Add adjacent `Proof:` comments naming the injected faults.

## 3. Command journal and structural edits

- [x] 3.0 Prepare transactional blockage command plumbing: scope project and lifetime reads/writes, refresh retained owner revisions after successful writes, and prove memory/SQLite same-batch visibility, commit/rollback and owner deletion. Keep the public command absent.
- [x] 3.0.1 Prepare conditional journal replay and rollback compatibility: decode nested commands, compare exact owner/step fact before replacing it, preserve blocked time on redo, reject stale facts despite forged revisions, and inventory both persisted journal directions recursively before an older image starts. Do not add structural fields or a public command in this slice.
- [x] 3.0.2 First-child closure: red memory and mounted SQLite create/undo/redo preserving exact blockage identity/time and progress in one undo unit; clear parent facts before insertion, set child facts afterward, and compose conditional replay around subtree commands. Prove refused writes, stale facts despite unchanged revisions, and full rollback after the first clear. Keep public setter and other structural operations absent.
- [x] 3.0.3 Move closure: clear destination leaf progress and blockage before unrelated reparenting; preserve incoming facts; hand blockage up only for steps with a direct fact on every former leaf, using maximum blocked time including negative times and retained done facts. Compose conditional journal batches in leaf-safe order; retain exact predeparture historical progress in place through a validated optional inverse-move snapshot, track its owners across flip/rebase, and refuse added/removed/changed progress or residual blockage during replay despite unchanged revisions; guard complete destination progress before replay clears, retain snapshots through flip, exact-pair attributed conditional rebase and collected batches, enforce move_progress_v1 inventory at both Compose swap phases, and prove memory/SQLite rollback, refused writes and duplicate non-inheritance. Keep public setter, deletion and step deletion separate.
- [x] 3.0.4 Delete closure: capture and conditionally clear exact subtree blockage before deletion; restore facts after their owners return; hand up only unanimous direct former-leaf blockage per step with maximum original blocked time including negative and done facts; retain the existing deletion progress fold and historical parent statements. Guard complete surviving-parent progress before any replay batch removal, guard parent blockage before insertion, and refuse changed/missing/added subtree blockage on redo. Retain parent owners through collected batches, flip and exact-pair neighbor rebase. Validate optional deletion metadata and references, inventory `delete_state_v1` independently in both nested journal directions including empty collections, and prove memory/mounted SQLite rollback plus watched R5 negatives. Coordinate Kubernetes admission with #428/#429; no public setter, step deletion or live action.
- [x] 3.0.5 Project-step deletion closure: red direct blockage-only and retained-done refusals, late-arriving facts, confirmed cascade counts/revisions/survivors, transaction rollback, missing-step replay refusal and UI count/older-server unknown wording; extend internal holdings and removal contracts, explicitly delete facts atomically, and watch each guard fail. Preserve document v8, saved schema6, scheduler16 and existing replay capabilities.
- [x] 3.0.6 Immediate disabled writer admission: red independent SQLite writes/cascades, mounted nonempty v9 import with full rollback, empty/legacy import and export, boot/readiness corruption, nested empty structural undo/redo and down retained facts/history; add the constrained singleton marker and three additive triggers, exact sentinel translation after rollback and mounted 409, explicit test activation helper, guarded down and recovery refusal documentation; watch each writer/authority/replay/rollback guard omission fail its production-path assertion and record focused verification. No production enable interface; old-writer barrier/F11.1d remain coordinator work.
- [x] 3.1 Red: test `setStepBlocked` ownership, unknown work item/step, parent refusal, done refusal, no-op behavior, event append, retained read, and command batch atomicity.
- [x] 3.1.1 Compose the reviewed setter with default-disabled admission: mounted set/retained clear/undo/redo typed 409 and atomic unchanged facts/history/revisions/fanout; preserve absent-clear no-op, enabled set/clear exact-time replay and disabled read/export/nonempty reimport semantics.
- [x] 3.2 Implement `setStepBlocked` through the project command registry, write coordinator and command journal. Undo/redo must conditionally restore the prior fact and refuse stale state.
- [ ] 3.3 Red: include migrated parent progress compatibility across memory/SQLite retained reads; pre-store-move destination done/incoming in-progress clear/undo/redo with and without blockage; block→done→move→undo→redo; last-child move/delete→peer progress→undo refusals with revision checks bypassed. Test no new progress hand-up. Then test test hand-down, moving another row beneath a leaf, delete/undo, duplicate, last-child hand-up agreement, and concurrent stale undo.
- [ ] 3.4 Clear destination progress before moving, journal its restoration after inverse movement, include destination in touched, and add stale move/delete replay guards. Watch each guard removed fail atomicity negatives. Implement structural fact handling alongside step progress at each existing mutation seam. Watch skipped hand-down and copied blockage faults fail their targeted tests; add `Proof:` comments.

## 4. Read and transfer contracts

- [ ] 4.1 Red: test work-item responses and retained snapshots expose direct and derived step readings plus root causes while preserving the existing work-item status.
- [ ] 4.2 Red: test new plan-document and saved-plan round trips, old-version upgrades to no facts, malformed/missing/duplicate/parent-owned fact refusals, diffs, and atomic refusal.
- [ ] 4.3 Add blockage fields to domain contracts, OpenAPI shapes, core reads, plan documents, saved-plan capture and comparison. Allocate versions only after task 0.2.
- [ ] 4.4 Add import production-path negatives for each ownership/reference validator; disable each guard and watch its specific test fail. Add adjacent `Proof:` comments.

- [x] 4.2.1 Saved-plan direct capture: required detached direct facts, schema7 sorted owner/step/time rows, schema1–6 upgrade to empty, strict current capture/read refusals, pair-addressed comparison, memory/SQLite capture and schedule neutrality proofs. Plan-document and public read work in 4.1–4.4 remains separate.

## 5. Step-scoped user interface

- [x] 5.1 Red: test the step cell and card action for direct block/clear, direct versus proxy wording, retained progress, blocker cause, keyboard access and accessible name/description. Add a browser test on the production preview path.
- [x] 5.2 Implement the accessible step-scoped action and reading. Keep the row Status control unchanged and do not rely on color alone.
- [x] 5.3 Watch removal of direct/proxy distinction and cause text fail the browser assertions; record the observed output in `verify.md`.

## 6. Full verification and release evidence

- [ ] 6.1 Run focused domain, adapter, command, import, saved-plan and browser tests; run touched-project lint/typecheck, Prettier, strict OpenSpec validation and `git diff --check`.
- [ ] 6.2 Review every introduced safety check against an observed production-path negative and document fault, test and output in `verify.md`.
- [ ] 6.3 Document historical parent-progress inventory/explicit repair and incompatible-writer overlap release obligations. Run `bin/h2puni-gate.sh <sha>` on the exact candidate when the shared gate checkout is clean; capture exact-SHA CI and migration-lint evidence before integration. Do not mark the WBS parent complete while unrelated gate dirt remains.

- [x] 4.2.2 Plan-document direct transfer: allocate v9 on exact b4537c83; require root direct facts and exclude row aliases; normalize empty v1–8 facts and refuse nonempty legacy collections; validate owner/leaf/step/time/unique pairs; restore remapped identities and exact timestamps through the scoped import resource inside its existing unit of work; prove memory/SQLite roundtrip, mounted 400/export, full rollback and schedule neutrality; preserve Navigator external v7 with internal v9 adapter and saved schema7/scheduler16.

## 6.4 Compose stopped-writer release barrier

- [x] 6.4.1 Red planner ordering and durable retry/interruption negatives; preflight before stop, exact outgoing and idle IDs, complete canonical writable-mount inventory, independent stopped inspection, candidate gating and exposure before alias.
- [x] 6.4.2 Replace backend overlap with the mandatory stopped-writer sequence; retain stop/migration/exposure evidence, refuse ordinary retries, keep older writers stopped on every failure, and provide digest-pinned attended schema/replay recovery without automatic restart.
- [x] 6.4.3 Add full planned execution, partial alias failure, preflight/no-unrelated-stop, identity replacement, read-only/canonical alias, and real SQLite printed recovery proofs; watch production guard omissions fail and add adjacent Proof comments.
- [x] 6.4.4 Run scoped test/lint/typecheck/format and strict OpenSpec validation; record outputs and retained limitations.
- [ ] 6.4.5 Obtain Astra review before integration and combine the separate SQLite activation boundary. No live deployment belongs to this slice.

- [x] 6.4.6 Repair Astra's stopped-idle alias, actual database identity and boot-exposure blockers: decode effective merged configuration, private snapshot with forced recreation/no dependencies/no pull, most-specific DB bind resolution for candidate/outgoing/idle before stop, durable possible exposure before boot, and independent read-only fact/replay admission before that exposure. Watch all reported omissions fail, including disposable Docker mutations with verified cleanup.
- [ ] 6.4.7 Rerun scoped checks and strict validation on the corrected transition; obtain independent Astra review before integrating the separate SQLite activation boundary or deploying.

- [x] 6.4.8 Repair Astra SQLite probe/family blockers with quiescent private main/WAL copies under read-only source mount, production-command clean/retained-WAL proofs, whole-family directory mapping and pre-stop shadow/alias negatives; watch protection omissions fail.
- [ ] 6.4.9 Obtain Astra re-review of the SQLite family/probe correction before integration or deployment.

- [x] 6.4.10 Repair physical hardlink exclusion and recovery-path family admission; refuse unresolved unmanaged directory aliases, preserve read-only/distinct-file admission, correct stale automatic recovery prose, and watch all three production omissions fail.
- [ ] 6.4.11 Obtain independent Astra re-review of physical/family admission before integration or deployment.

- [x] 6.4.12 Replace blanket writable-directory refusal with complete bounded daemon-assisted read-only inode audits; admit shipped Caddy/registry volumes and logs, preserve physical/recovery guards, require local pinned helper/no pull, and prove nested aliases and all failed/incomplete audit paths.
- [ ] 6.4.13 Obtain Astra review and a disposable real-Docker helper rehearsal before integration or deployment.

- [x] 6.4.14 Reproduce host Source replacement, top-level RO/nested RW and default-cap proc-root refusal; discard the unmergeable proc-root helper. Prove initialized default-image process groups on timeout/EOF/client cancellation, including scanner/grandchild, unrelated sentinel and zero zombie residue.
- [x] 6.4.15 Replace source rebinds with strict in-target metadata sessions, immutable read-only code, per-entry stat failure propagation, actual mountinfo/family/ID stability, bounded complete Docker operations and verified initialized-group cleanup. Add attended init prerequisites and be-only candidate/render checks; document trusted nonadversarial quiescence explicitly. Watch safety omissions fail.
- [ ] 6.4.16 Run final scoped checks/strict OpenSpec validation, record exact-source real-Docker evidence and obtain independent Astra review before integration. No live prerequisite application or activation belongs to this slice.

- [x] 6.4.17 Refuse unreadable census directories explicitly before shell glob traversal; prove an empty directory remains admissible and a chmod000 hardlink cannot be hidden under reduced capabilities.

- [x] 6.4.18 Repair merged predecessor boot refusal with hash-pinned inert maintenance, exact-ID backup/capture/migrate, durable maintenance/migration receipts and stopped proof before app exposure; preserve the boot admission check and disabled activation.
- [ ] 6.4.19 Complete authentic predecessor/interruption, snapshot/identity/configuration and watched guard proofs, scoped verification, reviewed BusyBox integration and exact-image rehearsal; obtain combined independent review before publication.
