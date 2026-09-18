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
  - [x] Ubuntu VM lab: solver role, exact-path admission and alternate-path denial on a real
        node, socket replacement and reboot reconnect (verify.md, "F8 solver in the Ubuntu VM lab").
  - [ ] A real solve from a k3s pod. Blocked: the supervisor identifies peers only by Docker
        cgroup and refuses every containerd pod. Prepared: `infra/ansible/playbooks/solver.yml`;
        next: a containerd peer identity in `tools/tool-remote-scripts`, then rerun that play and
        an optimize request against a seeded project in the QEMU platform lab.
  - [x] F6 `solverImages` approved-digest set (F6 `f8265dc7`); the coordinator writes it.
  - [x] Review fixes: rollback resumes Flux only onto the previous revision; per-process
        Lease with heartbeat and expiry; writer guard on every schema Job.
  - [x] Flux suspend/resume against a live source: `Kustomization wbs` over a Git smart-HTTP
        repository in the k3d cutover and release rehearsals (verify.md, `d2f2ad4a`).
  - [ ] RWOP decision on the real Hetzner CSI driver and OIDC smoke. Prepared: prod overlay on
        `hcloud-volumes` (RWO); next: a staging PVC with `ReadWriteOncePod` and a second pod
        on another node, then an anonymous `GET /api/projects` expecting 401 on staging.
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
        WBS Flux unit and the installed-package admission route). Prepared: both workflows and
        the setup list in `docs/infra/deployment.md` "CI/CD"; next: after that setup,
        dispatch `deploy-k3s.yml` with `environment=staging`, the cluster context and the
        candidate, `apply` unchecked; review the plan, then dispatch again with `apply` checked.
  - [ ] `bin/h2puni-gate.sh <sha>` on the final implementation commit. Next: run it on h2puni for the merge of this change; it checks the SHA out under the host lock.
  - [ ] Production cutover: separate human authorization of the exact plan (not given). Prepared: [cutover-plan.md](../../../docs/infra/cutover-plan.md); next: fill its `INPUT` rows, check its prerequisites, and obtain authorization for that exact plan.
