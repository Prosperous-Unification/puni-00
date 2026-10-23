# Disposable real-Docker gateway exclusion acceptance (2026-10-23)

Task 10.1/10.2 now has real Docker/process/WebSocket evidence for the existing
managed Compose exclusion mechanism. This packet changes only an acceptance
runner, its fixture, the uncached Nx target and evidence. Parent tasks remain
open for integrated host gating and the broader participant/activation contract.

## Inputs and ownership

The runner requires `GATEWAY_EXCLUSION_IMAGE`, `GATEWAY_EXCLUSION_SHA` and an
absolute `GATEWAY_EXCLUSION_REPORT` outside its scratch root. It checks the exact
source HEAD and refuses an uninstalled image: every create uses `--pull=never`.
The tested image was the locally installed runtime
`docker.io/wbs-gw-01@sha256:d897ba9eb3835a79853211f3bee69a287327c704571bcbee0f667008a47c01f4`.
This proves the installed image's Bun/container runtime with the mounted probe;
it does not claim that the image contains this acceptance source revision.

Each run allocates a UUID project, canonical scratch state root, gateway name
prefix and bridge network. Probe containers have Compose identity labels, init,
private PID namespaces, UID/GID 65534, no capabilities, no privilege escalation,
read-only filesystems/fixture and loopback-only ephemeral published ports.
The unrelated bystander uses network `none`. It cannot share the gateway network:
production intentionally treats any gateway image on that network as managed.
No production roots, credentials, containers or networks are selected for effects.

Cleanup runs bounded Docker commands against only the full created container IDs
and network ID. Successful runs remove scratch; failed runs retain scratch and an
external report. Each retained report records successful exact resource cleanup.
Initial diagnostics established that this Docker engine leaves published ports
unmapped on an internal network; the fixture therefore uses a regular disposable
bridge with explicit loopback host bindings.

## Observed acceptance

The uncached configured `tool-remote-scripts:test:gateway-exclusion` target passed
on source `8abd0e98db8e3e9906d82b40598a0bed3d2da91b`, using local Docker engine
29.7.2 on pop-os. [The green report](evidence/gateway-exclusion-docker/green.json)
retains exact identities, intent bytes/hash, completion, process start identities,
nonce-bound WebSocket identities and cleanup receipt.

- Blue and green each challenged a parent and its direct child. The child survived
  SIGTERM with the same PID/start identity before fencing.
- The production `fenceGateways` disabled restart and stopped the exact two IDs.
  Receipts retained those IDs, their process start identity and intent byte hash;
  both were stopped with PID 0 and restart policy `no`.
- Every recorded host process identity disappeared. All six existing sessions
  closed; fresh parent and child challenges on both colors failed.
- `inspectGatewayFence` freshly matched the stopped receipt. An explicit external
  restart then made inspection refuse the historical receipt.
- The bystander's full State/restart policy and exact ID remained unchanged.
- A real no-init gateway was refused before publication; only deploy.lock existed.
  A separate empty layout proved an empty managed cohort.

## Watched R5 negatives

The [fault ledger](evidence/gateway-exclusion-docker/fault-ledger.json) names each
one-line injected fault at source `f0380f78ffddde5d9c0cf3504c6e2f062ab87d4a`.
Each real-Docker run exited 1 at the intended assertion, cleaned exact resources,
and restored the source before the next run. The later source commit adds only
adjacent observed `Proof:` comments. The restored configured target passed.

| Injected fault                                | Observed production-path failure                 | Evidence                                                                                                                                           |
| --------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Omit exact-ID stop                            | Running/PID exclusion refused completion         | [log](evidence/gateway-exclusion-docker/stop-omission.log), [report](evidence/gateway-exclusion-docker/stop-omission.json)                         |
| Omit init admission                           | No-init control completed instead of refusing    | [log](evidence/gateway-exclusion-docker/init-admission-omission.log), [report](evidence/gateway-exclusion-docker/init-admission-omission.json)     |
| Reuse historical completion during inspection | External restart was accepted instead of refused | [log](evidence/gateway-exclusion-docker/fresh-inspection-omission.log), [report](evidence/gateway-exclusion-docker/fresh-inspection-omission.json) |
| Suppress child spawn                          | Child WebSocket never became ready               | [log](evidence/gateway-exclusion-docker/absent-child.log), [report](evidence/gateway-exclusion-docker/absent-child.json)                           |

## Scoped verification and limits

- Configured uncached `tool-remote-scripts:lint` passed.
- Configured `tool-remote-scripts:typecheck` passed.
- Focused production `gateway-exclusion.test.ts` with the configured scratch
  preload passed: 65 tests, 282 assertions, zero failures.
