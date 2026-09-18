# Twilight Bureaucrat and k3s Fleet Implementation Plan

> **For agentic workers:** Use `executing-plans` to execute one numbered task at a time. Steps use checkboxes. This is a handoff for a medium-effort Sol model; read the contract and the selected track before editing.

**Goal:** Publish `twilight-bureaucrat` as an independently installable npm package, consume it in CI/CD, and deliver Ansible-managed k3s infrastructure that supports nodes joining, leaving and being replaced.

**Architecture:** The package owns reusable validation and activation machinery; each consumer owns policy and evidence. Ansible manages hosts and cluster membership, Flux manages long-lived platform resources, and a release coordinator owns WBS's stateful deployment sequence. Fleet operations reconcile desired capabilities against fresh provider and cluster observations.

**Tech stack:** Bun 1.4.2, Nx 23.2.0, existing ArkType and TypeScript pins, Ansible, k3s, Flux, SOPS/age, Traefik, cert-manager, ECK/Elastic, Prometheus, OpenTelemetry, existing Dagger image builds.

**Spec:** [Delivery contract](../specs/2026-09-17-twilight-bureaucrat-and-fleet-design.md).

## Global constraints

- k3s begins in the first infrastructure implementation stage. There is no Compose-first implementation phase.
- Bun and Nx are the only JavaScript package manager and task runner. “npm package” means registry distribution, not use of the npm CLI.
- No package install, release, node discovery or successful process exit certifies repository content by itself.
- Missing, unreadable, malformed or stale required state fails closed. Every changed safety check needs an observed production-path negative and an adjacent `Proof:` comment.
- Keep production credentials away from candidate PR execution and worker Jobs.
- Do not rename existing stored evidence identities or mutate immutable activations as part of the product rename.
- Do not provision paid machines, publish the package, change DNS, delete hosts or cut over production merely by executing a plan/check command. Explicit apply operations name a reviewed immutable operation plan.
- Preserve the current source-run development experience; migrate its hosting to k3s without making image rebuilds mandatory for every edit.

## Synced baseline and scope

The sync merge is `560768451eed61f5ee1601f3aa5d166e1d8b04b8`, with parents
`5de05cfabd6d4c65eb75624bc6cafbfbda728636` (puni-00) and
`977dbcbca75f296db91fc9cc1d4ed43db83e2a0c` (wbs-tool-v1).
Use this merge or a descendant. Do not begin from the September 15 paths.

Observed at that merge:

- Implementation: `apps/wiki/cli`, Nx project `wiki-cli`; neutral validation helpers already live in `libs/shared/domain/validation`.
- Distribution: `wiki-cli:release`, `.github/workflows/wiki-release.yml`, `apps/wiki/consumer/`, a toolkit tar with its preparer and trusted TypeScript closure. There is no publishable npm manifest yet.
- Consumers: `.github/workflows/{ci,trusted-wiki}.yml`, `bin/tool-wiki-{lint,push-audit}.sh`, `bin/h2puni-gate*.sh`, `lefthook.yml`.
- Activation remains bound to a consumer commit. The reusable package is not an activation. The exhaustive freeze/adoption tasks 6.1 and 7.5 remain unchecked in `openspec/changes/agent-scalable-llm-wiki/tasks.md`; verify their actual state before moving source.
- Existing operations: `tools/tool-{bootstrap,compose,dagger,deploy,devsync,remote-scripts,smoke,secrets}`, `deploy/compose`, `deploy/dev-src`, `deploy/solver-supervisor`.
- No checked-in `infra/` implementation exists. The September 15 infra proposal and both reviews were preserved in `prototype/langgraph-harness` commit `9446fea8`, merged at `b9207ed9`. This handoff reuses that design explicitly; see the contract's reuse map.

The user explicitly authorized preserving and merging the harness, its dependency pins and infra drafts. That merge is included. Do not reset or overwrite subsequent unrelated work in the original checkout.

## Execution order

| Track                                                          | Tasks  | Dependency                       | Deliverable                                                                                               |
| -------------------------------------------------------------- | ------ | -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [Package and CI/CD](2026-09-17-twilight-bureaucrat-package.md) | P0–P5  | Synced baseline                  | Standalone tested tarball, registry release workflow, consumer adoption with preserved trust              |
| [Fleet and deployment](2026-09-17-k3s-fleet.md)                | F0–F12 | Synced baseline; F11 consumes P5 | Dynamic inventory, Ansible roles/playbooks, local clusters, platform, deployments, lifecycle and recovery |

Start P0 and F0, then finish P1–P4 and F1–F8. P5 must precede the final production delivery checks in F11. These tracks may be implemented in separate branches if their task owners are explicit; never have two sessions edit the same file. No parallel agents are required.

## How to execute a task

1. Read `AGENTS.md`, the contract, that task's files and their callers/tests.
2. Check the previous task's declared output exists. Refuse a missing dependency instead of inventing its shape.
3. Write the listed behavior tests. Observe the intended failure, implement the narrow change, and rerun the focused target. For a safety guard, remove/break it temporarily and observe the actual production-path test fail; restore it before committing.
4. Record command, commit, exit status, assertion and fault in the change's `verify.md`. Never prewrite a passing result or a `Proof:`.
5. Commit named files with hooks enabled. One task can use several small commits, but cannot be marked complete while a listed outcome is unverified.
6. Run the consumer full gate at package adoption and before deployment. On h2puni use `bin/h2puni-gate.sh <sha>`; let it check out the SHA under the host lock. Browser, package-install, Ansible convergence and real-cluster drills are separate required checks, not implied by that gate.

