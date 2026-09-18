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
  - [x] `tool-fleet:check`: schema, strict YAML, Ansible syntax and real hcloud inventory
        plugin against a fixture API, kustomize and helm rendering, shellcheck, actionlint,
        executable ownership; locked tools; `check:faults` fails each family on the real command.
  - [x] Unprivileged `infra-check.yml`; protected, plan-by-default `deploy-k3s.yml` with
        admission.json and the descriptor as artifacts and a persistent 0700 state directory.
  - [x] Release descriptor (source, per-tier digests, gate/pixels run, P5 identities via
        `requireDeploymentAdmission`); prod promotes only a staging-proved descriptor; the
        desired deploy revision is pushed only while the WBS Flux unit is suspended.
  - [x] `solverImages` written candidate first, then rollback (F6 contract).
  - [x] Compose → k3d cutover rehearsal on a local clone, including a tampered-export refusal
        and the pre-switch rollback; staging/prod Traefik Ingress.
  - [x] SQLite backup shipped with the release on the backend image; overlay-render check; k3d
        backup-and-restore proof.
  - [x] Fable review repairs B1, M1–M6, m1–m4 (verify.md), including the cutover and an F8
        release rehearsed against a real `Kustomization wbs`.
  - [x] Concrete production operation plan ([cutover-plan.md](../../../docs/infra/cutover-plan.md)).
  - [ ] `infra-check` and `deploy-k3s` observed in real GitHub Actions; staging rollout and
        rollback through `deploy-k3s` (needs the protected environments, runner, deploy repo,
        WBS Flux unit and the installed-package admission route).
  - [ ] `bin/h2puni-gate.sh <sha>` on the final implementation commit.
  - [ ] Production cutover: separate human authorization of the exact plan (not given).
