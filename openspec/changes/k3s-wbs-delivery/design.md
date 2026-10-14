# Design

F8 and F11 of [the fleet plan](../../../docs/superpowers/plans/2026-09-17-k3s-fleet.md) define delivery. A release descriptor carries source SHA, exact image digest per tier, package and activation admission identities, and gate/browser evidence. Staging proves those bytes; production promotes the same digests.

The coordinator acquires a Kubernetes Lease, writes a recovery journal, suspends the named WBS Flux Kustomization, captures a consistent SQLite backup plus applied migrations, runs backward-compatible migration and tier rollout, verifies API/frontend/WebSocket/MCP/solver behavior, records commit state, and resumes Flux. Failure or controller restart follows the journal to roll forward or restore the captured state without creating a second writer.

The existing Compose deployment supplies migration/rollback evidence for first cutover. DNS and production apply consume a separate reviewed immutable operation plan.

## F8 implementation decisions and assumptions

Recorded under the "make reasonable assumptions" instruction; each can be revisited without
changing the transaction's phase order.

- **Coordinator shape.** `planRelease(request, state)` (pure, `release.ts`) plans the remaining
  steps from a durable phase; `executeRelease` (`execute.ts`) performs one step, then writes
  the journal. A journal write that throws is treated like process death (no rollback in that
  process); the next run resumes from the last durable write.
- **Resume rule.** A restart before `smoke-passed` rolls back; from `smoke-passed` on it
  finishes the release. Each rollback undo keys on the phase _before_ the step it reverses,
  because that step may have run partially.
- **Lease.** The holder is `<transactionId>#<run>`, unique to one process. The Lease carries
  `renewTime`, a duration (20 s local, 120 s staging/prod), and a `puni.dev/journal`
  annotation. The executor renews it before every step and on a heartbeat (a quarter of the
  duration) while a step runs. Losing it stops the process with nothing journaled, as a crash
  would. A live holder is never displaced: a second process of the same transaction waits
  once for it to lapse and is then refused. A lapsed Lease is taken over only by its own
  transaction (the journal names it), or, when no journal exists, by a coordinator using the
  journal path the dead holder recorded (it died before persisting intent). A resumed run
  claims the Lease before its first journal write. Terminal failure phases park the Lease
  (`puni.dev/parked`) so that recovery can take it over without waiting, while any other
  transaction still has to delete it by hand.
- **Journal.** A 0600 JSON file (fsync + rename) in an operator-supplied persistent
  directory, also holding rendered Job manifests referenced by manual commands. The Lease's
  `puni.dev/journal` annotation names it. An in-cluster journal was rejected for now: it would
  need the API server to be healthy exactly when recovery matters. F11 must give CI a
  persistent, protected journal directory.
- **Write fence.** Repointing NetworkPolicy `wbs-backend-writers` rather than swapping
  ingress to a maintenance page: it also fences MCP and anything else in-cluster, is durable
  when the coordinator dies, and keeps gateway/smoke read paths. Clients see connection
  failures rather than a branded 503 during the window.
- **First install is not a release.** `expectedCurrent` is required; the Compose-to-k3s
  first install is F11's cutover. The lab bootstraps v1 directly.
- **Flux.** `local` has no Flux unit and reconciles by applying the rendered overlay with the
  release digests. Staging/prod require the unit and a desired deploy-repo revision; the
  coordinator refuses to start if the unit is already suspended (unless recovering), and
  refuses to resume unless the GitRepository artifact is at that revision. Ordering
  constraint for F11: the desired revision may be pushed only after the unit is suspended.
  A rollback resumes Flux only onto `flux.previousRevision`, the deploy-repo commit that pins
  `expectedCurrent`. If the source already serves the failed release, the coordinator leaves
  Flux suspended and ends at `flux-revert-required`. The previous release is then serving with
  writes open, the Lease is parked, and the report names the deploy-repo revert and the resume
  command.