## OpenSpec packets

P0 creates `twilight-bureaucrat-package` and `twilight-bureaucrat-consumer`.
F0 creates `k3s-fleet`, `k3s-platform`, and `k3s-wbs-delivery`.
Each uses the repo's `sdd-lean` schema: intent in `proposal.md` (at most 400 words), testable delta specs, ordered TDD `tasks.md`, and factual `verify.md`; these changes also need `design.md` for their non-trivial shape.
The contract's numbered requirements map directly to those packets. The track plans contain the task details; OpenSpec tasks link to them instead of duplicating instructions.

```sh
bunx @fission-ai/openspec@1.12.0 new change twilight-bureaucrat-package
bunx @fission-ai/openspec@1.12.0 status --change twilight-bureaucrat-package --json
bunx @fission-ai/openspec@1.12.0 instructions intent --change twilight-bureaucrat-package --json
```

Repeat for each named packet, using `instructions` for the schema's remaining artifact IDs. Validate the structured report, not just the command's exit code:

```sh
set -euo pipefail
bunx @fission-ai/openspec@1.12.0 validate --all --json |
  jq -e '.summary.totals.failed == 0 and .summary.totals.passed > 0'
```

## Completion evidence

- P4: a tarball installs in a clean repository outside this checkout and validates its fixture; no monorepo source or aliases are available there.
- P5: actual consumer CI uses the released package; malicious candidate changes cannot change its trusted validator, pin or activation.
- F3/F4: an arbitrary new node joins the intended cluster through inventory alone; a second Ansible run converges with no unexplained changes.
- F5: one joined node drains and retires, another vanishes and is safely replaced, and loss of the last required capability is refused.
- F8/F9: database restore, failed rollout rollback, and source-run dev on k3s work in the local lab.
- F10: cold cluster recovery restores both infrastructure and application state; destroying only a disposable lab is sufficient for this stage.
- F11: staged image digest, exact commit checks and migration/rollback evidence bind the production promotion.
- F12: operators can follow the documented laptop, node-add, node-remove, upgrade, deployment and recovery commands without hidden state on the author's machine.

## Handoff prompt

> Execute `docs/superpowers/plans/2026-09-17-twilight-bureaucrat-and-fleet.md` using `executing-plans`, one task at a time. Start from sync commit `56076845` or a descendant. Target k3s immediately and model fleet membership dynamically. Read the linked contract and track before each task. Use Bun/Nx, preserve trusted activation semantics, run production-path negatives for safety checks, and record observed evidence. Implement scripts, manifests and local rehearsals through completion. Only apply paid/public/destructive operations when specifically authorized for the exact operation plan. Report missing external inputs with the concrete prepared artifact; do not substitute a fixed-host or Compose-first design.

## Status

As of 2026-09-18. Open means some implementation or required real-world acceptance has not
run; the linked `verify.md` and its `tasks.md` name what is missing and the next command. No
packet is archived.

[pkg]: ../../../openspec/changes/twilight-bureaucrat-package/verify.md
[consumer]: ../../../openspec/changes/twilight-bureaucrat-consumer/verify.md
[fleet]: ../../../openspec/changes/k3s-fleet/verify.md
[platform]: ../../../openspec/changes/k3s-platform/verify.md
[delivery]: ../../../openspec/changes/k3s-wbs-delivery/verify.md

| Task  | State | Evidence                  | Open                                                                                  |
| ----- | ----- | ------------------------- | ------------------------------------------------------------------------------------- |
| P0–P3 | done  | [package][pkg]            |                                                                                       |
| P4    | open  | [package][pkg]            | registry publication (license, npm ownership, release environment, tag)               |
| P5    | open  | [consumer][consumer]      | lock and activation flip after P4, h2puni gate, real CI runs                          |
| F0–F2 | done  | [fleet][fleet]            | production discovery has never run live                                               |
| F3    | done  | [fleet][fleet]            | QEMU/KVM lab only; Multipass provider and Hetzner MTU not run                         |
| F4    | open  | [fleet][fleet]            | remote Terragrunt backend and a paid hcloud node                                      |
| F5    | open  | [fleet][fleet]            | HA control-plane removal, live upgrade, PDB/local-PV/singleton drains                 |
| F6    | open  | [platform][platform]      | production registry adoption, staging ACME, production Flux bootstrap                 |
| F7    | open  | [platform][platform]      | OTLP mTLS, real receivers and buckets, escrow check, production-storage drills        |
| F8    | open  | [delivery][delivery]      | real solve from a k3s pod, Hetzner CSI access mode, OIDC smoke                        |
| F9    | open  | [platform][platform]      | full-graph `platform`/`fleet` measurement, per-environment namespaces                 |
| F10   | open  | [platform][platform]      | maintenance on real hosts, live `sqlite-backup-verify` in `wbs-solver`, hcloud Retain |
| F11   | open  | [delivery][delivery]      | GitHub Actions and staging runs, h2puni gate, authorized production cutover           |
| F12   | done  | [platform][platform], F12 | [operator guide](../../infra/README.md)                                               |
