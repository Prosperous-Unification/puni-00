# WBS deployment on k3s

Operator commands and what has been tested: [infrastructure operator guide](README.md).

The WBS release on k3s is one journaled transaction run by the coordinator in
`tools/tool-deploy/src/k8s/`. Flux keeps reconciling the platform the whole time. Only the
named WBS Kustomization is suspended, and only for the length of the transaction. The
transaction exists because SQLite allows one writer: running the migration, rolling out the
tiers and proving they work cannot be left to Flux.

- Manifests: `deploy/k8s/wbs/base` plus `overlays/{local,staging,prod}`.
- State machine: `planRelease` in `tools/tool-deploy/src/k8s/release.ts`.
- Effects: `kubectlEffects` in `tools/tool-deploy/src/k8s/execute.ts`.
- Journal: `fileJournal` in `tools/tool-deploy/src/k8s/journal.ts`.
- Release descriptor and promotion: `descriptor.ts` and `promotion.ts` beside them.
- First Compose → k3s move: [cutover plan](cutover-plan.md), `cutover.ts`.
- Contract: [F8](../superpowers/plans/2026-09-17-k3s-fleet.md#f8--build-the-wbs-kubernetes-release-transaction)
  and the [OpenSpec packet](../../openspec/changes/k3s-wbs-delivery/proposal.md).

## Commands

```sh
bunx nx run tool-deploy:deploy:k3s -- --request <request.json> --journal <dir>/release.json          # plan only
bunx nx run tool-deploy:deploy:k3s -- --request <request.json> --journal <dir>/release.json --apply  # run or resume
bunx nx run tool-deploy:test:k3s                                                                     # disposable k3d rehearsal
bunx nx run tool-deploy:rehearse:cutover                                                             # Compose → k3d cutover rehearsal
bunx nx run tool-deploy:descriptor -- seal --candidate <release.json> --admission <admission.json> --gate-run <run.json> --out <descriptor.json> --repository <clone> --main-ref <ref>
```

Staging and prod do not take a hand-written request. `deploy:k3s` builds it from a sealed
descriptor (below):

```sh
bunx nx run tool-deploy:deploy:k3s -- --descriptor <descriptor.json> --descriptor-sha256 <hex> \
  --admission <admission.json> --environment staging|prod --context <ctx> --cluster-uid <uid> \
  --state <0700 dir> --deploy-repo <clone> [--apply]
```

`<request.json>` is a `ReleaseRequest`. It carries the cluster context and `kube-system` UID,
the namespaces, the target and expected-current `ReleaseIdentity` (source SHA plus one
digest per tier), the P5 admission identities, and the Flux unit together with the desired
deploy-repository revision. The Flux unit may be `null` only for `local`. Running the same
command again resumes whatever the journal records. The journal directory also holds the
rendered Job manifests that manual commands refer to, so it must be persistent and
owner-only.

`test:k3s` needs the locked `k3d` and `kubectl` (set `K3D`/`KUBECTL`) and Docker, plus about
3 GiB of free RAM. It creates `puni-f8-lab` and `k3d-puni-f8-registry` and deletes both at the
end. `--keep` leaves them in place for inspection.

## The transaction

```text
validate identity/admission → acquire Lease → persist intent → admit rollback + candidate digests
→ suspend WBS Flux unit
→ close writes → drain gateway → stop backend, prove no writer
→ capture migrations + VACUUM INTO snapshot (integrity_check, sha256) → migration Job
→ backend ready → gateway/frontend/MCP ready → smoke Job
→ publish desired deploy revision (Flux) + persist release record
→ reopen writes → reconcile desired revision → resume Flux → release Lease
```

- **Write fence.** The NetworkPolicy `wbs-solver/wbs-backend-writers` lets Traefik and MCP
  reach the backend. Closing writes repoints its `podSelector` at nothing, and reopening
  points it back at the backend. Readers (gateway health and replay, the smoke Job) have
  their own policy and stay allowed. The fence lives in the cluster, so it survives the
  coordinator dying.
- **Single writer.** The backend runs one replica with `Recreate`. Backend pods and schema
  Jobs carry `puni.dev/writer=true`. The coordinator starts a schema Job or a rollout only
  after it has seen zero pods with that label. A schema Job has `backoffLimit: 0` and
  `podReplacementPolicy: Failed`, and a crashed run reuses the Job it already created. After
  a migration, the coordinator checks the applied set against the captured plan, not against
  Job completion.
- **Lease.** The holder is `<transaction>#<process>`. The Lease is renewed before every step
  and on a heartbeat, and lapses after 20 s (local) or 120 s (staging/prod) without renewal.
  A second coordinator is refused while the holder is live. A restarted coordinator waits
  for its dead predecessor's Lease to lapse, then takes it over. It never takes over another
  transaction's Lease. Terminal failures park the Lease for an operator or recovery.
- **Admission.** Before any backend pod starts, the coordinator writes F6's `solverImages`
  list with the candidate digest first, then the rollback digest (the F6 contract in
  [platform](platform.md#trusted-image-ownership)); the WBS manifests never carry that ConfigMap,
  so CD cannot regenerate it from Git.
- **Before writes reopen**, any failure rolls back. The coordinator stops the writer, checks
  that the `down.sql` hashes match what capture recorded, runs
  `migrate-down-cli --to=<baseline>`, checks that the applied set equals the captured one,
  restores the old digests, smoke-tests them, and only then reopens writes. A restart before `smoke-passed`
  rolls back. From `smoke-passed` on, a restart finishes the release.
- **Flux after rollback.** Flux resumes only onto `flux.previousRevision`. If the deploy
  repository already serves the failed release, the run ends at `flux-revert-required`. The
  old release is then serving with writes open and Flux suspended. The report names the
  revert and the exact resume command.
- **A failed rollback** ends at `rollback-failed`. Writes stay fenced, Flux stays suspended
  and the Lease stays held. The report prints the journal path, the captured migration set,
  the snapshot, and the exact manual command, for example
  `kubectl --context <ctx> create -f <dir>/wbs-manual-rollback-<id>.json`. Every later run
  refuses with the same command.
- **After writes reopen**, a failure ends at `recovery-required`. The coordinator does not
  roll back to the old image, because that would drop writes users have already been told
  succeeded. Recovery is a new request with `recovers=<release id>`. It runs the whole
  transaction again with a fresh capture and never reuses the stale snapshot.

## Solver ownership

The backend runs in F6's trusted `wbs-solver` namespace. It mounts the host-owned supervisor's
runtime directory `/run/puni/solver` as a `Directory` hostPath at `/run/wbs-solver`, which is
the path `be-01` dials. It never mounts the socket inode itself. Placement is pinned to
`puni.dev/capability-product=true`. Ansible still manages the supervisor on that node
(`deploy/solver-supervisor/`). A node running the supervisor cannot be retired until the
solver runtime has been transferred to another node.

## Release descriptor and promotion

A release descriptor is the immutable unit staging proves and production promotes. It holds the
source SHA, one digest-pinned image per tier, the `ci` run whose `gate` and `pixels` jobs passed
on that SHA, and the P5 package and activation identities. The staging candidate is Dagger's
`dist/tool-dagger/release.json` (`be`, `gw`, `fe`) plus an `mcp` entry of the same shape; every
entry's `sha` must equal the source. Dagger labels each image `WBS_SHA`, and `descriptor-cli`
(staging seal, prod re-check) and `deploy:k3s` read that label by digest from the registry and
require the source commit, so the digests themselves, not a claim about them, are bound to the
commit admission certified. The gate run must be a push to `main`, and the source must be on
`origin/main`'s history. `sealDescriptor` joins every tier digest to the trusted `admission.json`
through `requireDeploymentAdmission` (`@tools/bureaucrat-consumer`); a launcher report, an
admission for another commit, a tag instead of a digest, or a failed gate or browser job seals
nothing. Its identity is the SHA-256 of its canonical JSON.

`deploy:k3s --descriptor` then:

- re-admits: the admission record from this run must name the descriptor's exact package and
  activation, so an activation changed since staging blocks production;
- for prod, requires `<state>/staging/proofs/<sha256>.json`, written only when a staging
  promotion of the same descriptor reached `lease-released`, with identical digests per tier,
  at most `--max-proof-age-days` (14) old; production never rebuilds, and refuses a source that
  is an ancestor of the running one unless `--allow-downgrade`;
- refuses a state directory that is relative, missing, not owner-only (0700) or owned by
  another user; journals, generated requests, descriptors and staging proofs live there;
- reads the cluster UID and current release record, prepares (without pushing) a
  deploy-repository commit pinning the release, and builds the request; a resumed journal
  reuses the request it recorded and refuses a different cluster or admission;
- keeps the prepared commit at `refs/wbs/desired/<release>` and pushes it in `persist-release`,
  before writes reopen, only while the WBS Flux unit reports suspended, and only from
  `flux.previousRevision` (a branch moved by someone else is refused); a failed push rolls back
  or ends `flux-revert-required`, never `recovery-required`;
- `--recovers <release id>` (dispatch input `recovers`) turns the run into the recovery
  request for a `recovery-required` release.

## CI/CD

`.github/workflows/infra-check.yml` runs on pull requests touching infra, deploy or the two
tools, on GitHub-hosted `ubuntu-latest` with a read-only token and no secrets, variables or
environments: `tool-fleet:check` (after building the locked controller image) and the k3d
release rehearsal. `.github/workflows/deploy-k3s.yml` is a manual dispatch from `main` with
inputs environment, cluster context, the staging candidate or the prod descriptor identity,
and `apply` (default false, which plans):

| Job         | Runner                     | Credentials                                | Runs                                                                                   |
| ----------- | -------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------- |
| `resolve`   | `ubuntu-latest`            | `GITHUB_TOKEN` read                        | refuses any ref but main; names the source (prod: the staging run's descriptor)        |
| `admission` | `ubuntu-latest`            | none                                       | base-owned package bootstrap, then candidate checkout, `admit.sh`; uploads `admission` |
| `describe`  | `ubuntu-latest`            | `GITHUB_TOKEN` read, `REGISTRY_READ_AUTH`  | main's code seals (staging) or re-checks (prod) against the `ci` run; uploads it       |
| `deploy`    | `self-hosted, puni-deploy` | environment secrets, protected environment | main's code only; `deploy:k3s --descriptor`, journal in `vars.PUNI_DEPLOY_STATE`       |

Candidate code runs only in `admission`, on an ephemeral runner, after the trusted package is
installed, with main's `.bun-version`. The admission route must be `installed-package`; the
`archive-launcher` route writes no `admission.json` and is refused.

Setup outside Git, all required:

- GitHub environments `staging` and `prod`: required reviewers, deployment branch `main`.
  Environment secrets `KUBECONFIG_B64`, `DEPLOY_REPO_SSH_KEY`, `REGISTRY_READ_AUTH`
  (`user:password`, read-only); variables `PUNI_DEPLOY_STATE` (the persistent 0700 directory on
  the runner), `PUNI_DEPLOY_REPO_URL`, `PUNI_DEPLOY_REPO_KNOWN_HOSTS` (the deploy host's pinned
  `known_hosts` lines), `PUNI_CLUSTER_UID`, `PUNI_KUBECTL` (the locked kubectl). Repository
  secret `REGISTRY_READ_AUTH` for `describe`.
- The `puni-deploy` runner in its own runner group, restricted to this repository and to the
  workflow `.github/workflows/deploy-k3s.yml@refs/heads/main` (runner group "selected
  workflows"). Because any workflow file can name the runner's labels, the runner also installs
  the checked-in hook: in the runner's `.env`, set
  `ACTIONS_RUNNER_HOOK_JOB_STARTED=<absolute path>/infra/ci/deploy-runner/job-started.sh` from a
  root-owned copy of `main`, and `PUNI_DEPLOY_REPOSITORY=<owner>/<repo>`. The hook fails every
  job whose `GITHUB_WORKFLOW_REF` is not `<owner>/<repo>/.github/workflows/deploy-k3s.yml@refs/heads/main`.

## What is and is not proven

`openspec/changes/k3s-wbs-delivery/verify.md` records each run, with its command, SHA,
result and injected faults. k3d proves the transaction, the write fence, the single writer
and admission of the exact runtime directory. It cannot prove a real solve through the
host supervisor, socket replacement and reconnect, the Hetzner CSI access mode, Flux
suspend and resume against a live source, or OIDC auth. F11 adds unit and workflow-block
proofs for the descriptor, admission, promotion and publish guards, and a live Compose → k3d
cutover rehearsal; no staging or production run has happened, so the workflows themselves,
the protected environment and the deploy runner are unexercised.