- **Migration evidence.** Schema Jobs run the candidate backend image
  (`BACKEND_TASK_SCRIPT`), report applied rows plus each folder's `migration.sql`/`down.sql`
  SHA-256, and are checked by the coordinator: capture refuses an applied migration the
  candidate changed; migration success is the applied set equalling capture + pending (not
  Job completion); rollback refuses a `down.sql` whose hash differs from capture and checks
  the restored applied set. Snapshot: `VACUUM INTO` on the data volume, `integrity_check`,
  SHA-256, journaled; it is for manual restore and F7 export, never reused by recovery.
- **MCP image.** `apps/wbs/mcp-01/Dockerfile` is the production image source. Dagger publishes
  it as `mcp` in the release record; the F8 lab builds that same Dockerfile. A real publish
  and staging pull remain acceptance steps.
- **Non-root runtime.** All tiers run as UID 10001 with read-only roots and `/tmp` emptyDirs.
  fe-01 is served by its image's Caddy on :8080 from a mounted Caddyfile; the Caddy binary's
  file capability requires `NET_BIND_SERVICE` in the bounding set (Restricted permits it).
- **Local auth.** The images set `NODE_ENV=production`, which forbids `AUTH_MODE=local`; the
  local overlay sets `NODE_ENV=lab`. Staging/prod use OIDC with SOPS-managed secrets.
- **Storage.** RWO everywhere (`puni-local` lab, `hcloud-volumes` staging/prod). RWOP remains
  unselected until tested on the Hetzner CSI driver.
- **Admission list.** F6's trusted-workload policy (`f8265dc7`) admits `wbs-solver` images in
  the comma-separated `solverImages` parameter. The coordinator writes it after persisting
  intent, as `admit-images`, and reads it back. It contains the rollback digest and the
  candidate, or one entry when they are the same image. Validation requires the current list
  to include the running backend, which proves the parameters belong to this deployment.
  Flux's platform reconciliation owns the same ConfigMap: F6/F11 must exclude
  `data.solverImages` from Flux's managed fields, or the reconciler reverts the list mid-release.

## F11 implementation decisions and assumptions

Recorded under the "make reasonable assumptions and record them" instruction.

- **Descriptor transport.** Staging takes the operator's candidate (Dagger's be/gw/fe
  digests, the MCP digest, the `ci` run id) as a dispatch input; the workflow seals it with the
  trusted admission and the observed run. Production takes the staging run id and the
  descriptor SHA-256, downloads that run's `release-descriptor` artifact, and the deploy job
  additionally requires the staging proof in the persistent state directory. The artifact is
  transport; the proof on the protected runner is the authority. Assumes one deploy runner
  (label `puni-deploy`) holds both environments' state; split runners would have to carry the
  proof as a protected artifact.
- **Re-admission for production.** Production runs the admission job again and requires the
  same package and activation identities as the descriptor, rather than trusting staging's
  record. A changed activation between staging and prod therefore blocks promotion.
- **Deploy repository.** Flux's WBS source is a separate repository (`vars.PUNI_DEPLOY_REPO_URL`)
  holding the rendered release at `clusters/<env>/wbs/release.yaml`. The desired commit is
  prepared deterministically (fixed identity and dates) so a resumed run rebuilds the same
  request, is kept at `refs/wbs/desired/<release>`, and is pushed in `persist-release`, before
  writes reopen, while the unit is suspended, with `--force-with-lease` from
  `previousRevision` (review M2: a failed push after reopen stranded the environment at
  `recovery-required`). The deploy repository never names an unproven release.
- **Admission route.** Deployment requires the `installed-package` route because only it writes
  `admission.json`; the committed route is still `archive-launcher`, so staging is blocked on the
  P5 flip, deliberately.
- **Validation tools.** kubectl and helm come from `infra/versions/toolchain.json`; shellcheck
  0.11.0 and actionlint 1.7.12 from `tools/tool-fleet/src/check-tools.json` (the toolchain schema
  rejects unknown keys and is not owned here). Ansible runs only inside the digest-locked
  controller image, with `--network none`. actionlint checks the two F11 workflows only:
  `ci.yml` and `trusted-wiki.yml` carry pre-existing SC2174 findings.
