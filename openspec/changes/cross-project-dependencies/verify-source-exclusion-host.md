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
