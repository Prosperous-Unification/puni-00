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