- **Executable ownership.** Checked means shellchecked by some Nx target. Eleven existing
  executables are not; `check-tools.json` lists them and the check fails when the list is
  stale, so it only shrinks.
- **Cutover.** Old and new digests are the same be/gw/fe bytes (the release running on
  Compose), plus the new MCP image. The export runs in the old release's own backend image
  with the writer stopped (`wal_checkpoint(TRUNCATE)`, `VACUUM INTO`). The restore is a
  writer-labelled backend Job so F6 admission and the single-writer guard apply to it. The
  rollback boundary is the DNS switch. The k3d lab has no Traefik, so the rehearsal's host
  override targets the backend Service with a `Host` header; the Ingress objects are rendered
  and checked but not exercised.
- **Edge.** Staging and prod overlays add Traefik Ingress objects (one per namespace, since
  `/api` lives in `wbs-solver`); prod names `letsencrypt-production`, which does not exist yet
  and is a cutover prerequisite.

## F11.1b replay coordinator

The fenced coordinator stops all writer Pods and inventories retained command history
before `capture-state`. Both the candidate and previous backend images execute their
own capability CLI as bounded, writer-labelled Jobs. The coordinator records a
`replay-checked` phase with a SHA-256 sealed receipt binding the inventory, both
vocabularies and exact images, database target, transaction and direction. Forward
admission requires both images to understand every retained replay kind.

Rollback stops the writer whenever closing the write path may have begun, restores
any captured schema set, then observes fresh history and both image vocabularies.
It requires the previous image to understand that history and refuses changed
kind/count inventory under the fence. `rollback-replay-checked` persists the rollback
receipt before restoring tiers; reopening also validates the corresponding receipt.
A failed observation or compatibility decision makes one forward attempt and one
rollback attempt at most; rollback refusal parks the Lease and records the failing
step, required replay kind/image and manual completion command.

Journal schema 3 requires these receipts at their recorded phases, validates their
original bytes and projected fields before claiming the Lease, and refuses legacy
schema 1/2 journals with the prior-executor/manual-recovery route. A recovery request
validates old evidence against its original request and takes fresh evidence for its
new transaction. `recovery-required` still requires the prior forward receipt even
though it is outside the forward phase list. A resumed pre-smoke transaction rolls back; proven transactions
finish with their durable receipt. Replay Job reuse additionally compares every
requested manifest field against the observed Job before reading its output. It
also pins omitted mount options to their effective Kubernetes defaults, so added
subpaths, changed access or propagation cannot select another database on the PVC.

Inventory is a compatibility kind/count summary, not a digest of all journal rows.
The writer fence and stopped writer are the authority for its stability. Restore
and first cutover admission, h4 rollout, staging acceptance and the host gate remain
separate prerequisites under F11.1.

## F11.1c export and restore replay admission

Cutover is separately versioned from the release journal. Export, restore-job and
verify-restore require the original descriptor file, a separate SHA-256 pin of
those exact bytes, and old/incoming backend identities. The incoming reference
must match the descriptor; old and incoming references may differ for Docker and
cluster routing, but their immutable SHA-256 digests must be identical. The raw
file pin includes its trailing newline and is distinct from the existing
canonical descriptor identity used for promotion.

Before the old image checkpoints or exports SQLite, it runs the coordinator's
independent read-only command-journal inventory and its own capability CLI. It
refuses missing/unreadable/malformed sources and unsupported retained history
without producing a snapshot. The SQLite report carries replay evidence version 1
binding original descriptor bytes/pin, both image references, inventory,
capabilities and the completed export SHA-256.