- Changed-file Prettier and `git diff --check` passed.
- `openspec validate cross-project-dependencies --json` passed. Strict validation
  exited 1 on 18 existing long-requirement warnings; this packet edits no spec.
- The isolated exact integrated-SHA h2puni/h4claw full gate remains pending.
  The full remote-scripts test target/Caddy dependency was not run in this packet.
- This is disposable local Docker evidence, not live h2 production topology
  acceptance. No activation, admission behavior, ordinary swap, clearance,
  deployment or broader participant-exclusion authority changes here.

Reproduce from the tested source checkout with the installed pinned image:

```sh
GATEWAY_EXCLUSION_IMAGE=docker.io/wbs-gw-01@sha256:d897ba9eb3835a79853211f3bee69a287327c704571bcbee0f667008a47c01f4 \
GATEWAY_EXCLUSION_SHA=8abd0e98db8e3e9906d82b40598a0bed3d2da91b \
GATEWAY_EXCLUSION_REPORT=/tmp/gateway-exclusion-report.json \
bunx nx run tool-remote-scripts:test:gateway-exclusion
```

## Review correction: pending resource reconciliation (2026-10-23)

Astra High identified a daemon/CLI boundary gap: a create could complete at the
daemon while the CLI timed out before returning its full ID. The original runner
would then lack the ID and could incorrectly report cleanup complete. The
[watched pre-fix red](evidence/gateway-exclusion-docker/review-correction/red-ledger.json)
reproduced exactly that condition at `2f3efc3fa`: the report said complete while
one UUID-owned network remained. That exact network was inspected for its name
and ownership label, then removed explicitly by full ID.

Source `5e34d3b0dc610fc98d2b720f0b8f6cf874553ecd` persists pending UUID ownership
before either create request. Every disposable container now also carries the
unique `gateway-proof` label. Cleanup reconciles pending requests through bounded
inventories filtered by that exact label, validates exact registered names and
full IDs, then removes only those discovered/returned IDs. A final inventory must
be empty. Unresolved create requests, unknown names, failed reconciliation,
failed deletion or remaining resources make cleanup incomplete and the run fail.
An absent inventory does not resolve a request whose outcome remains unknown.

The [new stall ledger](evidence/gateway-exclusion-docker/review-correction/stall-ledger.json)
records three actual Docker CLI boundary faults. A wrapper completes the real
network or container create and stalls before returning stdout; the production
CLI deadline kills the stalled process. In both cases the runner discovers the
full ID, removes it and verifies no owned resources remain. An independent real
Docker inventory also verified that exact ID was gone. A third control stalls
before any create: no resource exists, but pending creation remains unresolved
and cleanup correctly reports incomplete. All three runs preserve the exact
State/restart policy of a separately UUID-owned unrelated container; the proof
then removes that control explicitly by its own full ID. The
[wrapper text](evidence/gateway-exclusion-docker/review-correction/docker-stall-wrapper.txt)
and per-run reports/logs are retained beside the ledger.

Source provenance is now explicit in every report. `sourceProvenance.verified`
is true only when the exact HEAD matches and tracked/untracked relevant source
paths are clean. Dirty acceptance source, production remote scripts, scratch
support, package/lock files or the base TypeScript config are listed and reported
as unverified; successful stdout also says `UNVERIFIED`. Fault injections that
edit production source therefore cannot silently claim clean-SHA provenance.

The original retained Nx log's carriage returns were normalized. Range-based
`git diff --check 420d7726e..HEAD` now passes; this includes already committed
artifacts rather than only the working-tree diff.

The corrected configured uncached acceptance passed at exact source `5e34d3b0d`
with clean verified provenance; its [green report](evidence/gateway-exclusion-docker/review-correction/green.json)
and [target log](evidence/gateway-exclusion-docker/review-correction/green.log)
are retained. The original stop/init/fresh-inspection/absent-child mutations were
rerun independently and all exited 1, with exact cleanup complete, followed by a
restored pass. Their reports explicitly mark the injected dirty source unverified.
An additional [untracked-source control](evidence/gateway-exclusion-docker/review-correction/untracked-source.json)
passed the physical acceptance while both report and stdout explicitly marked
source provenance unverified; removing that file restored verified provenance.
Configured uncached lint/typecheck, the restored 65-test/282-assertion focused
suite, changed-file formatting and range-based diff checks passed. A focused
suite run overlapping the intentional stop mutation observed its expected
failure; the reported green suite ran after restoration. Independent rereview
and integrated host gating remain pending.
