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
  because that step may have run partially. `validated`/`lease-acquired` precede the first
  journal write; the Lease holder name (the release id, derived from the exact bytes) lets a
  restart reclaim its own Lease, and any other holder is refused.
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
- **Migration evidence.** Schema Jobs run the candidate backend image
  (`BACKEND_TASK_SCRIPT`), report applied rows plus each folder's `migration.sql`/`down.sql`
  SHA-256, and are checked by the coordinator: capture refuses an applied migration the
  candidate changed; migration success is the applied set equalling capture + pending (not
  Job completion); rollback refuses a `down.sql` whose hash differs from capture and checks
  the restored applied set. Snapshot: `VACUUM INTO` on the data volume, `integrity_check`,
  SHA-256, journaled; it is for manual restore and F7 export, never reused by recovery.
- **MCP image.** No Dockerfile or Dagger target exists for `mcp-01`; the lab builds
  `deploy/k8s/wbs/lab/mcp-01.Dockerfile`. A production MCP image is an open item for the
  Dagger owner.
- **Non-root runtime.** All tiers run as UID 10001 with read-only roots and `/tmp` emptyDirs.
  fe-01 is served by its image's Caddy on :8080 from a mounted Caddyfile; the Caddy binary's
  file capability requires `NET_BIND_SERVICE` in the bounding set (Restricted permits it).
- **Local auth.** The images set `NODE_ENV=production`, which forbids `AUTH_MODE=local`; the
  local overlay sets `NODE_ENV=lab`. Staging/prod use OIDC with SOPS-managed secrets.
- **Storage.** RWO everywhere (`puni-local` lab, `hcloud-volumes` staging/prod). RWOP remains
  unselected until tested on the Hetzner CSI driver.
- **Required F6 change (not made here).** F6's admission compares every `wbs-solver`
  container image to one `solverImage`. A release needs both the candidate and the rollback
  digest admitted, so the lab applies a patch making it `image in solverImage.split(',')`
  (see `APPROVED_SET_PATCH` in `lab.ts`). The coordinator reads the same comma-separated set
  and refuses before any mutation unless both digests are approved.