The restore Job validates this evidence before waiting for incoming bytes, then
checks their SHA-256, inventories the incoming database independently and runs
its own image CLI. Inventory and capability observations must match the export
evidence before rename into `/data/wbs.sqlite`. Failure preserves the source
export, refused incoming bytes and arrival marker for reviewed recovery. A new
attempt refuses a stale marker; the operator must inspect and explicitly clear
or move failed arrival artifacts before retrying. Verification requires matching
versioned evidence and refuses legacy SQLite reports.

Prepared cutover manifests hold every Deployment at zero. First-start admission
for scaling, release-record persistence and Flux handoff remains a separate open
slice; this code does not make cutover activation ready. The local rehearsal
carries exact descriptor bytes for actual built digests using laboratory-only
admission fields, and explicitly clears rejected arrival files after retaining
failure logs and the host export. That descriptor is not staging proof. No live
Docker/k3d execution is claimed by this slice. Existing-host storage is
`puni-retain`; future host topology is outside these admission changes.

## F11.1d first-start candidate

`first-start.ts` uses a separate version 1 state file and sealed receipt; release
journal schema 3 retains its existing meaning. The receipt binds original descriptor
bytes and their operator pin, export and restore evidence, context/cluster UID,
both namespace UIDs, PVC name/UID/path, restore Job name/UID, transaction, every tier
digest and the desired Flux revision. Before scaling it verifies the completed
restore Job and freshly runs the independent replay inventory and the backend
image's `readStepBlockageActivation` against the actual PVC. The authority must be
present, valid and `DISABLED`; the read-only probe never enables it. A nonempty WAL
refuses admission because matching main-file bytes cannot certify WAL contents.

The coordinator claims the existing WBS Lease, closes the writer ingress fence,
suspends Flux, stops every tier, and persists/readbacks actual admission before
explicitly starting every tier. Deployment path/PVC, disabled startup migrations,
writer label, Recreate strategy, digest and ready rollout are checked. It persists
and reads back the release record before handing the matching revision to Flux.
Failure parks the Lease and preserves fence/suspension. Retry reuses only the
sealed transaction; it stops tiers and repeats the actual PVC observation with a
fresh Job name. Changed restored bytes require reviewed recovery. The CLI and
rehearsal use this coordinator; descriptor-only `release-record` now refuses.

**Review blocker: source-tree admission.** The current candidate checks the source
SHA before resume and checks the fence again after Flux reports that SHA applied.
An operator can still name a valid digest-pinned revision containing the ordinary
open writer NetworkPolicy. The exact unsafe trace is: coordinator checks closed
fence → coordinator resumes Flux → Flux applies the open policy → callers can
reach the backend → coordinator detects the open fence → coordinator suspends Flux,
closes the fence and parks its Lease. Post-handoff refusal does not erase the
possible acknowledged writes in that interval. No final safety claim or live
activation is permitted while this gap remains.

Proposed correction for architecture review: before any resume, read the exact
desired Git tree through a trusted source observation, bind its rendered resource
bytes/path to the pinned revision, and require the writer NetworkPolicy selector
to remain fenced plus exact tier digests/PVC and startup contract. Record that
source admission durably. A production-path negative must pin a real revision
with matching images and an open writer selector, then prove refusal before
`resumeFlux`; removing the source check must make the negative fail. Merely
trusting operator-supplied rendered bytes without proving their commit binding
cannot close the gap. The laboratory and `handoff-manifests` render a fenced
revision, but that convention alone is not admission.

The coordinated StepBlockage deletion slice adds own `deletionState` metadata on
`delete_subtree`/`restore_subtree`. Independent Kubernetes traversal recognizes
those properties through nested forward/inverse batches, counts `delete_state_v1`
once per affected journal row, and resets the flag between rows. Markerless legacy
commands remain unguarded. `moveProgress` preconditions independently require
`move_progress_v1`, so a row can require both capabilities. Coordinator and cutover
validators admit this inventory vocabulary but still require each actual image's
own advertisement. This adds no capability to an old image and does not alter the
release journal schema. Application deletion behavior remains in its separate slice.
