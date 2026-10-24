# Combined source exclusion host attempts

The owned source/managed/Caddy/solver fixture remains unverified. No production
service or application store has been changed by these attempts.

## First attempt

Exact `c2bb10d574a159aa38d76ebcd56e829a846fe16f` ran the reviewed
`tool-remote-scripts:test:source-exclusion` target under the canonical h2 heavy
lock, exit 1, 6.4 seconds. Its receipt records initialized backend SQLite writes
and fixture creation, then component failure before the source-tag negative
completed. Nested error context was not preserved in the outer receipt, so the
sole physical cause is not established by this failed packet.

A separate fresh native Docker observation confirms the source container's
optional `HostConfig.Init` key is absent. The previous decoder accepts explicit
null/false/true but rejects absence. A local production-decoder reproduction
confirms that mismatch. It is a plausible cause of this attempt, not proof that
no other issue remains. The separately reviewed correction must model source-only
absence without normalizing it, preserve private-PID/terminal checks and raw
identity drift, and add safe stage diagnostics before the next exact-SHA retry.

The private receipt SHA-256 is
`84e61164b1acfe93b1601be1f210ad79a557d5ab046f8c30d65fde005f5a6f47`.
Both component and solver cleanup report no failures. Independent queries confirm
absence for both fixture-container ownership labels, both labelled networks, the
exact temporary image tag and the exact unit link. Scratch files and the original
failure receipt remain private and retained. No `reset-failed` was used.

Positive combined acceptance, live adoption, activation, compatible restoration
and the final integrated gate remain open.

## Second attempt and native coordinate diagnosis

Exact `f68495625321dbc7db6c6aaf821bae666be595fe` ran the same reviewed
combined target under the canonical h2 heavy lock and exited 1 during
`fixture-tag-negative`. Descriptor-only diagnostics retained the nested
assertion hash. Comparing that hash against static assertion strings identified
`source physical coordinates changed`; no private error payload was published.
The receipt SHA-256 is
`75583dd7bb3dee88800b2cd6bfaedcfcc0dff86ba4f25cab94460f2103d376dc`.
The original receipt and log are retained in a private local directory.
Component and solver cleanup lists are empty. Independent exact ownership-label,
network, image-tag and unit-link queries confirmed absence after failure.

Separate invocation-owned, network-isolated native Docker diagnostics then
compared creation, first start, restart inhibition and terminal observations.
They found three representation transitions relevant to the fixture:

- `HostConfig.OomKillDisable` changed from own `false` to own `null` on first
  start; the remaining host configuration was unchanged.
- The sole created network endpoint had an empty `NetworkID`; its running and
  later observations matched the independently captured owned network ID.
- Native top-level `Mounts` array order could change. Every full mount entry was
  unchanged when compared by its unique destination. No mount field was dropped
  from that comparison.

Each diagnostic used new owned resources, retained its private observations and
verified successful owned cleanup. These diagnostics explain individual native
representation mismatches; they are not successful combined acceptance.

Astra approved a bounded correction: bind the fixture to a freshly inspected
coherent running baseline immediately after its exact-ID start, allow only the
observed startup OOM representation transition, validate the created endpoint
against the owned network and require the captured ID after start. Canonicalize
complete source mount entries by validated unique destination in derived source
identity projections, including composed inventory comparisons; preserve raw
observations, every field and unrelated-member strictness. Later configuration,
network or mount-field drift must still refuse. Implementation, independent
review and a new exact-SHA physical retry remain required.

## Shared mount-order finding before the next retry

A further read-only exact-container observation repeated native Caddy inspection
20 times without service/configuration effects. It produced four distinct hashes
for native mount array order and one hash for the complete mount entries sorted
by destination. Configuration, host settings and process identity each retained
one hash. Only hashes/schema metadata were exported to the private audit.

