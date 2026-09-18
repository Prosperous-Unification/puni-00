# WBS deployment on k3s

The WBS release on k3s is one journaled transaction run by the coordinator in
`tools/tool-deploy/src/k8s/`. Flux keeps reconciling the platform the whole time. Only the
named WBS Kustomization is suspended, and only for the length of the transaction. The
transaction exists because SQLite allows one writer: running the migration, rolling out the
tiers and proving they work cannot be left to Flux.

- Manifests: `deploy/k8s/wbs/base` plus `overlays/{local,staging,prod}`.
- State machine: `planRelease` in `tools/tool-deploy/src/k8s/release.ts`.
- Effects: `kubectlEffects` in `tools/tool-deploy/src/k8s/execute.ts`.
- Journal: `fileJournal` in `tools/tool-deploy/src/k8s/journal.ts`.
- Contract: [F8](../superpowers/plans/2026-09-17-k3s-fleet.md#f8--build-the-wbs-kubernetes-release-transaction)
  and the [OpenSpec packet](../../openspec/changes/k3s-wbs-delivery/proposal.md).

## Commands

```sh
bunx nx run tool-deploy:deploy:k3s -- --request <request.json> --journal <dir>/release.json          # plan only
bunx nx run tool-deploy:deploy:k3s -- --request <request.json> --journal <dir>/release.json --apply  # run or resume
bunx nx run tool-deploy:test:k3s                                                                     # disposable k3d rehearsal
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
validate identity/admission → acquire Lease → persist intent → suspend WBS Flux unit
→ close writes → drain gateway → stop backend, prove no writer
→ capture migrations + VACUUM INTO snapshot (integrity_check, sha256) → migration Job
→ backend ready → gateway/frontend/MCP ready → smoke Job → persist release record
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
- **Before writes reopen**, any failure rolls back. The coordinator stops the writer, checks
  that the `down.sql` hashes match what capture recorded, runs
  `migrate-down-cli --to=<baseline>`, checks that the applied set equals the captured one,
  restores the old digests, smoke-tests them, and only then reopens writes. A restart before `smoke-passed`
  rolls back. From `smoke-passed` on, a restart finishes the release.
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

## What is and is not proven

`openspec/changes/k3s-wbs-delivery/verify.md` records each run, with its command, SHA,
result and injected faults. k3d proves the transaction, the write fence, the single writer
and admission of the exact runtime directory. It cannot prove a real solve through the
host supervisor, socket replacement and reconnect, the Hetzner CSI access mode, Flux
suspend and resume against a live source, or OIDC auth. Staging and production are
plan-only until F11.
