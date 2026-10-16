# Organization DNS resolver

`ORGANIZATION_DNS_RESOLVERS` is optional. Absence retains explicit DNS refusal. A present value must contain one to three distinct, comma-separated bare IP literals; whitespace, hostnames, URLs, ports, scopes, empty entries and equivalent duplicates fail startup. IPv6 literals have no brackets. Operator-controlled private recursive resolver addresses are allowed. No discovery happens at boot and no OS resolver fallback exists.

The setting does not activate organizations, browser authority or retained-proof scheduling. Existing authorization and activation checks run before lookup. Failed DNS yields `503 dns_unavailable`; a complete authoritative SOA-backed negative yields the existing proof mismatch refusal. Neither establishes ownership.

The adapter discovers the closest enclosing NS owner, resolves exact NS address owners recursively, and connects to validated IPs on UDP/TCP port 53. It does not follow aliases or consume additional-section glue. Permit both UDP and TCP egress. Excess authority/address counts and unsupported response types are unavailable. AA is protocol evidence without DNSSEC authentication or agreement across all authorities.

The adapter reserves cleanup inside the unchanged five-second HTTP bound: work ends by 4,800ms, settlement by 4,900ms; attempts reserve 900ms for work and up to 100ms for acknowledged closure. UDP and TCP share one attempt. A failed or unacknowledged close is terminal cleanup failure with closure explicitly unconfirmed, never a successful proof or an ordinary absence. Caller cancellation stops work immediately and waits only for bounded cleanup.

## Dependency boundary

be-01 owns exact `dns-packet@5.6.1` and development declarations `@types/dns-packet@5.6.5` (MIT). Bun locks the codec's `@leichtgewicht/ip-codec@2.0.5` dependency (MIT). The declaration supplement describes reviewed low-level name/question APIs omitted by the upstream declarations. IP decoding receives only exact four/sixteen-byte RDATA; its permissive text encoders are not used to validate destinations.

The codec alone is insufficient. The private adapter preflight bounds allocation, supported dispatch, label identity, compression, RDATA spans and total consumption before high-level decoding. Its implementation and proofs remain next to its symbols. The reviewed amendment is in [the change design](../openspec/changes/organization-authoritative-dns/design.md).

Source SHA-256 reviewed on 2026-10-16:

- `dns-packet@5.6.1/index.js`: `dd9d08eac52a0dc5f8214ab188b661bb66b20acaa02e1e812e0400d588aaefd3`.
- Rejected alternative `dns-message@1.1.1/dist/dns-message.mjs`: `360ee1afdd9f256eb3ec1673e1ab8f5ba618ae7a4fa9a0db7f114e428c08f51a`.

The [executable candidate characterization](../openspec/changes/organization-authoritative-dns/codec-review/reproduce.mjs) reproduces embedded-dot identity loss, allocation before rejection, NS span overrun, cyclic compression handling and excessive expanded names. Run it from a disposable directory containing a Bun installation of exact `dns-packet@5.6.1` and `dns-message@1.1.1`. It verifies upstream assumptions and is not an adapter safety proof.

## Destination classification snapshot

The [IANA IPv4 special-purpose registry](https://www.iana.org/assignments/iana-ipv4-special-registry/) and [IANA IPv6 special-purpose registry](https://www.iana.org/assignments/iana-ipv6-special-registry/) were read on 2026-10-16; both reported last update 2025-10-09. The policy conservatively refuses every special-purpose allocation, including globally reachable special services. IPv4 also excludes multicast/reserved space; IPv6 requires ordinary `2000::/3` unicast and excludes special allocations within it. Mapped IPv4 is classified as IPv4. This eligibility policy does not promise actual reachability.

## Pending external acceptance

Operators still need to choose recursive resolvers, authorize egress and deploy the configuration. An attended disposable real-domain positive/mismatch/outage/rotation exercise, organization/browser activation acceptance, automatic retained-proof scheduling, hosted CI and the canonical exact-SHA host gate remain separate obligations. Local protocol fixtures and disposable SQLite do not close WBS010.5.4 or establish live-domain ownership.