This disproves the earlier assumption that unrelated mount order should remain
an identity discriminator. It also affects the fixture's Caddy member, so a
source-only exception cannot complete native acceptance. Astra approved one shared
inventory mount projection for every native container: validate complete entries
and canonical absolute unique destinations, sort a new array, preserve every
field/value and leave raw inputs untouched. Caddy's separate ingress identity
must use that same projection. Source raw-member recognition and parked
full-member/lifecycle validation remain required. Actual unrelated field,
membership, security and process drift must still refuse.

The order-only unrelated refusal will be replaced with permutation acceptance;
duplicate, malformed, missing/additional and per-target-field fault tests remain
required. Historical source-only receipts describe their original bounded
contract and are not current proof for a superseded order-only check. The shared
correction, its independent review and the new exact-SHA fixture retry remain
open. No combined native acceptance or production change is claimed here.

## Passing combined native acceptance

Exact `6f6f424e2d5ebf7c52f55e49131c492b535f22ac` passed
`tool-remote-scripts:test:source-exclusion` under the canonical h2 heavy lock:
**exit 0, 3m 50s**, uncached. The owned isolated worktree reused the existing
node_modules only after exact package.json and bun.lock comparisons; no fresh
frozen dependency installation is claimed.

The native runner observed real source and descendant SQLite writes, rejected an
actual mutable-tag substitution, completed the joint ingress/source/solver/prod
managed exclusion callback, observed **44 actual namespace scanners DONE and
REAPED**, refused an unrelated mounted child and verified source-token expiry.
Its exact result is source-managed-excluded, activation blocked. Both component
and outer cleanup completed with zero recorded failures.

Independent read-only queries confirmed absence of both owned container-label
universes and all eight recorded container IDs, both owned networks, the exact
temporary image tag and the exact owned unit link. Scratch source/database/state
files and original logs remain private for review. No production deployment,
adoption, semantic activation or public exposure was performed.

The [hash-only receipt](evidence/source-exclusion-acceptance/host-6f6f424e2.json)
binds the original private receipt, log and independent cleanup record. The
private receipt SHA256 is
`de452589263ce5b9f1f8c6c1565c0a9de92690e3a760842571907a57314b512c`.
The earlier failed attempts remain historical failed evidence.

Before host execution the integrated production modules matched the independently
reviewed source packet byte-for-byte. Root focused integration checks passed:
**213 tests / 507 assertions** across six files, then **4 composed restoration
cases / 8,422 assertions**. Independent Astra review separately passed 127 native
identity tests plus five composed/parked cases and inspected all twelve current
mount-identity omission receipts.

This closes the bounded native source fixture acceptance at that exact SHA. It
does not exercise the subsequently integrated source-input/migration-artifact
observers or establish independently prepared real release artifacts, installed
writer adoption, activation/restoration/handoff, normal controller resumption,
the final integrated host gate or CI. Parent O4/10.2 and the delivery goal remain
open.

## Bun 1.4.4 coordinator and real peer rerun — 2026-10-24

Exact reviewed `f6d5c954da670de374c967d17148f5af895d039a` passed the uncached owned source-exclusion target under the canonical h2 heavy lock in **3m55s**. Before it, real source and bundled production listeners passed **six cross-process SO_PEERCRED tests / 69 assertions** using the verified Bun **1.4.4** executable. The [redacted receipt](evidence/source-exclusion-acceptance/host-f6d5-bun144.json) retains the runtime and private evidence hashes.

The protected callback completed, all **44 native scanners** reported DONE and REAPED, the source token expired, and component/outer cleanup reported zero failures. A separate read-only Docker Engine/systemd check established **eight exact containers, two exact networks, both owned label sets, the source tag and unit link absent**; the unit was not-found/inactive/dead with MainPID 0 and no cgroup. The runtime checksum still matched afterward.

The initial immediate refusal and two bounded queue expiries each returned 75 before a test started. R3 began only after the prior holder exited and acquired the lock with zero wait. Those refusals remain preserved as resource contention, not behavioral failures.

This rerun measures the Bun 1.4.4 coordinator/supervisor with the unchanged immutable fixture source image. It does not establish application startup on a new Bun 1.4.4 source image, the subsequently added complete reader audit, atomic activation, the full exact-SHA host gate or production delivery. Production stores and services were not changed.
