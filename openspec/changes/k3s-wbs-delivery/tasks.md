# Tasks

- [ ] F8 — Deploy WBS through the lease-protected stateful release transaction per [F8](../../../docs/superpowers/plans/2026-09-17-k3s-fleet.md#f8--build-the-wbs-kubernetes-release-transaction).
  - [x] State-machine tests: exact phase order, an injected crash after every durable phase,
        rollback before writes reopen vs `recovery-required` after, failed rollback fenced
        with manual command, edited down-migration refusal, single writer.
  - [x] Bounded kubectl adapters, durable file journal, `MIGRATE_ON_STARTUP=false`, single
        migration Job checked against the captured set.
  - [x] Base and local/staging/prod overlays; single-replica `Recreate` backend, retained RWO
        PVC, UID 10001, termination deadlines, health probes.
  - [x] Real local k3s (k3d, locked k3s image): row → failed-health upgrade rolled back;
        SIGKILLed coordinator resumed and rolled back; additive upgrade promoted; at most one
        writer pod throughout; exact solver directory admitted, alternate host paths refused.
  - [ ] Ubuntu VM lab: real solve through the host supervisor, socket replacement/reconnect,
        denied alternate host path on a real node (blocked: see verify.md).
  - [x] F6 `solverImages` approved-digest set (F6 `f8265dc7`); the coordinator writes it.
  - [x] Review fixes: rollback resumes Flux only onto the previous revision; per-process
        Lease with heartbeat and expiry; writer guard on every schema Job.
  - [ ] RWOP decision on the real Hetzner CSI driver; Flux suspend/resume against a live
        source; OIDC smoke (staging, F11).
- [ ] F11 — Wire package admission, immutable image promotion, CI/CD separation, staging proof, and the concrete production cutover plan per [F11](../../../docs/superpowers/plans/2026-09-17-k3s-fleet.md#f11--wire-cicd-and-stage-the-production-cutover).
