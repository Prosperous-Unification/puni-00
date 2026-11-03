# Kubernetes storage readback prerequisite evidence

This packet implements task 10.2-B2a from the reviewed Kubernetes dependency admission plan. It deliberately stops at observational storage/controller readback. B2, B3 and parent task 10.2 remain open.

## Scope and production boundary

`kubectlEffects.inspectStorageFence` calls the production `inspectStorageFence` implementation with the normal kubectl context, kubeconfig, namespace and bounded command execution. It makes only GET requests. It binds PVC/PV UIDs, bound volume/claim identities and canonical database path; reads the fenced policy and backend/Flux state; lists Pods without writer labels and standard workload templates; rejects live/terminating source consumers and unexcluded source controllers; records owner UIDs and template hashes; re-reads storage identities; and compares subsequent observations with earlier evidence.

Known source controllers are the stopped backend Deployment, stopped ReplicaSets owned by that exact Deployment UID, suspended `sqlite-backup` CronJob and terminal Jobs. Scratch verification controllers are classified by their actual volumes. Live read-only source consumers refuse because this packet has no runtime mount proof for arbitrary readers. Unknown source controllers refuse even if their template declares read-only mounts. Source volume devices refuse. Pod main/init/ephemeral containers are inspected.

No release transaction, journal version, scanner invocation, migration, rollout, rollback, controller mutation or restoration changes. This helper grants no admission or restoration authority. Existing rollback behavior remains outside the new helper. It is not a continuously enforced stopped-storage interval: standard-resource inspection does not prevent trusted control-plane actors or custom controllers from creating a consumer after readback.

## TDD and fault proofs

The initial inspection stub failed the positive production-helper tests. Adding adapter coverage failed with `effects.inspectStorageFence is not a function` before adapter wiring. Later red tests observed acceptance of a PVC replacement during inventory, live reader lacking runtime proof, and terminal source Pods with missing UID/foreign namespace; the corresponding production guards made them refuse.

The focused suite exercises missing and unreadable GET dependencies separately; malformed trusted objects/lists; PVC bound state and PV claim UID; policy/backend/Flux readbacks; unlabeled writable Pods including init/ephemeral access and terminating phases; source devices; unknown controllers; known backend ReplicaSet owner/replica drift; terminal Job evidence; UID/template drift between observations; and replacement during inventory. Its real kubectl adapter test launches an executable fake control plane through the production subprocess adapter, accepts the valid fixture, rejects an unlabeled backup Pod, and propagates Forbidden inventory readback.

Twenty-one separate temporary production faults were watched through the focused suite and restored afterward: remove PVC Bound check, PV binding check, fenced-policy check, backend desired-zero check, backend actual-zero check, Flux suspension check, writable-consumer refusal, live-reader refusal, source-device refusal, unknown-owner refusal, final storage recheck, earlier-observation comparison, deleting-identity refusal, init inspection, ephemeral inspection, Pod inventory, source-Pod UID read, source-Pod namespace check, backend ReplicaSet owner check, Job terminal check, and duplicate-source-volume check. Every mutation caused a named behavior assertion to fail rather than a syntax/import failure. Adjacent `Proof:` comments identify the safety checks and observed failures.

## Commands and results

- Focused: `bun test --preload ../test/scratch/preload.ts --timeout=10000 src/k8s/storage-fence.test.ts`, from `tools/tool-deploy`.
- Configured: `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-deploy:{test,lint,typecheck,build}` (each target invoked separately).
- OpenSpec: `bunx openspec validate --all --json`.
- Formatting: Prettier checks the changed TypeScript and OpenSpec files.
- Hooks: installed with `bunx nx run tool-git-hooks:install`; the final commit runs the configured hooks.

The initial sandboxed configured test run reported loopback `listen` EPERM failures. The suite then passed with local socket permission (980 passed, zero failed). After the final negative test additions, the focused storage suite passed 59/59 with 72 assertions; lint, typecheck and build passed; OpenSpec validated 268/268 artifacts; and changed-file Prettier plus `git diff --check` passed.

The later configured full run reported 986 passed and one failure: the unrelated `first-start-adapter.test.ts` “fresh actual SQLite observation requires replay and disabled exact authority: none” fixture exceeded its fixed 10-second timeout. That fixture took 6024ms in the earlier passing configured run; a focused retry also exceeded 10 seconds while host load was 13.78. No timeout or unrelated test was weakened. The last full run is **not green**. The coordinator explicitly authorized committing this bounded packet with that limitation; later CI/host acceptance determines integration readiness.

## Remaining B2 and unverified acceptance

Durably record exact backup/controller UIDs and original suspension state before mutation; suspend/read back and bound-drain existing Jobs/Pods; persist the barrier in journal/state with a single B2/B3 schema integration; recheck before/after every scan and schema/exposure boundary; admit only the coordinator's exact writable schema Job while it runs; restore only transaction-owned states after normal promotion or admitted dormant restoration; retain barriers and Lease on uncertainty. These require the B3 forward/recovery classification to remain coherent; this packet enables no scan under an incomplete barrier.

No live k3s rehearsal, effective runtime mount acceptance, host-wide exact-SHA h2/h4 gate, deployment or activation was performed for this observational packet. They remain unverified integration acceptance. No store/participant authority or semantic activation receipt is issued here.
