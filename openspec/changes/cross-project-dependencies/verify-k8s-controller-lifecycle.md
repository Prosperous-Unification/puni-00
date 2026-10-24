# Kubernetes journal-owned backup controller lifecycle evidence

## Scope

Base: `82e360559`. Isolated branch: `feat/k8s-controller-lifecycle`, checkout
`/tmp/puni-k8s-controller-lifecycle`. No push, merge, deployment or authoring
activation belongs to this packet.

The production executor and real fsync/rename file journal now retain separate
forward and rollback backup histories in schema 4. The version-1 prepared-only
ownership codec retains its existing contract; its canonical serializer is reused
without changing its bytes. The forward interval surrounds replay/capture/migrate
after backend shutdown. Exact restoration is acknowledged before backend rollout
changes the backup template. Eligible dormant rollback reuses an active forward
interval or creates a distinct rollback interval after completed restoration,
restoring that interval before old-tier rollout. The existing semantic rollback
admission and complete participant/storage exclusion remain future B2/B3 work.

Lease UID/session fencing and the sticky journal marker prevent a missing file from
being adopted as fresh work after controller intent. Marked Lease cleanup checks a
completed eligible journal before UID/resourceVersion-preconditioned deletion.
A marker patch with an uncertain response is reconciled only from the same UID and
session with the marker present. Controller uncertainty parks the release; journal
write/readback failure and Lease loss propagate as interruptions.

## Mounted cases and TDD

`controller-release.test.ts` runs the actual `executeRelease`, `fileJournal` and
`kubectlEffects` controller paths against a subprocess Kubernetes API fixture.
Unrelated release effects use the existing `FakeCluster` fixture. The API fixture
requires the exact durable controller phase before every patch, checks atomic JSON
Patch tests, and models UID deletion preconditions. It is not a live Kubernetes API
server. `controller-lease.test.ts` separately exercises the real Lease adapter,
including full replacements, uncertain responses, UID ABA and cleanup races.

The mounted matrix covers exact absent/false/true restoration; forward success;
abort during the active interval; abort after an authorized template transition;
suspension, restore-field and cleanup patches committing before acknowledgment;
individual UID/resourceVersion/template/token patch races; foreign live ownership;
UID-owned descendants versus unrelated Job-name matches; unlabelled writable and
readonly source consumers; a reader appearing after capture; storage replacement
after drain; Lease loss during inventory; bounded deletion timeout; restore failure;
and missing, unreadable or corrupt authoritative journals. The Lease matrix covers
sticky preservation, every marker CAS dimension, lost/no-apply response, UID ABA
across marker/renew/takeover/park/delete, a cleared marker, eligible cleanup and
refusal to clean up recoverable/missing/corrupt journals.

Initial red runs are retained as `tdd-primitive-red.log.txt`,
`tdd-mounted-red.log.txt`, `tdd-restore-red.log.txt` and `tdd-nonforce-red.log.txt`
under the evidence directory. The final transport assertion was added after the
normal-deletion contract review: a zero-grace DeleteOptions failed that test before
the explicit zero grace was removed. Drain now waits ordinary Pod termination and
bounded repeated inventory rather than forcing API disappearance.

## Independent review corrections

Independent Astra High review reproduced three integration defects before commit:
retained terminal source Jobs/Pods from production `runJob` blocked later source
barriers; a crash after durable restoration of a reused forward rollback interval
selected an absent rollback record; and template/token drift between final drain
inventory and fresh fence reads could precede source replay. Each now has a mounted
red/green regression. The fixture materializes actual `backendTaskJob` manifests
and matching terminal Pod specs after replay and capture. A shared strict terminal
classifier accepts inert history without granting deletion authority and refuses
active/terminating workers or deleting resources. Rollback restoration selects its
retained history independently from new source-interval selection. Final original
owner/token/suspension/template revalidation follows repeated fence reads, and the
late-drift negatives assert that even source replay was never invoked. Their independent reviewer reruns passed both
temporary reproductions (2/2) and the five repository regression cases (5/5).
The existing step replay receipt assertions now run before controller checkpoints
through the sole production `perform` caller, preserving their refusal diagnostics.

