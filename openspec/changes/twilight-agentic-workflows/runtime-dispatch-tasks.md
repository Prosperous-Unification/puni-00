# Runtime dispatch packet

The [intent](runtime-dispatch-intent.md) and [design](runtime-dispatch-design.md) connect
the existing durable records to actual receiver calls and turns. Each independent
composition gets its own test/review slice; no parent bridge/S0/S7a gate closes until
its complete acceptance requirements are met.

- [x] Correlated original-body receiver client, through [client tasks](runtime-client-tasks.md).
- [ ] Authority delivery: RED commit-before-POST, exact historical duplicate lookup/acceptance,
      unchanged sticky pending on404/refusal/cancellation, concurrent original-evidence
      preservation and old-epoch grant refusal; implement design section2 using actual stores.
- [ ] Prepared claim delivery: RED committed locator and exact session claim, immutable
      retry bytes/state evidence, distinct local command IDs, lookup-only duplicate delivery
      and actual coupled receipt acceptance; implement design section3 without ordinary fallback.
- [ ] Fresh turn and real boot integration: RED actual current claim/grant/live locator
      refusal, only-new-stage dispatch, complete reply retention and no successor/capacity
      release; implement design sections4–5 including real booted receiver/Dash worker and
      explicit test selection dependency. Complete independent packet review and exact-SHA gates.

Exact outcome/write/release, supported recovery/fencing, remaining adapters and CTT
coordinator are subsequent required parent work. This packet neither removes those
requirements nor provides production deployment authority.
