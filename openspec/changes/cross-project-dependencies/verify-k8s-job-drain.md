# Owned backup Job drain correction

Base: `3080d3f2e`. Isolated checkout: `/tmp/k3s-drain-fix`. This restores the
existing bounded UID-descendant drain contract after exact-head rehearsal
`39892524289` exposed active Job reconciliation and an insufficient lab grace budget.
No push, activation, production rollout or shared-host modification is included.

The previous drain deleted Pods while their Job was active. The controller could
replace those Pods, and the former instantaneous-deletion fixtures concealed this.
The new regression models an active reconciling Job, delayed ordinary Pod
termination and an unrelated non-controller bystander. It failed the old production
drain with bounded nonconvergence, then passed with the fix. A second case models
the Job controller starting Pod termination itself.

Complete unfiltered Job and Pod preflight refuses foreign source consumers before
any owned Job mutation. The mounted writable/readonly cases also seed an owned
Job and assert zero Job patches, deletion, source capture and schema reversal;
removing preflight independently fails both mounted cases. Owned Jobs receive an atomic JSON Patch testing UID, resourceVersion, complete
ownerReferences and spec before `spec.suspend=true`. Full identity/spec readback
precedes fresh Pod inventory; each deletion rechecks the suspended Job and current
CronJob ownership under the Lease. Already terminating Pods are waited for. Deletes
retain UID preconditions, orphan propagation and ordinary grace. Two successive
fresh inventories must contain zero owned descendants. Exhaustion names the last
observed surviving Jobs/Pods with phase, deletion timestamp and finalizers plus the
attempt count. Output includes at most 20 resources and 1000 detail characters per
resource, with an explicit omitted count. Existing mounted interruption tests retain the
journal, suspension and parked Lease, and prevent capture/schema reversal.

Independent production faults were injected one at a time and restored afterward:

| Fault                                       | Observed failing regression                            |
| ------------------------------------------- | ------------------------------------------------------ |
| Change Job suspension patch to false        | reconciling Job regression refuses readback            |
| Remove Job readback identity/spec assertion | Job readback fault reaches forbidden deletion          |
| Remove UID CAS test                         | UID race changes Job suspension                        |
| Remove resourceVersion CAS test             | resourceVersion race changes Job suspension            |
| Remove owner-reference CAS test             | ownerReferences race changes Job suspension            |
| Remove spec CAS test                        | spec race changes Job suspension                       |
| Remove subsequent Job revalidation          | revalidation fault reaches forbidden deletion          |
| Delete already terminating Pods             | controller termination case rejects repeat deletion    |
| Remove survivor names                       | timeout diagnostic regression loses exact Job identity |

Three further faults removed timeout details, accepted only one empty inventory,
and counted no delete targets as no survivors; each failed its diagnostic or delayed
termination assertion. These last faults ran in a separate isolated copy of the
production module to avoid changing source during the configured suite.

Removing the complete Pod preflight independently reproduced a child Job patch
before foreign-Pod refusal; the new preflight negative failed that mutation too.

Removing either the per-resource metadata limit or the 20-resource output limit
also failed the bounded diagnostic regression, using 25 retained Jobs with long
finalizer strings.

All fifteen independent fault variants produced command exit 1 for the named assertion/refusal, not a missing
tool or syntax failure. Primitive negatives also cover lost Lease, foreign source
consumers, NotFound and Forbidden. Adjacent `Proof:` comments name the fault cases.

## Verification

- `BUN_TMPDIR=/tmp bun install --frozen-lockfile`: passed, 1801 installs checked.
- `bun test tools/tool-deploy/src/k8s/controller-lifecycle.test.ts`: 38 passed,
  zero failed.
- Initial focused lifecycle plus mounted release run: 72 passed, zero failed.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-deploy:lint`: passed.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-deploy:typecheck`: passed.
- Changed-file `bunx prettier --check`: passed; final documentation formatting is
  checked again before commit.
- `bunx openspec validate --all --json`: 271 passed, zero failed (253 changes,
  18 specs); existing warnings remain visible in validator output.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-deploy:test`, with
  approved loopback fixture access: 1306 passed, zero failed, 41 files, 210 seconds.
  The final run used the complete preflight and corrected final-boundary fixture
  timing. Supplementary mounted foreign-consumer tests passed with zero Job
  patch/delete/source effects. The initial
  restricted-sandbox run had 1274 passed, 24 failed and one error. The failed
  registry/Git/backup HTTP fixtures reported `EPERM: operation not permitted, listen`
  (for example `fake-registry.ts:31`); those are unavailable socket capability, not
  successful checks.

The default Nx invocation hit sandbox socket refusal and exited without executing
targets. That output is discarded; the explicit daemon/plugin isolation settings
above produced actual target execution and success summaries.

## Limits and remaining evidence

The disposable lab now seeds an actual CronJob-owned active Job from the deployed
backup template, waits for a ready Pod, and runs a Bun process with a three-second
SIGTERM delay. Its drain setting is 60,000 ms: the existing adapter derives 63
inventory attempts separated by one-second sleeps; transport duration is additional
and each call retains the existing bounded subprocess timeout. The coordinator
still performs ordinary graceful Pod deletion, followed by Job orphan deletion.

The real k3s lab was not run here: `kubectl` and `k3d` are absent. The Docker CLI alone is
present; Docker daemon availability was not checked. No h2puni/h4claw gate or full repository build was run. These are explicitly
unverified; the revised lab setup itself still needs exact-head live evidence on a
host with the required isolated toolchain.

The transport returns strings or an untyped kubectl error. It does not expose a
reliable typed API 404. All NotFound, conflict, authorization and transport failures
therefore refuse and retain recovery authority; stderr is never parsed to grant
absence. Fresh post-suspension inventory and waiting already terminating Pods
reduce expected deletion races, but concurrent API disappearance after inventory
can still park the interval. This fix does not establish continuous fencing against
arbitrary external spec changes after the last readback.