The normal deletion contract was checked against the locked client's
[kubectl v0.36.4 raw-delete source](https://github.com/kubernetes/kubectl/blob/v0.36.4/pkg/cmd/delete/delete.go)
and the Kubernetes [DeleteOptions API](https://kubernetes.io/docs/reference/kubernetes-api/definitions/delete-options-v1-meta/).
The former passes a single local file or stdin as the raw DELETE body; the latter
specifies precondition conflicts and orphan propagation. These source checks do
not substitute for live cluster/runtime validation.

## Watched production faults

All **44** final mutations exited nonzero and failed their intended named test.
Each mutation changed one production guard or dispatch (the suspension-ack fault
removes its two equivalent return sites), ran the selected production-path test,
and restored source in `finally`. The captured logs, exact transformations and machine
readable outcomes are retained in
[evidence/k8s-controller-lifecycle](evidence/k8s-controller-lifecycle/mutations.json).
Run the restoring proof runner from the repository root with
`python3 openspec/changes/cross-project-dependencies/evidence/k8s-controller-lifecycle/proofs.py.txt [fault...]`.

The first closed-lifecycle mutation survived a weak generic-throw fixture: the
unexpected transport itself threw and accidentally satisfied the assertion. The
corrected fixture requires the named boundary error and zero transport calls. Both
its initial survivor log and the initial 29/30 mutation table remain preserved;
the corrected mutation failed as intended. No production guard was weakened to
make the test pass.

| Fault                          | Observed failed test                                         | Exit |
| ------------------------------ | ------------------------------------------------------------ | ---- |
| `controller-uid`               | mounted atomic UID guard                                     | 1    |
| `controller-rv`                | mounted atomic resourceVersion guard                         | 1    |
| `controller-template`          | mounted atomic template guard                                | 1    |
| `controller-token`             | mounted atomic token guard                                   | 1    |
| `pending-checkpoint`           | mounted release checkpoints and restores exact false         | 1    |
| `suspension-ack`               | mounted release checkpoints and restores exact false         | 1    |
| `drain-dispatch`               | mounted unlabelled readonly                                  | 1    |
| `restore-dispatch`             | mounted release checkpoints and restores exact false         | 1    |
| `rollback-reentry`             | mounted dormant abort after rollout                          | 1    |
| `uncertain-routing`            | mounted exact restore failure                                | 1    |
| `lease-authority`              | mounted Lease loss during inventory                          | 1    |
| `journal-marker`               | mounted missing journal                                      | 1    |
| `marker-uid`                   | real Lease marker refuses UID                                | 1    |
| `marker-rv`                    | real Lease marker refuses resourceVersion                    | 1    |
| `marker-holder`                | real Lease marker refuses holder                             | 1    |
| `marker-readback`              | real Lease marker refuses no-apply                           | 1    |
| `lease-renew-uid`              | real Lease renewLease refuses delete-recreate                | 1    |
| `takeover-uid`                 | real Lease takeover refuses UID ABA                          | 1    |
| `lease-sticky-preservation`    | real Lease adapter preserves a sticky                        | 1    |
| `lease-cleanup-phase`          | real Lease cleanup refuses recoverable                       | 1    |
| `lease-delete-uid`             | real Lease cleanup deleteUID race                            | 1    |
| `lease-delete-rv`              | real Lease cleanup deleteVersion race                        | 1    |
| `descendant-delete-uid`        | mounted drain deletes actual UID                             | 1    |
| `descendant-ancestry`          | mounted drain never deletes a Pod                            | 1    |
| `closed-lifecycle`             | unknown lifecycle fields refuse before any cluster transport | 1    |
| `object-boundary`              | malformed lifecycle object identifies                        | 1    |
| `token-stability`              | owned token changing between read passes                     | 1    |
| `restored-current-state`       | completed restore history                                    | 1    |
| `journal-history-required`     | refuses missing or malformed controller lifecycle            | 1    |
| `journal-progress-validation`  | refuses missing source drain and restore                     | 1    |
| `non-force-pod-delete`         | mounted drain deletes actual UID                             | 1    |
| `fresh-storage-binding`        | mounted storage replacement                                  | 1    |
| `original-identity-comparison` | refuses foreign UID before mutation                          | 1    |
| `drain-convergence`            | mounted bounded drain timeout                                | 1    |
| `legacy-schema3`               | refuses a legacy in-flight journal schema 3                  | 1    |
| `final-original-owner`         | mounted owner template drift after drain                     | 1    |
| `rollback-restored-selector`   | mounted dormant rollback resumes                             | 1    |
| `terminal-history-acceptance`  | mounted retained production Job manifests                    | 1    |
| `terminal-active-worker`       | mounted retained history refuses active                      | 1    |
| `terminal-terminating-worker`  | mounted retained history refuses terminating                 | 1    |
| `terminal-condition`           | mounted retained history refuses condition                   | 1    |
| `terminal-deleting-job`        | mounted retained history refuses deleting-job                | 1    |
| `terminal-live-pod`            | mounted retained history refuses live-pod                    | 1    |
| `terminal-deleting-pod`        | mounted retained history refuses deleting-pod                | 1    |

Deletion-history Job/Pod mutations prove the early named drain refusal: the later
storage inspector still refuses those resources, so these two faults do not
demonstrate admission of source work. Object/shape boundary mutations also check
the named diagnostic. The table does not claim every mutation admits unsafe work.

The retained-history fixture derives Pod metadata/spec from each actual
`backendTaskJob` manifest. A direct UID-owner/template equality assertion failed
against the old backup-derived Pod and passed after correction; the focused
retained-history/rollback/late-owner matrix passed 10 tests (45 assertions).

## Configured checks

Configured lint, typecheck, build and `bunx openspec validate --all --json`
passed (exit 0). The fresh `NX_DAEMON=false bunx nx run tool-deploy:test`
passed 1140 tests across 39 files with 0 failures and 3000 assertions (189.51s).
Captured output is retained in `target-{test,lint,typecheck,build}.log.txt` and
`openspec.log.txt`. Evidence logs normalize trailing whitespace and CRLF only;
command output content and exit outcomes are preserved.

The pre-review target run recorded 1120 pass / 9 fail. After review fixes an
intermediate run recorded 1138 pass / 2 fail: the old Pod template failed the
new direct equality assertion, and a unit reader fixture omitted its Running
status. Both fixture corrections passed focused reruns; all first-start timing
cases passed the intermediate run. Historical logs are retained. Format and
`git diff --check` passed locally; normal hooks run as part of committing this packet.
The local dependency tree is shared read-only with the main checkout; the worktree
and main `bun.lock` SHA-256 values match exactly
(`ce438c27003f3ac7cbf0ab95019c9058dfcb10707be6310871de680cda8b471b`).
This is not a fresh frozen dependency install or a host gate.

## Limits and remaining acceptance

No live k3s/k3d rehearsal, API defaulting/runtime mount enforcement proof, CI run or
isolated h2puni/h4claw host gate was run for this packet. Normal graceful deletion
and DeleteOptions preconditions are modeled by local fixtures; live timing and
node-runtime behavior still need disposable-cluster rehearsal. Standard-resource
inventory does not exclude privileged API actors, arbitrary custom controllers or
all semantic participants, and repeated readback is not a continuous external
fence. The sticky marker is a conservative retention latch, not a distributed
transaction spanning filesystem and Kubernetes writes.

Independent review and host acceptance apply to the integrated SHA. Parent tasks
10.1/10.2 remain unchecked; no dependency authoring activation or B3 completion is
claimed. Controller-uncertainty reports print a pinned inspection command and
original UID/template/token facts, retaining current bytes and the Lease for
attended recovery rather than guessing a restoration patch.
