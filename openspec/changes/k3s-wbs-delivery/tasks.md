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
  - [x] A real solve from a k3s pod: the backend in `wbs-solver` solved `ready`/`proven` through
        the containerd peer identity (`puni-cri-peer`) in the QEMU platform lab (verify.md,
        "F8 real solve from a k3s pod", `93960ee0`).
  - [ ] A release-path solve: `deploy:k3s --apply` with the retained PVC on a VM node, then an
        optimize request against a seeded project. The `93960ee0` solve used an emptyDir DB and
        `MIGRATE_ON_STARTUP=true` outside the release transaction.
  - [x] F6 `solverImages` approved-digest set (F6 `f8265dc7`); the coordinator writes it.
  - [x] Review fixes: rollback resumes Flux only onto the previous revision; per-process
        Lease with heartbeat and expiry; writer guard on every schema Job.
  - [x] Flux suspend/resume against a live source: `Kustomization wbs` over a Git smart-HTTP
        repository in the k3d cutover and release rehearsals (verify.md, `d2f2ad4a`).
  - [ ] RWOP decision on the real Hetzner CSI driver and OIDC smoke. Prepared: prod overlay on
        `puni-retain` (RWO); next: a staging PVC with `ReadWriteOncePod` and a second pod
        on another node, then an anonymous `GET /api/projects` expecting 401 on staging.
  - [ ] P0 MCP persistence: retained PVC, `Recreate`, Secret current/previous refs, runtime lab
        keys and bounded rollout diagnostics. The k3d lab proves that an OAuth session survives
        a restart, and that a missing store key makes the pod exit with a log naming the key
        (verify.md, 2026-09-27). Before staging: provision the production SOPS Secret and
        prove a Dagger MCP publish.
- [ ] F11 — Wire package admission, immutable image promotion, CI/CD separation, staging proof, and the concrete production cutover plan per [F11](../../../docs/superpowers/plans/2026-09-17-k3s-fleet.md#f11--wire-cicd-and-stage-the-production-cutover).
- [x] F11.1a — Provide independent read-only SQLite journal inventory and digest-pinned image-owned capability observation helpers, with generated-command fixtures and watched omission proofs. These helpers do not activate Kubernetes replay admission.
- [x] F11.1b — Wire the replay coordinator without cutover activation.
  - [x] TDD forward and rollback receipts, phase ordering, exact image and inventory validation, and resume refusal.
  - [x] Bound read-only inventory/image Jobs, verify reused manifests, and retain explicit rollback failure evidence.
  - [x] Watch production-path omission faults and record focused tests, scoped Nx checks, strict OpenSpec and limitations.
  - [x] Repair Astra P1/P2: pin effective mount options including omitted subpaths, and require prior forward evidence for recovery-required before disk parsing permits takeover.
- [x] F11.1c — Guard cutover export and restore replay compatibility without first-start activation.
  - [x] TDD generated-command SQLite export admission and descriptor/digest-bound evidence.
  - [x] TDD incoming restore admission before rename, legacy report refusal and stale-marker retry refusal.
  - [x] Carry descriptor evidence through CLI/rehearsal callers and prepare all Deployments at zero.
  - [x] Coordinate delete_state_v1 inventory/allowlists with the deletion slice; prove nested own markers, legacy rows and unsupported image refusal.
  - [x] Watch omission negatives and record scoped test/lint/typecheck/format/OpenSpec checks.
- [ ] F11.1d — Implement first-start scale/release-record/Flux admission, then observe live acceptance before cutover activation.
- [ ] F11.1 — Before guarded-history import or first rollout, implement the [Kubernetes replay capability prerequisite](../add-step-node-blocking/design.md#kubernetes-pre-cutover-obligation), including rollback refusal before writer reopening and watched nested-marker omission proofs.
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
